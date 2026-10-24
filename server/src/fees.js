const { db, getSettings } = require('./db');
const { addDays } = require('./util');

/**
 * Consultation fees. Every consultation is charged, except follow-ups within the free window:
 * a paid consultation covers any visit up to `consultation_free_days` days after it.
 * Fees are collected at the clinic (cash, UPI, card), or covered by a paid booking deposit.
 */
const PAY_METHODS = ['cash', 'upi', 'card', 'deposit', 'online', 'other'];

async function terms() {
  const s = await getSettings();
  return {
    amount: Math.max(0, Math.round(Number(s.consultation_fee) || 0)),
    freeDays: Math.max(0, Math.round(Number(s.consultation_free_days) || 0)),
  };
}

/** The latest consultation this patient paid for on or before `date` (other than `exceptId`). */
function lastPaid(patientId, date, exceptId) {
  return db.appointments
    .find({ patient_id: patientId, 'fee.status': 'paid', date: { $lte: date }, ...(exceptId ? { _id: { $ne: exceptId } } : {}) })
    .sort({ date: -1 })
    .limit(1)
    .next();
}

/**
 * What a consultation on `date` costs this patient: `{ amount, status, free_until?, covered_by? }`.
 * status is 'due', 'free_followup' (inside the window) or 'none' (no fee configured).
 */
async function quote(patientId, date, exceptId) {
  const t = await terms();
  if (!t.amount) return { amount: 0, status: 'none' };
  if (patientId && t.freeDays) {
    const prev = await lastPaid(patientId, date, exceptId);
    if (prev) {
      const freeUntil = addDays(prev.date, t.freeDays);
      if (date <= freeUntil) return { amount: 0, status: 'free_followup', free_until: freeUntil, covered_by: prev._id };
    }
  }
  return { amount: t.amount, status: 'due' };
}

/** A fresh fee for an appointment that hasn't been settled. Settled fees (paid, waived) never change. */
async function refresh(appt) {
  if (appt.fee && ['paid', 'waived'].includes(appt.fee.status)) return appt.fee;
  const q = await quote(appt.patient_id, appt.date, appt._id);
  const fee = { ...q, ...(appt.fee?.status === 'due' && q.status === 'due' ? { amount: appt.fee.amount || q.amount } : {}) };
  // A paid booking deposit covers the fee.
  if (fee.status === 'due' && appt.deposit && ['paid', 'adjusted'].includes(appt.deposit.status) && appt.deposit.amount >= fee.amount) {
    Object.assign(fee, { status: 'paid', method: 'deposit', paid_at: appt.deposit.paid_at || new Date() });
  }
  const changed = JSON.stringify(fee) !== JSON.stringify(appt.fee || null);
  if (changed) await db.appointments.updateOne({ _id: appt._id }, { $set: { fee } });
  return fee;
}

module.exports = { quote, refresh, terms, PAY_METHODS };
