const express = require('express');
const bcrypt = require('bcryptjs');
const { Binary } = require('mongodb');
const { db, oid, out, contains, newUser, ObjectId } = require('../db');
const { normalizePhone } = require('../phone');
const { createAppointment, CONCERNS } = require('../appointments');
const { slotsFor } = require('../slots');
const { latestVisits } = require('../jobs');
const { visitDetails, ATTACHMENT_FIELDS } = require('../records');
const { applyPackageSessions, packagesForPatient } = require('./packages');
const mail = require('../mail');
const deposits = require('../deposits');
const fees = require('../fees');
const {
  HttpError, wrap, requireStaff, requireAuth, today, addDays, isISODate, isTime, str, isEmail, tempPassword, publicUser,
} = require('../util');

/** Doctors, reception/pharmacy and admins. Writing prescriptions is for doctors and admins. */
const router = express.Router();
router.use(requireStaff());
const clinician = requireAuth('doctor', 'admin');
const canSeePrivate = (u) => u.role === 'doctor' || u.role === 'admin';
const STATUSES = ['booked', 'checked_in', 'completed', 'cancelled', 'no_show'];

/** Visits whose prescription still has something to hand over. */
const PENDING = { items: { $elemMatch: { dispensed: false } } };

// ---------- Dashboard ----------

router.get(
  '/dashboard',
  wrap(async (req, res) => {
    const t = today();
    const counts = Object.fromEntries(
      (await db.appointments.aggregate([{ $match: { date: t } }, { $group: { _id: '$status', n: { $sum: 1 } } }]).toArray()).map((c) => [c._id, c.n])
    );
    const pharmacy = await db.visits.countDocuments({ date: { $gte: addDays(t, -30) }, ...PENDING });

    // Patients whose follow-up is due within a week (or overdue) and who haven't booked since.
    const due = await latestVisits({ follow_up_date: { $gte: addDays(t, -30), $lte: addDays(t, 7) } });
    const followUps = [];
    for (const v of due.sort((a, b) => a.follow_up_date.localeCompare(b.follow_up_date)).slice(0, 50)) {
      const booked = await db.appointments.findOne({
        patient_id: v.patient_id, date: { $gte: v.date }, _id: { $ne: v.appointment_id || null }, status: { $in: ['booked', 'checked_in', 'completed'] },
      });
      if (booked) continue;
      const u = await db.users.findOne({ _id: v.patient_id }, { projection: { name: 1, phone: 1 } });
      if (u) followUps.push({ visit_id: String(v._id), follow_up_date: v.follow_up_date, diagnosis: v.diagnosis, patient_id: String(u._id), name: u.name, phone: u.phone });
    }
    const since = new Date(Date.now() - 30 * 86_400_000);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [collected] = await db.appointments.aggregate([
      { $match: { 'fee.status': 'paid', 'fee.paid_at': { $gte: startOfDay }, 'fee.method': { $ne: 'deposit' } } },
      { $group: { _id: null, total: { $sum: '$fee.amount' }, count: { $sum: 1 } } },
    ]).toArray();
    res.json({
      today: {
        total: (counts.booked || 0) + (counts.checked_in || 0) + (counts.completed || 0),
        waiting: counts.booked || 0,
        checked_in: counts.checked_in || 0,
        completed: counts.completed || 0,
      },
      pharmacy_pending: pharmacy,
      follow_ups: followUps,
      new_patients_30d: await db.users.countDocuments({ role: 'patient', created_at: { $gte: since } }),
      fees_today: { total: collected?.total || 0, count: collected?.count || 0 },
    });
  })
);

// ---------- Appointments ----------

