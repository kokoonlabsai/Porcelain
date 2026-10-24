const express = require('express');
const bcrypt = require('bcryptjs');
const { db, getSettings, DEFAULT_SETTINGS, oid, out, newUser } = require('../db');
const { normalizePhone } = require('../phone');
const {
  HttpError, wrap, requireAuth, isISODate, isTime, toMinutes, str, isEmail, tempPassword, publicUser, addDays, today,
} = require('../util');

const router = express.Router();
router.use(requireAuth('admin'));

// ---------- Weekly schedule ----------

const allWindows = async () => out(await db.availability.find().sort({ weekday: 1, start_time: 1 }).toArray());

router.get('/availability', wrap(async (req, res) => res.json({ windows: await allWindows() })));

/** Replaces the whole weekly schedule. Each window: weekday 0–6 (Sunday = 0), start, end, slot length. */
router.put(
  '/availability',
  wrap(async (req, res) => {
    const windows = Array.isArray(req.body?.windows) ? req.body.windows : null;
    if (!windows) throw new HttpError(422, 'Send the list of opening windows');
    const clean = windows.map((w, i) => {
      const weekday = Number(w.weekday);
      const slot = Number(w.slot_minutes);
      const capacity = Number(w.capacity ?? 1);
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new HttpError(422, `Window ${i + 1}: pick a day`);
      if (!isTime(w.start_time) || !isTime(w.end_time)) throw new HttpError(422, `Window ${i + 1}: enter start and end times`);
      if (toMinutes(w.end_time) <= toMinutes(w.start_time)) throw new HttpError(422, `Window ${i + 1}: the end time must be after the start time`);
      if (!Number.isInteger(slot) || slot < 5 || slot > 240) throw new HttpError(422, `Window ${i + 1}: slot length must be 5–240 minutes`);
      if (toMinutes(w.end_time) - toMinutes(w.start_time) < slot) throw new HttpError(422, `Window ${i + 1}: the window is shorter than one slot`);
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 20) throw new HttpError(422, `Window ${i + 1}: patients per slot must be 1–20`);
      return { weekday, start_time: w.start_time, end_time: w.end_time, slot_minutes: slot, capacity };
    });
    // Overlapping windows on the same day would create confusing double slots.
    for (const a of clean) {
      for (const b of clean) {
        if (a !== b && a.weekday === b.weekday && a.start_time < b.end_time && b.start_time < a.end_time) {
          throw new HttpError(422, 'Two windows on the same day overlap. Adjust their times.');
        }
      }
    }
    await db.availability.deleteMany({});
    if (clean.length) await db.availability.insertMany(clean);
    res.json({ windows: await allWindows() });
  })
);

// ---------- Days off ----------

const upcomingClosures = async () => out(await db.closures.find({ date: { $gte: addDays(today(), -1) } }).sort({ date: 1 }).toArray());

router.get('/closures', wrap(async (req, res) => res.json({ closures: await upcomingClosures() })));

/** Close one day or a range (from → to). Existing bookings on those days are listed so reception can call them. */
router.post(
  '/closures',
  wrap(async (req, res) => {
    const from = req.body?.date || req.body?.from;
    const to = req.body?.to || from;
    if (!isISODate(from) || !isISODate(to) || to < from) throw new HttpError(422, 'Pick the dates to close');
    const reason = str(req.body?.reason, 200);
    const dates = [];
    for (let d = from; d <= to && dates.length < 120; d = addDays(d, 1)) dates.push(d);
    await db.closures.bulkWrite(dates.map((date) => ({ updateOne: { filter: { date }, update: { $set: { date, reason } }, upsert: true } })));
    const affected = await db.appointments.aggregate([
      { $match: { date: { $gte: from, $lte: to }, status: 'booked' } },
      { $sort: { date: 1, start_time: 1 } },
      { $lookup: { from: 'users', localField: 'patient_id', foreignField: '_id', as: 'u', pipeline: [{ $project: { name: 1, phone: 1 } }] } },
      { $project: { date: 1, start_time: 1, name: { $first: '$u.name' }, phone: { $first: '$u.phone' } } },
    ]).toArray();
    res.status(201).json({ closures: await upcomingClosures(), affected: out(affected) });
  })
);

