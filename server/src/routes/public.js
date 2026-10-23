const express = require('express');
const { db, getSettings } = require('../db');
const { slotsFor, upcomingDays } = require('../slots');
const { createAppointment } = require('../appointments');
const mail = require('../mail');
const { HttpError, wrap, optionalAuth, signToken, publicUser, isISODate } = require('../util');

const router = express.Router();

router.get(
  '/clinic',
  wrap(async (req, res) => {
    const settings = await getSettings();
    const hours = await db.all('SELECT weekday, start_time, end_time FROM availability ORDER BY weekday, start_time');
    res.json({ settings, hours });
  })
);

router.get(
  '/slots/days',
  wrap(async (req, res) => res.json({ days: await upcomingDays() }))
);

router.get(
  '/slots',
  optionalAuth(),
  wrap(async (req, res) => {
    const { date } = req.query;
    if (!isISODate(date)) throw new HttpError(422, 'Pick a valid date');
    const forStaff = !!req.user && req.user.role !== 'patient' && req.query.staff === '1';
    res.json({ date, slots: await slotsFor(date, { forStaff }) });
  })
);

/** Book with or without an account. */
router.post(
  '/appointments',
  optionalAuth(),
  wrap(async (req, res) => {
    const { appointment, patient } = await createAppointment(req.body || {}, req.user);
    if (patient.email) mail.bookingConfirmation(patient, appointment).catch(() => {});
    const hasVisits = !!(await db.get('SELECT 1 FROM visits WHERE patient_id = ? LIMIT 1', patient.id));
    res.status(201).json({
      appointment,
      patient: { name: patient.name, phone: patient.phone, email: patient.email },
      // A guest without an account (and with no medical records yet) can set a password right away.
      can_create_account: !req.user && !patient.password_hash && !hasVisits,
      has_account: !!patient.password_hash,
    });
  })
);

/** Guest booking → "save my details" in one step, right after booking. */
router.post(
  '/appointments/:id/claim',
  wrap(async (req, res) => {
    const bcrypt = require('bcryptjs');
    const password = String(req.body?.password || '');
    if (password.length < 6) throw new HttpError(422, 'Use at least 6 characters', { password: 'Use at least 6 characters' });
    const appt = await db.get(
      "SELECT a.*, u.phone, u.password_hash FROM appointments a JOIN users u ON u.id = a.patient_id WHERE a.id = ? AND a.created_at >= datetime('now', '-30 minutes')",
      req.params.id
    );
    const { normalizePhone } = require('../phone');
    if (!appt || appt.phone !== normalizePhone(req.body?.phone)) throw new HttpError(404, 'Booking not found');
    if (appt.password_hash) throw new HttpError(409, 'This number already has an account. Log in instead.');
    if (await db.get('SELECT 1 FROM visits WHERE patient_id = ? LIMIT 1', appt.patient_id)) {
      throw new HttpError(409, 'Ask the reception for your login — they can send a temporary password.');
    }
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', await bcrypt.hash(password, 10), appt.patient_id);
    const user = await db.get('SELECT * FROM users WHERE id = ?', appt.patient_id);
    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

router.get(
  '/articles',
  wrap(async (req, res) => {
    const { category } = req.query;
    const rows = await db.all(
      `SELECT id, slug, title, category, summary, read_minutes, updated_at FROM articles
       WHERE published = 1 ${category ? 'AND category = ?' : ''} ORDER BY category, id`,
      ...(category ? [category] : [])
    );
    res.json({ articles: rows });
  })
);

router.get(
  '/articles/:slug',
  wrap(async (req, res) => {
    const article = await db.get('SELECT * FROM articles WHERE slug = ? AND published = 1', req.params.slug);
    if (!article) throw new HttpError(404, 'Article not found');
    const related = await db.all(
      'SELECT slug, title, category, summary, read_minutes FROM articles WHERE published = 1 AND category = ? AND id != ? ORDER BY RANDOM() LIMIT 3',
      article.category, article.id
    );
    res.json({ article, related });
  })
);

module.exports = router;
