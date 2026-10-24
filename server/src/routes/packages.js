const express = require('express');
const { db, oid, out } = require('../db');
const { HttpError, wrap, requireAuth, requireStaff, str } = require('../util');

/**
 * Treatment packages: a course of sessions sold as one ("Laser hair reduction — 6 sessions").
 * Admin keeps the templates; staff sell them to a patient; each visit can use one session.
 */
const CONCERNS = ['hair', 'skin', 'wellness', 'procedure', 'other'];
const PAY_METHODS = ['cash', 'upi', 'card', 'online', 'other'];

const whole = (v, min, max) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

function templateFields(b) {
  const errors = {};
  const f = {
    name: str(b.name, 160),
    sessions: whole(b.sessions, 1, 100),
    price: whole(b.price, 0, 10_000_000),
    interval_days: b.interval_days === '' || b.interval_days == null ? null : whole(b.interval_days, 1, 365),
    description: str(b.description, 1000) || '',
    concern: CONCERNS.includes(b.concern) ? b.concern : 'procedure',
    active: b.active !== false,
  };
  if (!f.name) errors.name = 'Name is required';
  if (!f.sessions) errors.sessions = 'How many sessions?';
  if (f.price === null) errors.price = 'Enter the price in rupees';
  if (Object.keys(errors).length) throw new HttpError(422, 'Please check the highlighted fields', errors);
  return f;
}

/** A patient's packages with the latest first; active ones show their next session number. */
async function packagesForPatient(patientId) {
  const rows = await db.patient_packages.find({ patient_id: patientId }).sort({ status: 1, sold_at: -1 }).toArray();
  return out(rows.map((p) => ({ ...p, remaining: Math.max(0, p.sessions_total - p.sessions_used) })));
}

/**
 * Sets which of the patient's packages this visit uses (one session each).
 * Ticking adds a session once; unticking on a later edit gives it back. Never goes past the total.
 */
async function applyPackageSessions(visit, wantedIds) {
  if (!Array.isArray(wantedIds)) return;
  const wanted = new Set(wantedIds.map((id) => oid(String(id))).filter(Boolean).map(String));
  const current = await db.patient_packages.find({ patient_id: visit.patient_id, 'sessions.visit_id': visit._id }).project({ _id: 1 }).toArray();
  const now = new Date();
  for (const p of current) {
    if (wanted.has(String(p._id))) continue;
    await db.patient_packages.updateOne(
      { _id: p._id, 'sessions.visit_id': visit._id },
      { $pull: { sessions: { visit_id: visit._id } }, $inc: { sessions_used: -1 }, $set: { status: 'active', updated_at: now } }
    );
  }
  const have = new Set(current.map((p) => String(p._id)));
  for (const id of wanted) {
    if (have.has(id)) continue;
    const r = await db.patient_packages.findOneAndUpdate(
      { _id: oid(id), patient_id: visit.patient_id, status: 'active', 'sessions.visit_id': { $ne: visit._id }, $expr: { $lt: ['$sessions_used', '$sessions_total'] } },
      { $push: { sessions: { visit_id: visit._id, date: visit.date, at: now } }, $inc: { sessions_used: 1 }, $set: { updated_at: now } },
      { returnDocument: 'after' }
    );
    if (r && r.sessions_used >= r.sessions_total) await db.patient_packages.updateOne({ _id: r._id }, { $set: { status: 'completed', completed_at: now } });
  }
}

/** The package sessions a visit used, for showing on the visit. */
async function sessionsForVisit(visitId) {
  const rows = await db.patient_packages.find({ 'sessions.visit_id': visitId }).toArray();
  return rows.map((p) => ({
    id: String(p._id),
    name: p.name,
    number: p.sessions.findIndex((x) => String(x.visit_id) === String(visitId)) + 1,
    total: p.sessions_total,
  }));
}

// ---------- Admin: templates ----------