router.delete(
  '/closures/:id',
  wrap(async (req, res) => {
    await db.closures.deleteOne({ _id: oid(req.params.id) });
    res.json({ ok: true });
  })
);

// ---------- Clinic details ----------

router.get('/settings', wrap(async (req, res) => res.json({ settings: await getSettings() })));

router.put(
  '/settings',
  wrap(async (req, res) => {
    const b = req.body || {};
    const updates = Object.fromEntries(
      Object.keys(DEFAULT_SETTINGS).filter((k) => b[k] !== undefined).map((k) => [k, String(b[k] ?? '').trim().slice(0, 1000)])
    );
    for (const [k, v] of Object.entries(updates)) {
      if (['booking_days_ahead', 'min_notice_minutes', 'shop_delivery_fee', 'shop_free_delivery_over', 'deposit_amount', 'deposit_refund_hours', 'consultation_fee', 'consultation_free_days'].includes(k) && !/^\d{1,6}$/.test(v)) throw new HttpError(422, 'Use a whole number');
      if (['shop_delivery', 'deposit_procedures', 'deposit_weekends'].includes(k) && !['0', '1'].includes(v)) throw new HttpError(422, 'Use 1 for on or 0 for off');
      if (k === 'clinic_name' && !v) throw new HttpError(422, 'The clinic needs a name');
    }
    if (Object.keys(updates).length) await db.settings.updateOne({ _id: 'clinic' }, { $set: updates }, { upsert: true });
    res.json({ settings: await getSettings() });
  })
);

// ---------- Staff accounts ----------

const STAFF = ['doctor', 'reception', 'admin'];
const staffOut = (u) => ({ ...publicUser(u), active: !!u.active });

router.get(
  '/staff',
  wrap(async (req, res) => {
    const rows = await db.users.find({ role: { $ne: 'patient' } }).sort({ active: -1, role: 1, name: 1 }).toArray();
    res.json({ staff: rows.map(staffOut) });
  })
);

router.post(
  '/staff',
  wrap(async (req, res) => {
    const name = str(req.body?.name, 120);
    const phone = normalizePhone(req.body?.phone);
    const email = str(req.body?.email, 200);
    const role = req.body?.role;
    const errors = {};
    if (!name) errors.name = 'Name is required';
    if (!phone) errors.phone = 'Enter a valid phone number';
    if (email && !isEmail(email)) errors.email = 'That email doesn’t look right';
    if (!STAFF.includes(role)) errors.role = 'Pick a role';
    if (Object.keys(errors).length) throw new HttpError(422, 'Please check the highlighted fields', errors);
    const existing = await db.users.findOne({ phone });
    if (existing && existing.role !== 'patient') throw new HttpError(409, 'This number is already a staff account', { phone: 'Already staff' });
    if (existing && (await db.visits.findOne({ patient_id: existing._id }, { projection: { _id: 1 } }))) {
      throw new HttpError(409, 'This number belongs to a patient with medical records. Use a different number for the staff login.', { phone: 'Patient number' });
    }
    const password = tempPassword();
    const fields = { name, email, role, password_hash: await bcrypt.hash(password, 10), must_change_password: true, active: true };
    let id;
    if (existing) {
      await db.users.updateOne({ _id: existing._id }, { $set: fields });
      id = existing._id;
    } else {
      id = (await db.users.insertOne(newUser({ ...fields, phone }))).insertedId;
    }
    res.status(201).json({ user: staffOut(await db.users.findOne({ _id: id })), password });
  })
);

async function loadStaff(id) {
  const u = await db.users.findOne({ _id: oid(id), role: { $ne: 'patient' } });
  if (!u) throw new HttpError(404, 'Staff member not found');
  return u;
}