router.get(
  '/appointments',
  wrap(async (req, res) => {
    const from = isISODate(req.query.from) ? req.query.from : isISODate(req.query.date) ? req.query.date : today();
    const to = isISODate(req.query.to) ? req.query.to : from;
    const rows = await db.appointments.aggregate([
      { $match: { date: { $gte: from, $lte: to } } },
      { $sort: { date: 1, start_time: 1 } },
      { $lookup: { from: 'users', localField: 'patient_id', foreignField: '_id', as: 'u' } },
      { $unwind: '$u' },
      { $lookup: { from: 'visits', localField: 'patient_id', foreignField: 'patient_id', as: 'v', pipeline: [{ $project: { appointment_id: 1 } }] } },
      {
        $addFields: {
          name: '$u.name', phone: '$u.phone', email: '$u.email',
          has_account: { $ne: [{ $ifNull: ['$u.password_hash', null] }, null] },
          visit_count: { $size: '$v' },
          visit_id: { $first: { $map: { input: { $filter: { input: '$v', cond: { $eq: ['$$this.appointment_id', '$_id'] } } }, in: '$$this._id' } } },
        },
      },
      { $project: { u: 0, v: 0 } },
    ]).toArray();
    // Fees can change after booking (an earlier visit got paid, a deposit arrived), so refresh open ones.
    for (const r of rows) if (!['cancelled', 'no_show', 'pending_payment'].includes(r.status)) r.fee = await fees.refresh(r);
    res.json({ appointments: out(rows) });
  })
);

/** Phone bookings and walk-ins. Staff may book past or short-notice slots. */
router.post(
  '/appointments',
  wrap(async (req, res) => {
    const { appointment, patient } = await createAppointment(req.body || {}, req.user);
    if (patient.email && appointment.status === 'booked' && appointment.date > today()) {
      mail.bookingConfirmation(patient, appointment).catch(() => {});
    }
    res.status(201).json({ appointment: out(appointment), patient: publicUser(patient) });
  })
);

/** Record the consultation fee as paid (reception), or waive it (doctors and admins). */
router.post(
  '/appointments/:id/fee',
  wrap(async (req, res) => {
    const a = await db.appointments.findOne({ _id: oid(req.params.id) });
    if (!a) throw new HttpError(404, 'Appointment not found');
    const fee = await fees.refresh(a);
    const { action, method } = req.body || {};
    const now = new Date();
    if (action === 'collect') {
      if (fee.status !== 'due') throw new HttpError(409, fee.status === 'paid' ? 'The fee is already paid' : 'There’s no fee to collect for this visit');
      if (!fees.PAY_METHODS.includes(method) || method === 'deposit') throw new HttpError(422, 'How was it paid?');
      await db.appointments.updateOne({ _id: a._id }, { $set: { fee: { amount: fee.amount, status: 'paid', method, paid_at: now, collected_by: req.user._id } } });
    } else if (action === 'waive') {
      if (!canSeePrivate(req.user)) throw new HttpError(403, 'Only doctors and admins can waive a fee');
      if (fee.status === 'paid') throw new HttpError(409, 'The fee is already paid');
      await db.appointments.updateOne({ _id: a._id }, { $set: { fee: { amount: fee.amount, status: 'waived', waived_at: now, waived_by: req.user._id, reason: str(req.body.reason, 200) } } });
    } else if (action === 'undo') {
      if (!['paid', 'waived'].includes(fee.status) || fee.method === 'deposit') throw new HttpError(409, 'Nothing to undo');
      await db.appointments.updateOne({ _id: a._id }, { $set: { fee: { amount: fee.amount, status: 'due' } } });
    } else {
      throw new HttpError(422, 'Unknown action');
    }
    res.json({ fee: out(await fees.refresh(await db.appointments.findOne({ _id: a._id }))) });
  })
);

