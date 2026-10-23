const express = require('express');
const bcrypt = require('bcryptjs');
const { db, getSettings, DEFAULT_SETTINGS } = require('../db');
const { normalizePhone } = require('../phone');
const {
  HttpError, wrap, requireAuth, isISODate, isTime, toMinutes, str, isEmail, tempPassword, publicUser,
} = require('../util');

const router = express.Router();
router.use(requireAuth('admin'));

// ---------- Weekly schedule ----------

router.get(
  '/availability',
  wrap(async (req, res) => {
    res.json({ windows: await db.all('SELECT * FROM availability ORDER BY weekday, start_time') });
  })
);

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
    await db.batch([
      ['DELETE FROM availability'],
      ...clean.map((w) => [
        'INSERT INTO availability (weekday, start_time, end_time, slot_minutes, capacity) VALUES (?, ?, ?, ?, ?)',
        w.weekday, w.start_time, w.end_time, w.slot_minutes, w.capacity,
      ]),
    ]);
    res.json({ windows: await db.all('SELECT * FROM availability ORDER BY weekday, start_time') });
  })
);

// ---------- Days off ----------

router.get(
  '/closures',
  wrap(async (req, res) => {
    res.json({ closures: await db.all("SELECT * FROM closures WHERE date >= date('now', '-1 day') ORDER BY date") });
  })
);

/** Close one day or a range (from → to). Existing bookings on those days are listed so reception can call them. */
router.post(
  '/closures',
  wrap(async (req, res) => {
    const from = req.body?.date || req.body?.from;
    const to = req.body?.to || from;
    if (!isISODate(from) || !isISODate(to) || to < from) throw new HttpError(422, 'Pick the dates to close');
    const reason = str(req.body?.reason, 200);
    const { addDays } = require('../util');
    const dates = [];
    for (let d = from; d <= to && dates.length < 120; d = addDays(d, 1)) dates.push(d);
    await db.batch(dates.map((d) => ['INSERT INTO closures (date, reason) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET reason = excluded.reason', d, reason]));
    const affected = await db.all(
      `SELECT a.id, a.date, a.start_time, u.name, u.phone FROM appointments a JOIN users u ON u.id = a.patient_id
       WHERE a.date BETWEEN ? AND ? AND a.status = 'booked' ORDER BY a.date, a.start_time`,
      from, to
    );
    res.status(201).json({ closures: await db.all("SELECT * FROM closures WHERE date >= date('now', '-1 day') ORDER BY date"), affected });
  })
);

router.delete(
  '/closures/:id',
  wrap(async (req, res) => {
    await db.run('DELETE FROM closures WHERE id = ?', req.params.id);
    res.json({ ok: true });
  })
);

// ---------- Clinic details ----------

router.get('/settings', wrap(async (req, res) => res.json({ settings: await getSettings() })));

router.put(
  '/settings',
  wrap(async (req, res) => {
    const b = req.body || {};
    const updates = Object.keys(DEFAULT_SETTINGS)
      .filter((k) => b[k] !== undefined)
      .map((k) => [k, String(b[k] ?? '').trim().slice(0, 500)]);
    for (const [k, v] of updates) {
      if (['booking_days_ahead', 'min_notice_minutes'].includes(k) && !/^\d{1,4}$/.test(v)) throw new HttpError(422, 'Use a whole number');
      if (k === 'clinic_name' && !v) throw new HttpError(422, 'The clinic needs a name');
    }
    await db.batch(updates.map(([k, v]) => ['INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, v]));
    res.json({ settings: await getSettings() });
  })
);

// ---------- Staff accounts ----------

router.get(
  '/staff',
  wrap(async (req, res) => {
    const rows = await db.all("SELECT * FROM users WHERE role != 'patient' ORDER BY active DESC, role, name");
    res.json({ staff: rows.map((u) => ({ ...publicUser(u), active: !!u.active })) });
  })
);

const STAFF = ['doctor', 'reception', 'admin'];

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
    const existing = await db.get('SELECT * FROM users WHERE phone = ?', phone);
    if (existing && existing.role !== 'patient') throw new HttpError(409, 'This number is already a staff account', { phone: 'Already staff' });
    if (existing && (await db.get('SELECT 1 FROM visits WHERE patient_id = ? LIMIT 1', existing.id))) {
      throw new HttpError(409, 'This number belongs to a patient with medical records. Use a different number for the staff login.', { phone: 'Patient number' });
    }
    const password = tempPassword();
    const hash = await bcrypt.hash(password, 10);
    let id;
    if (existing) {
      await db.run('UPDATE users SET name = ?, email = ?, role = ?, password_hash = ?, must_change_password = 1, active = 1 WHERE id = ?', name, email, role, hash, existing.id);
      id = existing.id;
    } else {
      id = (await db.run('INSERT INTO users (name, phone, email, role, password_hash, must_change_password) VALUES (?, ?, ?, ?, ?, 1)', name, phone, email, role, hash)).lastInsertRowid;
    }
    const u = await db.get('SELECT * FROM users WHERE id = ?', id);
    res.status(201).json({ user: { ...publicUser(u), active: true }, password });
  })
);