const admin = express.Router();
admin.use(requireAuth('admin'));
admin.get('/', wrap(async (req, res) => res.json({ packages: out(await db.packages.find().sort({ active: -1, name: 1 }).toArray()) })));
admin.post(
  '/',
  wrap(async (req, res) => {
    const doc = { ...templateFields(req.body || {}), created_at: new Date(), updated_at: new Date() };
    await db.packages.insertOne(doc);
    res.status(201).json({ package: out(doc) });
  })
);
admin.put(
  '/:id',
  wrap(async (req, res) => {
    const r = await db.packages.findOneAndUpdate({ _id: oid(req.params.id) }, { $set: { ...templateFields(req.body || {}), updated_at: new Date() } }, { returnDocument: 'after' });
    if (!r) throw new HttpError(404, 'Package not found');
    res.json({ package: out(r) });
  })
);
admin.delete(
  '/:id',
  wrap(async (req, res) => {
    // Templates already sold stay on patients' records; deleting just stops selling it.
    await db.packages.updateOne({ _id: oid(req.params.id) }, { $set: { active: false, updated_at: new Date() } });
    res.json({ ok: true });
  })
);

// ---------- Staff: selling and managing ----------

const staff = express.Router();
staff.use(requireStaff());

staff.get('/templates', wrap(async (req, res) => res.json({ packages: out(await db.packages.find({ active: true }).sort({ name: 1 }).toArray()) })));

staff.get(
  '/patient/:patientId',
  wrap(async (req, res) => res.json({ packages: await packagesForPatient(oid(req.params.patientId)) }))
);

staff.post(
  '/patient/:patientId',
  wrap(async (req, res) => {
    const patient = await db.users.findOne({ _id: oid(req.params.patientId), role: 'patient' });
    if (!patient) throw new HttpError(404, 'Patient not found');
    const b = req.body || {};
    const t = await db.packages.findOne({ _id: oid(String(b.package_id || '')), active: true });
    if (!t) throw new HttpError(422, 'Pick a package', { package_id: 'Pick a package' });
    const price = b.price === undefined || b.price === '' ? t.price : whole(b.price, 0, 10_000_000);
    const sessions = b.sessions === undefined || b.sessions === '' ? t.sessions : whole(b.sessions, 1, 100);
    const paid = b.amount_paid === undefined || b.amount_paid === '' ? 0 : whole(b.amount_paid, 0, 10_000_000);
    const errors = {};
    if (price === null) errors.price = 'Enter a price';
    if (!sessions) errors.sessions = 'How many sessions?';
    if (paid === null || (price !== null && paid > price)) errors.amount_paid = 'Can’t be more than the price';
    if (Object.keys(errors).length) throw new HttpError(422, 'Please check the highlighted fields', errors);
    const now = new Date();
    const doc = {
      patient_id: patient._id, package_id: t._id, name: t.name, concern: t.concern, interval_days: t.interval_days || null,
      sessions_total: sessions, sessions_used: 0, sessions: [], price, amount_paid: paid,
      payment_method: PAY_METHODS.includes(b.payment_method) ? b.payment_method : null,
      notes: str(b.notes, 500), status: 'active', sold_by: req.user._id, sold_at: now, updated_at: now,
    };
    await db.patient_packages.insertOne(doc);
    res.status(201).json({ package: out({ ...doc, remaining: sessions }) });
  })
);

/** Record a further payment, or cancel. */
staff.patch(
  '/:id',
  wrap(async (req, res) => {
    const p = await db.patient_packages.findOne({ _id: oid(req.params.id) });
    if (!p) throw new HttpError(404, 'Package not found');
    const b = req.body || {};
    const set = { updated_at: new Date() };
    if (b.amount_paid !== undefined) {
      const paid = whole(b.amount_paid, 0, 10_000_000);
      if (paid === null || paid > p.price) throw new HttpError(422, 'Can’t be more than the price', { amount_paid: 'Can’t be more than the price' });
      set.amount_paid = paid;
    }
    if (b.payment_method !== undefined && PAY_METHODS.includes(b.payment_method)) set.payment_method = b.payment_method;
    if (b.status === 'cancelled') set.status = 'cancelled';
    await db.patient_packages.updateOne({ _id: p._id }, { $set: set });
    const fresh = await db.patient_packages.findOne({ _id: p._id });
    res.json({ package: out({ ...fresh, remaining: Math.max(0, fresh.sessions_total - fresh.sessions_used) }) });
  })
);

module.exports = { admin, staff, packagesForPatient, applyPackageSessions, sessionsForVisit };