router.patch(
  '/appointments/:id',
  wrap(async (req, res) => {
    const a = await db.appointments.findOne({ _id: oid(req.params.id) });
    if (!a) throw new HttpError(404, 'Appointment not found');
    const { status, date, start_time } = req.body || {};
    const set = {};
    if (status !== undefined) {
      if (!STATUSES.includes(status)) throw new HttpError(422, 'Unknown status');
      if (a.status === 'pending_payment') throw new HttpError(409, 'This booking is waiting for its deposit');
      set.status = status;
      // Deposits: the clinic cancelling refunds it (unless told not to); a no-show keeps it; a visit uses it.
      if (deposits.depositPaid(a)) {
        if (status === 'cancelled' && req.body.refund_deposit !== false) {
          try {
            await deposits.refundDeposit(a);
          } catch (e) {
            throw new HttpError(502, `The deposit refund didn’t go through (${e.message}). Nothing was changed — try again, or refund from the Razorpay dashboard.`);
          }
        } else if (status === 'cancelled' || status === 'no_show') set['deposit.status'] = 'forfeited';
        else if (status === 'completed') set['deposit.status'] = 'adjusted';
      }
    }
    if (date !== undefined || start_time !== undefined) {
      if (!isISODate(date) || !isTime(start_time)) throw new HttpError(422, 'Pick a date and time');
      const slot = (await slotsFor(date, { forStaff: true })).find((s) => s.start === start_time);
      if (!slot) throw new HttpError(409, 'That time isn’t in the schedule');
      const sameSlot = a.date === date && a.start_time === start_time;
      if (!sameSlot && !slot.available) throw new HttpError(409, 'That slot is full');
      Object.assign(set, { date, start_time, end_time: slot.end, reminder_sent: false });
    }
    if (Object.keys(set).length) await db.appointments.updateOne({ _id: a._id }, { $set: set });
    res.json({ appointment: out(await db.appointments.findOne({ _id: a._id })) });
  })
);

// ---------- Patients ----------

router.get(
  '/patients',
  wrap(async (req, res) => {
    const q = str(req.query.q, 100);
    const match = { role: 'patient' };
    if (q) {
      const digits = q.replace(/\D/g, '');
      match.$or = [{ name: contains(q) }, ...(digits.length >= 3 ? [{ phone: contains(digits) }] : [])];
    }
    const rows = await db.users.aggregate([
      { $match: match },
      {
        $lookup: {
          from: 'visits', localField: '_id', foreignField: 'patient_id', as: 'v',
          pipeline: [{ $project: { date: 1, pending: { $size: { $filter: { input: { $ifNull: ['$items', []] }, cond: { $eq: ['$$this.dispensed', false] } } } } } }],
        },
      },
      {
        $project: {
          name: 1, phone: 1, email: 1, gender: 1, dob: 1, created_at: 1,
          has_account: { $ne: [{ $ifNull: ['$password_hash', null] }, null] },
          last_visit: { $max: '$v.date' },
          visit_count: { $size: '$v' },
          pending_items: { $sum: '$v.pending' },
        },
      },
      { $addFields: { recent: { $ifNull: ['$last_visit', { $dateToString: { date: '$created_at', format: '%Y-%m-%d' } }] } } },
      { $sort: { recent: -1, _id: -1 } },
      { $limit: 50 },
      { $project: { recent: 0 } },
    ]).toArray();
    res.json({ patients: out(rows) });
  })
);

function patientFields(body) {
  const errors = {};
  const f = {};
  if (body.name !== undefined) {
    f.name = str(body.name, 120);
    if (!f.name) errors.name = 'Name is required';
  }
  if (body.phone !== undefined) {
    f.phone = normalizePhone(body.phone);
    if (!f.phone) errors.phone = 'Enter a valid phone number';
  }
  if (body.email !== undefined) {
    f.email = str(body.email, 200);
    if (f.email && !isEmail(f.email)) errors.email = 'That email doesn’t look right';
  }
  if (body.gender !== undefined) f.gender = str(body.gender, 20);
  if (body.dob !== undefined) {
    f.dob = str(body.dob, 10);
    if (f.dob && !isISODate(f.dob)) errors.dob = 'Use a valid date';
  }
  if (body.notes !== undefined) f.notes = str(body.notes, 4000);
  if (Object.keys(errors).length) throw new HttpError(422, 'Please check the highlighted fields', errors);
  return f;
}