router.patch(
  '/staff/:id',
  wrap(async (req, res) => {
    const u = await db.get("SELECT * FROM users WHERE id = ? AND role != 'patient'", req.params.id);
    if (!u) throw new HttpError(404, 'Staff member not found');
    const { role, active, name, email } = req.body || {};
    if (u.id === req.user.id && ((role && role !== 'admin') || active === false)) {
      throw new HttpError(409, 'You can’t remove your own admin access');
    }
    if (role !== undefined) {
      if (!STAFF.includes(role)) throw new HttpError(422, 'Pick a role');
      await db.run('UPDATE users SET role = ? WHERE id = ?', role, u.id);
    }
    if (active !== undefined) await db.run('UPDATE users SET active = ? WHERE id = ?', active ? 1 : 0, u.id);
    if (name !== undefined && str(name)) await db.run('UPDATE users SET name = ? WHERE id = ?', str(name, 120), u.id);
    if (email !== undefined) await db.run('UPDATE users SET email = ? WHERE id = ?', str(email, 200), u.id);
    const fresh = await db.get('SELECT * FROM users WHERE id = ?', u.id);
    res.json({ user: { ...publicUser(fresh), active: !!fresh.active } });
  })
);

router.post(
  '/staff/:id/reset',
  wrap(async (req, res) => {
    const u = await db.get("SELECT * FROM users WHERE id = ? AND role != 'patient'", req.params.id);
    if (!u) throw new HttpError(404, 'Staff member not found');
    const password = tempPassword();
    await db.run('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?', await bcrypt.hash(password, 10), u.id);
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
    published: b.published === false ? 0 : 1,
  };
}

router.get(
  '/articles',
  wrap(async (req, res) => {
    res.json({ articles: await db.all('SELECT id, slug, title, category, summary, read_minutes, published, updated_at FROM articles ORDER BY category, id') });
  })
);

router.get(
  '/articles/:id',
  wrap(async (req, res) => {
    const a = await db.get('SELECT * FROM articles WHERE id = ?', req.params.id);
    if (!a) throw new HttpError(404, 'Article not found');
    res.json({ article: a });
  })
);

router.post(
  '/articles',
  wrap(async (req, res) => {
    const f = articleFields(req.body || {});
    let slug = slugify(f.title) || 'article';
    if (await db.get('SELECT 1 FROM articles WHERE slug = ?', slug)) slug = `${slug}-${Date.now().toString(36)}`;
    const { lastInsertRowid } = await db.run(
      'INSERT INTO articles (slug, title, category, summary, body, read_minutes, published) VALUES (?, ?, ?, ?, ?, ?, ?)',
      slug, f.title, f.category, f.summary, f.body, f.read_minutes, f.published
    );
    res.status(201).json({ article: await db.get('SELECT * FROM articles WHERE id = ?', lastInsertRowid) });
  })
);

router.put(
  '/articles/:id',
  wrap(async (req, res) => {
    const a = await db.get('SELECT id FROM articles WHERE id = ?', req.params.id);
    if (!a) throw new HttpError(404, 'Article not found');
    const f = articleFields(req.body || {});
    await db.run(
      "UPDATE articles SET title = ?, category = ?, summary = ?, body = ?, read_minutes = ?, published = ?, updated_at = datetime('now') WHERE id = ?",
      f.title, f.category, f.summary, f.body, f.read_minutes, f.published, a.id
    );
    res.json({ article: await db.get('SELECT * FROM articles WHERE id = ?', a.id) });
  })
);

router.delete(
  '/articles/:id',
  wrap(async (req, res) => {
    await db.run('DELETE FROM articles WHERE id = ?', req.params.id);
    res.json({ ok: true });
  })
);

module.exports = router;
