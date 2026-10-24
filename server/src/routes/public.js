const express = require('express');
const bcrypt = require('bcryptjs');
const { db, getSettings, oid, out } = require('../db');
const { normalizePhone } = require('../phone');
const { slotsFor, upcomingDays } = require('../slots');
const { createAppointment } = require('../appointments');
const mail = require('../mail');
const rzp = require('../razorpay');
const deposits = require('../deposits');
const { HttpError, wrap, optionalAuth, signToken, publicUser, isISODate } = require('../util');

const router = express.Router();
const ARTICLE_CARD = { projection: { body: 0 } };

router.get(
  '/clinic',
  wrap(async (req, res) => {
    const settings = await getSettings();
    const hours = await db.availability.find({}, { projection: { _id: 0, weekday: 1, start_time: 1, end_time: 1 } }).sort({ weekday: 1, start_time: 1 }).toArray();
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
    const { appointment, patient, razorpay } = await createAppointment(req.body || {}, req.user);
    // With a deposit, the confirmation goes out once it's paid.
    if (patient.email && !razorpay) mail.bookingConfirmation(patient, appointment).catch(() => {});
    const hasVisits = !!(await db.visits.findOne({ patient_id: patient._id }, { projection: { _id: 1 } }));
    res.status(201).json({
      appointment: out(appointment),
      patient: { name: patient.name, phone: patient.phone, email: patient.email },
      // A guest without an account (and with no medical records yet) can set a password right away.
      can_create_account: !req.user && !patient.password_hash && !hasVisits,
      has_account: !!patient.password_hash,
      razorpay: razorpay || null,
    });
  })
);

/** Deposit paid in Razorpay's window: check the signature, then confirm the booking. */
router.post(
  '/appointments/:id/deposit/verify',
  wrap(async (req, res) => {
    const a = await db.appointments.findOne({ _id: oid(req.params.id) });
    const b = req.body || {};
    if (!a?.deposit || a.deposit.razorpay_order_id !== b.razorpay_order_id) throw new HttpError(404, 'Booking not found');
    if (!rzp.verifyPayment(b)) throw new HttpError(400, 'We couldn’t confirm that payment. If money was taken, it will be matched automatically — or call the clinic.');
    await deposits.markDepositPaid(a, b.razorpay_payment_id, 'checkout');
    res.json({ appointment: out(await db.appointments.findOne({ _id: a._id })) });
  })
);

/** Closed the payment window without paying: free the slot now rather than after the hold. */
router.post(
  '/appointments/:id/deposit/abandon',
  wrap(async (req, res) => {
    const a = await db.appointments.findOne({ _id: oid(req.params.id) });
    if (!a || a.status !== 'pending_payment' || a.deposit?.razorpay_order_id !== req.body?.razorpay_order_id) return res.json({ ok: true });
    try {
      const paid = await deposits.findPayment(a);
      if (paid) { await deposits.markDepositPaid(a, paid.id, 'reconcile'); return res.json({ ok: true, paid: true }); }
    } catch {
      return res.json({ ok: true }); // Let the hold expiry decide later.
    }
    await db.appointments.updateOne({ _id: a._id, status: 'pending_payment' }, { $set: { status: 'cancelled', cancel_reason: 'deposit_abandoned', 'deposit.status': 'failed' } });
    res.json({ ok: true });
  })
);

/** Guest booking → "save my details" in one step, right after booking. */
router.post(
  '/appointments/:id/claim',
  wrap(async (req, res) => {
    const password = String(req.body?.password || '');
    if (password.length < 6) throw new HttpError(422, 'Use at least 6 characters', { password: 'Use at least 6 characters' });
    const id = oid(req.params.id);
    const appt = id && (await db.appointments.findOne({ _id: id, created_at: { $gte: new Date(Date.now() - 30 * 60_000) } }));
    const patient = appt && (await db.users.findOne({ _id: appt.patient_id }));
    if (!patient || patient.phone !== normalizePhone(req.body?.phone)) throw new HttpError(404, 'Booking not found');
    if (patient.password_hash) throw new HttpError(409, 'This number already has an account. Log in instead.');
    if (await db.visits.findOne({ patient_id: patient._id }, { projection: { _id: 1 } })) {
      throw new HttpError(409, 'Ask the reception for your login — they can send a temporary password.');
    }
    const { modifiedCount } = await db.users.updateOne({ _id: patient._id, password_hash: null }, { $set: { password_hash: await bcrypt.hash(password, 10) } });
    if (!modifiedCount) throw new HttpError(409, 'This number already has an account. Log in instead.');
    const user = await db.users.findOne({ _id: patient._id });
    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

router.get(
  '/articles',
  wrap(async (req, res) => {
    const { category } = req.query;
    const rows = await db.articles
      .find({ published: true, ...(category ? { category: String(category) } : {}) }, ARTICLE_CARD)
      .sort({ category: 1, _id: 1 })
      .toArray();
    res.json({ articles: out(rows) });
  })
);

router.get(
  '/articles/:slug',
  wrap(async (req, res) => {
    const article = await db.articles.findOne({ slug: String(req.params.slug), published: true });
    if (!article) throw new HttpError(404, 'Article not found');
    const related = await db.articles.aggregate([
      { $match: { published: true, category: article.category, _id: { $ne: article._id } } },
      { $sample: { size: 3 } },
      { $project: { body: 0 } },
    ]).toArray();
    res.json({ article: out(article), related: out(related) });
  })
);

module.exports = router;