/** Gives the patient a login with a temporary password (or resets it). The password is shown once. */
async function issueTempPassword(patient, { sendEmail = true } = {}) {
  const password = tempPassword();
  await db.users.updateOne({ _id: patient._id }, { $set: { password_hash: await bcrypt.hash(password, 10), must_change_password: true } });
  let emailed = false;
  if (sendEmail && patient.email) emailed = (await mail.welcome(patient, password)).sent;
  return { password, emailed };
}

router.post(
  '/patients',
  wrap(async (req, res) => {
    const f = patientFields({ name: '', phone: '', ...req.body });
    const patient = newUser(f);
    try {
      await db.users.insertOne(patient);
    } catch (e) {
      if (e.code === 11000) throw new HttpError(409, 'A patient with this number already exists', { phone: 'Already registered' });
      throw e;
    }
    const account = req.body?.create_account ? await issueTempPassword(patient) : null;
    res.status(201).json({ patient: publicUser(await db.users.findOne({ _id: patient._id })), account });
  })
);

async function loadPatient(id) {
  const p = await db.users.findOne({ _id: oid(String(id ?? '')), role: 'patient' });
  if (!p) throw new HttpError(404, 'Patient not found');
  return p;
}

router.get(
  '/patients/:id',
  wrap(async (req, res) => {
    const p = await loadPatient(req.params.id);
    const showPrivate = canSeePrivate(req.user);
    const [appointments, visits, photos] = await Promise.all([
      db.appointments.find({ patient_id: p._id }).sort({ date: -1, start_time: -1 }).toArray(),
      db.visits.find({ patient_id: p._id }).sort({ date: -1, _id: -1 }).toArray(),
      db.attachments.find({ patient_id: p._id }, { projection: ATTACHMENT_FIELDS }).sort({ created_at: -1 }).toArray(),
    ]);
    res.json({
      patient: { ...publicUser(p), notes: showPrivate ? p.notes : undefined },
      appointments: out(appointments),
      visits: await Promise.all(visits.map((v) => visitDetails(v, { showPrivate }))),
      photos: out(photos),
      packages: await packagesForPatient(p._id),
    });
  })
);

router.patch(
  '/patients/:id',
  wrap(async (req, res) => {
    const p = await loadPatient(req.params.id);
    const f = patientFields(req.body || {});
    if (f.notes !== undefined && !canSeePrivate(req.user)) delete f.notes;
    if (Object.keys(f).length) {
      try {
        await db.users.updateOne({ _id: p._id }, { $set: f });
      } catch (e) {
        if (e.code === 11000) throw new HttpError(409, 'Another person already uses this number', { phone: 'Already registered' });
        throw e;
      }
    }
    res.json({ patient: publicUser(await db.users.findOne({ _id: p._id })) });
  })
);

router.post(
  '/patients/:id/account',
  wrap(async (req, res) => {
    const p = await loadPatient(req.params.id);
    const account = await issueTempPassword(p, { sendEmail: req.body?.send_email !== false });
    res.json({ account, patient: publicUser(await db.users.findOne({ _id: p._id })) });
  })
);

// ---------- Visits & prescriptions ----------

const ITEM_FIELDS = ['medicine', 'kind', 'dosage', 'frequency', 'duration', 'instructions', 'quantity'];
const ITEM_LIMITS = { medicine: 200, kind: 40, dosage: 100, frequency: 100, duration: 100, instructions: 500, quantity: 50 };

function cleanItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((i) => ({ id: oid(i?.id), product_id: oid(String(i?.product_id || '')), ...Object.fromEntries(ITEM_FIELDS.map((k) => [k, str(i?.[k], ITEM_LIMITS[k])])) }))
    .filter((i) => i.medicine);
}

const newItem = (i) => ({
  _id: new ObjectId(), product_id: i.product_id || null, ...Object.fromEntries(ITEM_FIELDS.map((k) => [k, i[k]])), dispensed: false, dispensed_at: null, dispensed_by: null,
});

