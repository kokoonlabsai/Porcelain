const { db } = require('./db');
const mail = require('./mail');
const { today, addDays } = require('./util');

/** Days before the follow-up date that the reminder goes out. */
const FOLLOW_UP_LEAD_DAYS = 3;

/**
 * Sends the day-before appointment reminders and follow-up reminders.
 * Safe to run often: each message is sent once.
 */
async function runReminders() {
  const tomorrow = addDays(today(), 1);
  const appts = await db.all(
    `SELECT a.*, u.name, u.email FROM appointments a JOIN users u ON u.id = a.patient_id
     WHERE a.date = ? AND a.status = 'booked' AND a.reminder_sent = 0`, tomorrow
  );
  for (const a of appts) {
    if (a.email) await mail.appointmentReminder({ name: a.name, email: a.email }, a);
    await db.run('UPDATE appointments SET reminder_sent = 1 WHERE id = ?', a.id);
  }

  // Follow-ups due soon, unless the patient has already booked something.
  const due = await db.all(
    `SELECT v.*, u.name, u.email FROM visits v JOIN users u ON u.id = v.patient_id
     WHERE v.follow_up_date IS NOT NULL AND v.follow_up_reminded = 0 AND v.follow_up_date <= ?
       AND v.id = (SELECT MAX(id) FROM visits WHERE patient_id = v.patient_id)
       AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id = v.patient_id AND a.date >= ? AND a.status = 'booked')`,
    addDays(today(), FOLLOW_UP_LEAD_DAYS), today()
  );
  for (const v of due) {
    if (v.email) await mail.followUpReminder({ name: v.name, email: v.email }, v);
    await db.run('UPDATE visits SET follow_up_reminded = 1 WHERE id = ?', v.id);
  }
  return { appointmentReminders: appts.length, followUpReminders: due.length };
}

function startJobs() {
  const tick = () => runReminders().catch((e) => console.error('[jobs]', e.message));
  setTimeout(tick, 10_000);
  return setInterval(tick, 30 * 60_000);
}

module.exports = { runReminders, startJobs };
