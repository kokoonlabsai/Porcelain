const express = require('express');
const { db, oid, out, getSettings } = require('../db');
const deposits = require('../deposits');
const fees = require('../fees');
const { packagesForPatient } = require('./packages');
const { HttpError, wrap, requireAuth, today, toMinutes } = require('../util');
const { visitDetails, ATTACHMENT_FIELDS } = require('../records');

/** The patient portal: everything here is limited to the logged-in patient's own records. */
const router = express.Router();
router.use(requireAuth('patient'));

router.get(
  '/overview',
  wrap(async (req, res) => {
    const id = req.user._id;
    const upcoming = await db.appointments
      .find({ patient_id: id, date: { $gte: today() }, status: { $in: ['booked', 'checked_in'] } })
      .sort({ date: 1, start_time: 1 })
      .toArray();
    for (const a of upcoming) a.fee = await fees.refresh(a);
    const lastVisit = await db.visits.find({ patient_id: id }).sort({ date: -1, _id: -1 }).limit(1).next();
    const latest = lastVisit ? await visitDetails(lastVisit, { forPatient: true }) : null;
    const [pending] = await db.visits.aggregate([
      { $match: { patient_id: id } },
      { $unwind: '$items' },
      { $match: { 'items.dispensed': false } },
      { $count: 'n' },
    ]).toArray();
    const followUp = latest?.follow_up_date
      ? {
          date: latest.follow_up_date,
          booked: upcoming.some((a) => a.date >= latest.date),
          overdue: latest.follow_up_date < today(),
        }
      : null;
    const concern = upcoming[0]?.concern || latest?.concern;
    const category = { hair: 'hair', skin: 'skin', wellness: 'wellness', procedure: 'procedures' }[concern] || '';
    // Articles for their concern first, then myth-busters, then anything — shuffled within each group.
    const reads = await db.articles.aggregate([
      { $match: { published: true } },
      { $project: { body: 0 } },
      { $addFields: { rank: { $switch: { branches: [{ case: { $eq: ['$category', category] }, then: 0 }, { case: { $eq: ['$category', 'myths'] }, then: 1 }], default: 2 } }, shuffle: { $rand: {} } } },
      { $sort: { rank: 1, shuffle: 1 } },
      { $limit: 4 },
      { $project: { rank: 0, shuffle: 0 } },
    ]).toArray();
    res.json({
      upcoming: out(upcoming),
      latest_visit: latest,
      visit_count: await db.visits.countDocuments({ patient_id: id }),
      pending_medicines: pending?.n || 0,
      follow_up: followUp,
      reads: out(reads),
      packages: (await packagesForPatient(id)).filter((p) => p.status !== 'cancelled'),
    });
  })
);

router.get(
  '/appointments',
  wrap(async (req, res) => {
    const rows = await db.appointments.find({ patient_id: req.user._id }).sort({ date: -1, start_time: -1 }).toArray();
    res.json({ appointments: out(rows) });
  })
);

router.post(
  '/appointments/:id/cancel',
  wrap(async (req, res) => {
    const a = await db.appointments.findOne({ _id: oid(req.params.id), patient_id: req.user._id });
    if (!a) throw new HttpError(404, 'Appointment not found');
    if (a.status !== 'booked') throw new HttpError(409, 'This appointment can no longer be cancelled online');
    const now = new Date();
    const started = a.date < today() || (a.date === today() && toMinutes(a.start_time) <= now.getHours() * 60 + now.getMinutes());
    if (started) throw new HttpError(409, 'This appointment has already started. Please call the clinic.');
    // A paid deposit is refunded if they cancel early enough, and kept otherwise.
    let deposit = null;
    if (deposits.depositPaid(a)) {
      const hours = Number((await getSettings()).deposit_refund_hours) || 24;
      if (deposits.hoursUntil(a) >= hours) {
        try {
          await deposits.refundDeposit(a);
          deposit = 'refunded';
        } catch {
          throw new HttpError(502, 'We couldn’t process your deposit refund just now. Please try again, or call the clinic.');
        }
      } else {
        await db.appointments.updateOne({ _id: a._id }, { $set: { 'deposit.status': 'forfeited' } });
        deposit = 'forfeited';
      }
    }
    await db.appointments.updateOne({ _id: a._id }, { $set: { status: 'cancelled' } });
    res.json({ appointment: out(await db.appointments.findOne({ _id: a._id })), deposit });
  })
);

router.get(
  '/visits',
  wrap(async (req, res) => {
    const rows = await db.visits.find({ patient_id: req.user._id }).sort({ date: -1, _id: -1 }).toArray();
    res.json({ visits: await Promise.all(rows.map((v) => visitDetails(v, { forPatient: true }))) });
  })
);

router.get(
  '/visits/:id',
  wrap(async (req, res) => {
    const v = await db.visits.findOne({ _id: oid(req.params.id), patient_id: req.user._id });
    if (!v) throw new HttpError(404, 'Visit not found');
    res.json({ visit: await visitDetails(v, { forPatient: true }) });
  })
);

router.get(
  '/photos',
  wrap(async (req, res) => {
    const rows = await db.attachments
      .find({ patient_id: req.user._id, visible_to_patient: true }, { projection: ATTACHMENT_FIELDS })
      .sort({ created_at: -1 })
      .toArray();
    res.json({ photos: out(rows) });
  })
);

module.exports = router;