function visitFields(body) {
  const follow = str(body.follow_up_date, 10);
  if (follow && !isISODate(follow)) throw new HttpError(422, 'Follow-up date is not valid', { follow_up_date: 'Pick a valid date' });
  const date = str(body.date, 10) || today();
  if (!isISODate(date)) throw new HttpError(422, 'Visit date is not valid');
  return {
    date,
    concern: CONCERNS.includes(body.concern) ? body.concern : null,
    complaint: str(body.complaint, 4000),
    diagnosis: str(body.diagnosis, 2000),
    procedure_done: str(body.procedure_done, 2000),
    advice: str(body.advice, 4000),
    private_notes: str(body.private_notes, 8000),
    follow_up_date: follow,
  };
}

async function loadVisit(id) {
  const v = await db.visits.findOne({ _id: oid(String(id ?? '')) });
  if (!v) throw new HttpError(404, 'Visit not found');
  return v;
}

router.post(
  '/visits',
  clinician,
  wrap(async (req, res) => {
    const b = req.body || {};
    const patient = await loadPatient(b.patient_id);
    const f = visitFields(b);
    let appointmentId = null;
    if (b.appointment_id) {
      const a = await db.appointments.findOne({ _id: oid(String(b.appointment_id)), patient_id: patient._id });
      if (!a) throw new HttpError(404, 'Appointment not found');
      appointmentId = a._id;
      f.concern = f.concern || a.concern;
      f.complaint = f.complaint || a.description;
    }
    const now = new Date();
    const visit = {
      patient_id: patient._id, appointment_id: appointmentId, doctor_id: req.user._id, ...f,
      items: cleanItems(b.items).map(newItem), follow_up_reminded: false, created_at: now, updated_at: now,
    };
    await db.visits.insertOne(visit);
    if (appointmentId) {
      await db.appointments.updateOne({ _id: appointmentId }, { $set: { status: 'completed' } });
      // The deposit counts towards today's bill.
      await db.appointments.updateOne({ _id: appointmentId, 'deposit.status': 'paid' }, { $set: { 'deposit.status': 'adjusted' } });
    }
    await applyPackageSessions(visit, b.package_sessions);
    if (b.send_email && patient.email) await mail.visitSummary(patient, visit, visit.items);
    res.status(201).json({ visit: await visitDetails(visit, { showPrivate: true }) });
  })
);

router.get(
  '/visits/:id',
  wrap(async (req, res) => {
    const v = await loadVisit(req.params.id);
    const patient = await db.users.findOne({ _id: v.patient_id });
    res.json({ visit: await visitDetails(v, { showPrivate: canSeePrivate(req.user) }), patient: publicUser(patient) });
  })
);

/** Edit a visit. Medicines already handed over are always kept; the rest follow the list sent. */
router.put(
  '/visits/:id',
  clinician,
  wrap(async (req, res) => {
    const v = await loadVisit(req.params.id);
    const f = visitFields({ ...v, ...req.body });
    const set = { ...f, updated_at: new Date() };
    if (f.follow_up_date !== v.follow_up_date) set.follow_up_reminded = false;
    if (req.body?.items !== undefined) {
      const sent = cleanItems(req.body.items);
      const existing = v.items || [];
      const items = sent.map((i) => {
        const own = i.id && existing.find((e) => e._id.equals(i.id));
        return own ? { ...own, product_id: i.product_id || null, ...Object.fromEntries(ITEM_FIELDS.map((k) => [k, i[k]])) } : newItem(i);
      });
      // Handed-over medicines that weren't in the list stay on the record.
      for (const e of existing) if (e.dispensed && !items.some((i) => i._id.equals(e._id))) items.push(e);
      set.items = items;
    }
    await db.visits.updateOne({ _id: v._id }, { $set: set });
    const saved = await db.visits.findOne({ _id: v._id });
    await applyPackageSessions(saved, req.body?.package_sessions);
    res.json({ visit: await visitDetails(saved, { showPrivate: true }) });
  })
);

