const express = require('express');
const { db } = require('../db');
const { HttpError, wrap, requireAuth, today, toMinutes } = require('../util');
const { visitDetails } = require('../records');

/** The patient portal: everything here is limited to the logged-in patient's own records. */
const router = express.Router();
router.use(requireAuth('patient'));

router.get(
  '/overview',
  wrap(async (req, res) => {
    const id = req.user.id;
    const upcoming = await db.all(
      "SELECT * FROM appointments WHERE patient_id = ? AND date >= ? AND status IN ('booked','checked_in') ORDER BY date, start_time",
      id, today()
    );
    const visits = await db.all('SELECT * FROM visits WHERE patient_id = ? ORDER BY date DESC, id DESC LIMIT 5', id);
    const latest = visits[0] ? await visitDetails(visits[0], { forPatient: true }) : null;
    const pending = await db.get(
      'SELECT COUNT(*) AS n FROM prescription_items p JOIN visits v ON v.id = p.visit_id WHERE v.patient_id = ? AND p.dispensed = 0',
      id
    );
    const followUp = latest?.follow_up_date
      ? {
          date: latest.follow_up_date,
          booked: upcoming.some((a) => a.date >= latest.date),
          overdue: latest.follow_up_date < today(),
        }
      : null;
    const concern = upcoming[0]?.concern || latest?.concern;
    const category = { hair: 'hair', skin: 'skin', wellness: 'wellness', procedure: 'procedures' }[concern];
    const reads = await db.all(
      `SELECT slug, title, category, summary, read_minutes FROM articles WHERE published = 1
       ORDER BY CASE WHEN category = ? THEN 0 WHEN category = 'myths' THEN 1 ELSE 2 END, RANDOM() LIMIT 4`,
      category || ''
    );
    res.json({
      upcoming,
      latest_visit: latest,
      visit_count: (await db.get('SELECT COUNT(*) AS n FROM visits WHERE patient_id = ?', id)).n,
      pending_medicines: pending.n,
      follow_up: followUp,
      reads,
    });
  })
);

router.get(
  '/appointments',
  wrap(async (req, res) => {
    const rows = await db.all('SELECT * FROM appointments WHERE patient_id = ? ORDER BY date DESC, start_time DESC', req.user.id);
    res.json({ appointments: rows });
  })
);

router.post(
  '/appointments/:id/cancel',
  wrap(async (req, res) => {
    const a = await db.get('SELECT * FROM appointments WHERE id = ? AND patient_id = ?', req.params.id, req.user.id);
    if (!a) throw new HttpError(404, 'Appointment not found');
    if (a.status !== 'booked') throw new HttpError(409, 'This appointment can no longer be cancelled online');
    const now = new Date();
    const started = a.date < today() || (a.date === today() && toMinutes(a.start_time) <= now.getHours() * 60 + now.getMinutes());
    if (started) throw new HttpError(409, 'This appointment has already started. Please call the clinic.');
    await db.run("UPDATE appointments SET status = 'cancelled' WHERE id = ?", a.id);
    res.json({ appointment: { ...a, status: 'cancelled' } });
  })
);

router.get(
  '/visits',
  wrap(async (req, res) => {
    const rows = await db.all('SELECT * FROM visits WHERE patient_id = ? ORDER BY date DESC, id DESC', req.user.id);
    res.json({ visits: await Promise.all(rows.map((v) => visitDetails(v, { forPatient: true }))) });
  })
);

router.get(
  '/visits/:id',
  wrap(async (req, res) => {
    const v = await db.get('SELECT * FROM visits WHERE id = ? AND patient_id = ?', req.params.id, req.user.id);
    if (!v) throw new HttpError(404, 'Visit not found');
    res.json({ visit: await visitDetails(v, { forPatient: true }) });
  })
);

router.get(
  '/photos',
  wrap(async (req, res) => {
    const rows = await db.all(
      `SELECT id, visit_id, mime, size, caption, created_at FROM attachments
       WHERE patient_id = ? AND visible_to_patient = 1 ORDER BY created_at DESC`,
      req.user.id
    );
    res.json({ photos: rows });
  })
);

module.exports = router;
