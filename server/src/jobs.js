const { db } = require('./db');
const mail = require('./mail');
const { today, addDays } = require('./util');

/** Days before the follow-up date that the reminder goes out. */
const FOLLOW_UP_LEAD_DAYS = 3;

/** Each patient's most recent visit, limited to those matching `match`. */
function latestVisits(match) {
  return db.visits.aggregate([
    { $sort: { date: -1, _id: -1 } },
    { $group: { _id: '$patient_id', visit: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$visit' } },
    { $match: match },
  ]).toArray();
}

/**
 * Sends the day-before appointment reminders and follow-up reminders.
 * Safe to run often: each message is sent once.
 */
async function runReminders() {
  const tomorrow = addDays(today(), 1);
  const appts = await db.appointments.find({ date: tomorrow, status: 'booked', reminder_sent: { $ne: true } }).toArray();
  for (const a of appts) {
    const patient = await db.users.findOne({ _id: a.patient_id });
    if (patient?.email) await mail.appointmentReminder(patient, a);
    await db.appointments.updateOne({ _id: a._id }, { $set: { reminder_sent: true } });
  }

  // Follow-ups due soon, unless the patient has already booked something.
  const due = await latestVisits({ follow_up_date: { $ne: null, $lte: addDays(today(), FOLLOW_UP_LEAD_DAYS) }, follow_up_reminded: { $ne: true } });
  let sent = 0;
  for (const v of due) {
    const booked = await db.appointments.findOne({ patient_id: v.patient_id, date: { $gte: today() }, status: 'booked' });
    if (booked) continue;
    const patient = await db.users.findOne({ _id: v.patient_id });
    if (patient?.email) await mail.followUpReminder(patient, v);
    await db.visits.updateOne({ _id: v._id }, { $set: { follow_up_reminded: true } });
    sent++;
  }
  return { appointmentReminders: appts.length, followUpReminders: sent };
}

function startJobs() {
  const tick = () => runReminders().catch((e) => console.error('[jobs]', e.message));
  setTimeout(tick, 10_000);
  return setInterval(tick, 30 * 60_000);
}

module.exports = { runReminders, startJobs, latestVisits };