router.delete(
  '/visits/:id',
  clinician,
  wrap(async (req, res) => {
    const v = await loadVisit(req.params.id);
    await Promise.all([db.visits.deleteOne({ _id: v._id }), db.attachments.deleteMany({ visit_id: v._id })]);
    res.json({ ok: true });
  })
);

router.post(
  '/visits/:id/email',
  wrap(async (req, res) => {
    const v = await loadVisit(req.params.id);
    const patient = await db.users.findOne({ _id: v.patient_id });
    if (!patient.email) throw new HttpError(422, 'Add the patient’s email first');
    const result = await mail.visitSummary(patient, v, v.items || []);
    if (!result.sent) throw new HttpError(503, result.reason === 'smtp not configured' ? 'Email isn’t set up on the server yet (SMTP settings)' : 'The email could not be sent');
    res.json({ ok: true });
  })
);

/** Medicines the doctor has prescribed before, for quick-add while writing a prescription. */
router.get(
  '/medicines',
  wrap(async (req, res) => {
    const q = str(req.query.q, 100) || '';
    const rows = await db.visits.aggregate([
      { $match: { 'items.medicine': contains(q) } },
      { $sort: { _id: -1 } },
      { $limit: 500 },
      { $unwind: '$items' },
      { $match: { 'items.medicine': contains(q) } },
      { $group: { _id: { $toLower: '$items.medicine' }, item: { $first: '$items' }, uses: { $sum: 1 } } },
      { $sort: { uses: -1 } },
      { $limit: 12 },
    ]).toArray();
    const products = q.length >= 2
      ? await db.products.find({ active: true, $or: [{ name: contains(q) }, { brand: contains(q) }] }, { projection: { name: 1, brand: 1, size: 1, price: 1, stock: 1, category: 1, how_to_use: 1 } }).limit(6).toArray()
      : [];
    res.json({
      medicines: rows.map(({ item, uses }) => ({ ...Object.fromEntries(ITEM_FIELDS.filter((k) => k !== 'quantity').map((k) => [k, item[k]])), product_id: item.product_id ? String(item.product_id) : null, uses })),
      products: out(products),
    });
  })
);

// ---------- Photos & reports ----------

const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
const attachmentOut = (a) => {
  const { data: _data, ...rest } = a;
  return out(rest);
};

router.post(
  '/attachments',
  clinician,
  wrap(async (req, res) => {
    const b = req.body || {};
    const patient = await loadPatient(b.patient_id);
    const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data || ''));
    if (!m) throw new HttpError(422, 'Upload a photo or PDF');
    const [, mime, base64] = m;
    if (!ALLOWED.includes(mime)) throw new HttpError(422, 'Use a JPG, PNG, WebP or PDF file');
    const data = Buffer.from(base64, 'base64');
    if (data.length > MAX_BYTES) throw new HttpError(413, 'That file is larger than 6 MB');
    let visitId = null;
    if (b.visit_id) {
      const v = await db.visits.findOne({ _id: oid(String(b.visit_id)), patient_id: patient._id }, { projection: { _id: 1 } });
      if (!v) throw new HttpError(404, 'Visit not found');
      visitId = v._id;
    }
    const doc = {
      patient_id: patient._id, visit_id: visitId, mime, data: new Binary(data), size: data.length,
      caption: str(b.caption, 200), visible_to_patient: b.visible_to_patient !== false, uploaded_by: req.user._id, created_at: new Date(),
    };
    await db.attachments.insertOne(doc);
    res.status(201).json({ attachment: attachmentOut(doc) });
  })
);

