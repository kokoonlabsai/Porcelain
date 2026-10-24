const { db, getSettings } = require('./db');
const razorpay = require('./razorpay');
const mail = require('./mail');
const { weekdayOf } = require('./slots');
const { toMinutes } = require('./util');

/**
 * Booking deposits: a Razorpay payment that secures procedure and weekend slots booked online.
 * The slot is held while the patient pays; the deposit is adjusted against the bill at the visit,
 * refunded if they cancel early enough (or the clinic cancels), and kept for late cancellations and no-shows.
 */
const HOLD_MS = 15 * 60_000;

/** The deposit (in rupees) this online booking needs, or 0. Staff bookings never need one. */
async function depositFor({ date, concern }, actor) {
  if (actor && actor.role !== 'patient') return 0;
  if (!razorpay.enabled()) return 0;
  const s = await getSettings();
  const amount = Math.max(0, Math.round(Number(s.deposit_amount) || 0));
  if (!amount) return 0;
  const weekend = [0, 6].includes(weekdayOf(date));
  const procedure = concern === 'procedure';
  return (procedure && s.deposit_procedures === '1') || (weekend && s.deposit_weekends === '1') ? amount : 0;
}

/** Hours from now until the appointment starts (clinic local time). */
function hoursUntil(appt) {
  const [y, m, d] = appt.date.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, toMinutes(appt.start_time));
  return (start - Date.now()) / 3_600_000;
}

/**
 * Marks a deposit paid (checkout handler, webhook or reconciliation). Safe to call twice.
 * A payment that lands after the hold expired revives the booking and asks staff to check the slot.
 */
async function markDepositPaid(appt, paymentId, via) {
  const now = new Date();
  const revived = appt.status === 'cancelled' && appt.cancel_reason === 'deposit_timeout';
  const r = await db.appointments.updateOne(
    { _id: appt._id, 'deposit.status': { $nin: ['paid', 'adjusted', 'refunded', 'forfeited'] } },
    {
      $set: {
        'deposit.status': 'paid', 'deposit.payment_id': paymentId, 'deposit.paid_at': now, 'deposit.paid_via': via, status: 'booked',
        ...(revived ? { staff_note: 'Deposit paid after the hold expired — please check this slot.' } : {}),
      },
      $unset: { cancel_reason: '' },
    }
  );
  if (!r.modifiedCount) return false;
  const patient = await db.users.findOne({ _id: appt.patient_id });
  if (patient?.email) mail.bookingConfirmation(patient, { ...appt, status: 'booked' }).catch(() => {});
  return true;
}

/** Asks Razorpay whether the deposit's order was paid; returns the payment or null. Throws if unreachable. */
async function findPayment(appt) {
  const { items = [] } = await razorpay.orderPayments(appt.deposit.razorpay_order_id);
  return items.find((p) => p.status === 'captured' || p.status === 'authorized') || null;
}

/** Frees slots held by deposits nobody paid — after checking with Razorpay first. */
async function expireUnpaidDeposits() {
  if (!razorpay.enabled()) return 0;
  const stale = await db.appointments.find({ status: 'pending_payment', created_at: { $lt: new Date(Date.now() - HOLD_MS) } }).toArray();
  let expired = 0;
  for (const a of stale) {
    try {
      const paid = await findPayment(a);
      if (paid) { await markDepositPaid(a, paid.id, 'reconcile'); continue; }
    } catch {
      continue; // Razorpay unreachable: decide on the next run.
    }
    const r = await db.appointments.updateOne(
      { _id: a._id, status: 'pending_payment' },
      { $set: { status: 'cancelled', cancel_reason: 'deposit_timeout', 'deposit.status': 'failed' } }
    );
    if (r.modifiedCount) expired++;
  }
  return expired;
}

/** Refunds a paid deposit in full. Throws (and changes nothing) if Razorpay refuses. */
async function refundDeposit(appt) {
  const r = await razorpay.refund(appt.deposit.payment_id, appt.deposit.amount * 100);
  await db.appointments.updateOne({ _id: appt._id }, { $set: { 'deposit.status': 'refunded', 'deposit.refund_id': r.id, 'deposit.refunded_at': new Date() } });
}

const depositPaid = (a) => a.deposit?.status === 'paid';

module.exports = { depositFor, markDepositPaid, findPayment, expireUnpaidDeposits, refundDeposit, hoursUntil, depositPaid, HOLD_MS };