router.patch(
  '/staff/:id',
  wrap(async (req, res) => {
    const u = await loadStaff(req.params.id);
    const { role, active, name, email, phone } = req.body || {};
    if (u._id.equals(req.user._id) && ((role && role !== 'admin') || active === false)) {
      throw new HttpError(409, 'You can’t remove your own admin access');
    }
    const set = {};
    const errors = {};
    if (role !== undefined) {
      if (!STAFF.includes(role)) errors.role = 'Pick a role';
      else set.role = role;
    }
    if (active !== undefined) set.active = !!active;
    if (name !== undefined) {
      if (!str(name)) errors.name = 'Name is required';
      else set.name = str(name, 120);
    }
    if (email !== undefined) {
      const e = str(email, 200);
      if (e && !isEmail(e)) errors.email = 'That email doesn’t look right';
      else set.email = e;
    }
    if (phone !== undefined) {
      const p = normalizePhone(phone);
      if (!p) errors.phone = 'Enter a valid phone number';
      else set.phone = p;
    }
    if (Object.keys(errors).length) throw new HttpError(422, 'Please check the highlighted fields', errors);
    if (Object.keys(set).length) {
      try {
        await db.users.updateOne({ _id: u._id }, { $set: set });
      } catch (e) {
        // Phone numbers are unique across patients and staff: it's the login.
        if (e.code === 11000) throw new HttpError(409, 'Someone else already uses this phone number', { phone: 'Already in use' });
        throw e;
      }
    }
    res.json({ user: staffOut(await db.users.findOne({ _id: u._id })) });
  })
);

router.post(
  '/staff/:id/reset',
  wrap(async (req, res) => {
    const u = await loadStaff(req.params.id);
    const password = tempPassword();
    await db.users.updateOne({ _id: u._id }, { $set: { password_hash: await bcrypt.hash(password, 10), must_change_password: true } });
    res.json({ password });
  })
);

// ---------- Learn articles ----------

const CATEGORIES = ['procedures', 'hair', 'skin', 'myths', 'wellness'];
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

function articleFields(b) {
  const title = str(b.title, 200);
  if (!title) throw new HttpError(422, 'Give the article a title', { title: 'Required' });
  if (!CATEGORIES.includes(b.category)) throw new HttpError(422, 'Pick a category', { category: 'Required' });
  return {
    title,
    category: b.category,
    summary: str(b.summary, 400) || '',
    body: str(b.body, 50000) || '',
    read_minutes: Math.max(1, Math.min(60, Number(b.read_minutes) || Math.ceil((String(b.body || '').split(/\s+/).length || 1) / 200))),
    published: b.published !== false,
  };
}

async function loadArticle(id) {
  const a = await db.articles.findOne({ _id: oid(id) });
  if (!a) throw new HttpError(404, 'Article not found');
  return a;
}

router.get(
  '/articles',
  wrap(async (req, res) => {
    res.json({ articles: out(await db.articles.find({}, { projection: { body: 0 } }).sort({ category: 1, _id: 1 }).toArray()) });
  })
);

router.get('/articles/:id', wrap(async (req, res) => res.json({ article: out(await loadArticle(req.params.id)) })));

router.post(
  '/articles',
  wrap(async (req, res) => {
    const f = articleFields(req.body || {});
    let slug = slugify(f.title) || 'article';
    if (await db.articles.findOne({ slug })) slug = `${slug}-${Date.now().toString(36)}`;
    const now = new Date();
    const doc = { slug, ...f, created_at: now, updated_at: now };
    await db.articles.insertOne(doc);
    res.status(201).json({ article: out(doc) });
  })
);

router.put(
  '/articles/:id',
  wrap(async (req, res) => {
    const a = await loadArticle(req.params.id);
    await db.articles.updateOne({ _id: a._id }, { $set: { ...articleFields(req.body || {}), updated_at: new Date() } });
    res.json({ article: out(await db.articles.findOne({ _id: a._id })) });
  })
);

router.delete(
  '/articles/:id',
  wrap(async (req, res) => {
    await db.articles.deleteOne({ _id: oid(req.params.id) });
    res.json({ ok: true });
  })
);

module.exports = router;