router.patch(
  '/attachments/:id',
  clinician,
  wrap(async (req, res) => {
    const _id = oid(req.params.id);
    const set = {};
    if (req.body?.caption !== undefined) set.caption = str(req.body.caption, 200);
    if (req.body?.visible_to_patient !== undefined) set.visible_to_patient = !!req.body.visible_to_patient;
    const a = Object.keys(set).length
      ? await db.attachments.findOneAndUpdate({ _id }, { $set: set }, { returnDocument: 'after', projection: ATTACHMENT_FIELDS })
      : await db.attachments.findOne({ _id }, { projection: ATTACHMENT_FIELDS });
    if (!a) throw new HttpError(404, 'File not found');
    res.json({ attachment: out(a) });
  })
);

router.delete(
  '/attachments/:id',
  clinician,
  wrap(async (req, res) => {
    const { deletedCount } = await db.attachments.deleteOne({ _id: oid(req.params.id) });
    if (!deletedCount) throw new HttpError(404, 'File not found');
    res.json({ ok: true });
  })
);

// ---------- Pharmacy ----------

async function pharmacyRows(match) {
  const rows = await db.visits.aggregate([
    { $match: { ...match, 'items.0': { $exists: true } } },
    { $sort: { date: -1, _id: -1 } },
    { $limit: 60 },
    { $lookup: { from: 'users', localField: 'patient_id', foreignField: '_id', as: 'u', pipeline: [{ $project: { name: 1, phone: 1 } }] } },
    { $lookup: { from: 'users', localField: 'doctor_id', foreignField: '_id', as: 'd', pipeline: [{ $project: { name: 1 } }] } },
    {
      $project: {
        _id: 0, visit_id: '$_id', date: 1, patient_id: 1, diagnosis: 1, items: 1, follow_up_date: 1,
        name: { $first: '$u.name' }, phone: { $first: '$u.phone' }, doctor_name: { $first: '$d.name' },
      },
    },
  ]).toArray();
  return out(rows);
}

/** Prescriptions still waiting to be handed over, newest first. */
router.get(
  '/pharmacy/queue',
  wrap(async (req, res) => {
    res.json({ prescriptions: await pharmacyRows({ date: { $gte: addDays(today(), -30) }, ...PENDING }) });
  })
);

router.get(
  '/pharmacy/search',
  wrap(async (req, res) => {
    const q = str(req.query.q, 100);
    if (!q) return res.json({ prescriptions: [] });
    const digits = q.replace(/\D/g, '');
    const patients = await db.users
      .find({ role: 'patient', $or: [{ name: contains(q) }, ...(digits.length >= 3 ? [{ phone: contains(digits) }] : [])] }, { projection: { _id: 1 } })
      .limit(50)
      .toArray();
    res.json({ prescriptions: await pharmacyRows({ patient_id: { $in: patients.map((p) => p._id) } }) });
  })
);

router.post(
  '/prescription-items/:id/dispense',
  wrap(async (req, res) => {
    const itemId = oid(req.params.id);
    if (!itemId) throw new HttpError(404, 'Medicine not found');
    const done = req.body?.dispensed !== false;
    const v = await db.visits.findOneAndUpdate(
      { 'items._id': itemId },
      { $set: { 'items.$.dispensed': done, 'items.$.dispensed_at': done ? new Date() : null, 'items.$.dispensed_by': done ? req.user._id : null } },
      { returnDocument: 'after' }
    );
    if (!v) throw new HttpError(404, 'Medicine not found');
    res.json({ item: out(v.items.find((i) => i._id.equals(itemId))) });
  })
);

router.post(
  '/visits/:id/dispense-all',
  wrap(async (req, res) => {
    const v = await db.visits.findOneAndUpdate(
      { _id: oid(req.params.id) },
      { $set: { 'items.$[i].dispensed': true, 'items.$[i].dispensed_at': new Date(), 'items.$[i].dispensed_by': req.user._id } },
      { arrayFilters: [{ 'i.dispensed': false }], returnDocument: 'after' }
    );
    if (!v) throw new HttpError(404, 'Visit not found');
    res.json({ items: out(v.items) });
  })
);

module.exports = router;
