/**
 * Demo data: staff logins, patients, today's appointments, past visits with prescriptions.
 *   Admin     +91 90000 00001 / admin123
 *   Doctors   +91 90000 00002 and +91 90000 00004 / doctor123
 *   Reception +91 90000 00003 / reception123
 *   Patient   +91 98111 11111 / patient123
 */
const bcrypt = require('bcryptjs');
const { db, client, ready, newUser, ObjectId } = require('../src/db');
const { slotsFor } = require('../src/slots');
const { today, addDays } = require('../src/util');

async function user(name, phone, role, password, extra = {}) {
  const existing = await db.users.findOne({ phone });
  if (existing) return existing._id;
  const doc = newUser({ name, phone, role, password_hash: password ? await bcrypt.hash(password, 10) : null, ...extra });
  await db.users.insertOne(doc);
  return doc._id;
}

async function visit(patientId, doctorId, date, v, items, dispensed) {
  const at = new Date(`${date}T12:00:00`);
  await db.visits.insertOne({
    patient_id: patientId, appointment_id: null, doctor_id: doctorId, date,
    concern: v.concern, complaint: v.complaint, diagnosis: v.diagnosis, procedure_done: v.procedure_done || null,
    advice: v.advice, private_notes: null, follow_up_date: v.follow_up_date || null, follow_up_reminded: false,
    items: items.map(([medicine, kind, dosage, frequency, duration, instructions]) => ({
      _id: new ObjectId(), medicine, kind, dosage, frequency, duration, instructions: instructions || null, quantity: null,
      dispensed, dispensed_at: dispensed ? at : null, dispensed_by: null,
    })),
    created_at: at, updated_at: at,
  });
}

async function main() {
  await ready;
  // The clinic's real details and hours, over whatever an earlier start stored.
  const { DEFAULT_SETTINGS } = require('../src/db');
  await db.settings.updateOne({ _id: 'clinic' }, { $set: { ...DEFAULT_SETTINGS } }, { upsert: true });
  await db.availability.deleteMany({});
  await db.availability.insertMany([0, 1, 2, 3, 5, 6].map((weekday) => ({ weekday, start_time: '12:00', end_time: '19:45', slot_minutes: 30, capacity: 1 })));
  await user('Clinic Admin', '+919000000001', 'admin', 'admin123');
  const doctor = await user('Dr. Mayank Bajpai', '+919000000002', 'doctor', 'doctor123');
  await user('Dr. Nitya Bajpai', '+919000000004', 'doctor', 'doctor123');
  await user('Priya (Reception)', '+919000000003', 'reception', 'reception123');

  const asha = await user('Asha Rao', '+919811111111', 'patient', 'patient123', { email: 'asha@example.com', gender: 'Female', dob: '1994-06-12' });
  const ravi = await user('Ravi Kumar', '+919822222222', 'patient', null, { gender: 'Male', dob: '1988-01-30' });
  const meera = await user('Meera Iyer', '+919833333333', 'patient', null, { gender: 'Female', dob: '2001-11-02' });
  const arjun = await user('Arjun Shah', '+919844444444', 'patient', null, { gender: 'Male' });

  if (!(await db.visits.findOne({}))) {
    await visit(asha, doctor, addDays(today(), -42), {
      concern: 'hair', complaint: 'Hair fall for 3 months after viral fever', diagnosis: 'Telogen effluvium',
      advice: 'Eat protein with every meal.\nUse a mild shampoo; wash as often as you like.\nHair fall should settle in 8–12 weeks.', follow_up_date: addDays(today(), -12),
    }, [
      ['Minoxidil 5% solution', 'Solution', '1 ml', 'At night', '3 months', 'Apply to dry scalp, don’t wash for 4 hours'],
      ['Biotin + iron supplement', 'Tablet', '1 tab', 'Once daily', '2 months', 'After breakfast'],
    ], true);
    await visit(asha, doctor, addDays(today(), -9), {
      concern: 'hair', complaint: 'Review — shedding reduced', diagnosis: 'Telogen effluvium — improving', procedure_done: 'PRP, session 1 of 4',
      advice: 'Don’t wash your hair for 24 hours after PRP.\nAvoid hair dye for 2 weeks.', follow_up_date: addDays(today(), 2),
    }, [
      ['Minoxidil 5% solution', 'Solution', '1 ml', 'At night', '3 months', 'Continue'],
      ['Ketoconazole 2% shampoo', 'Shampoo', '', 'Twice a week', '1 month', 'Leave on for 5 minutes'],
    ], false);
    await visit(meera, doctor, today(), {
      concern: 'skin', complaint: 'Pimples on cheeks and forehead', diagnosis: 'Acne vulgaris (grade 2)',
      advice: 'Wash face twice a day only.\nDon’t pick or pop.\nSunscreen every morning.', follow_up_date: addDays(today(), 28),
    }, [
      ['Adapalene 0.1% gel', 'Gel', 'Pea-sized', 'At night', '2 months', 'Start alternate nights; avoid eyes and lips'],
      ['Gentle foaming face wash', 'Face wash', '', 'Twice daily', 'Ongoing'],
      ['SPF 50 gel sunscreen', 'Sunscreen', '2 fingers', 'In the morning', 'Ongoing', 'Reapply every 3 hours outdoors'],
    ], false);
  }

  if (!(await db.appointments.findOne({ date: today() }))) {
    const free = (await slotsFor(today(), { forStaff: true })).filter((s) => s.available);
    const plan = [
      [meera, 'skin', 'completed', 'Pimples for 6 months'],
      [arjun, 'procedure', 'checked_in', 'Interested in laser hair reduction'],
      [ravi, 'hair', 'booked', 'Receding hairline'],
    ];
    for (const [i, [patient_id, concern, status, description]] of plan.entries()) {
      const s = free[i * 2];
      if (!s) break;
      await db.appointments.insertOne({
        patient_id, date: today(), start_time: s.start, end_time: s.end, concern, description, status,
        source: i === 1 ? 'walk_in' : 'online', reminder_sent: false, created_at: new Date(),
      });
    }
  }
  console.log('Demo data ready. Admin +91 90000 00001 / admin123 · Doctors 90000 00002, 90000 00004 / doctor123 · Reception 90000 00003 / reception123 · Patient 98111 11111 / patient123');
}

main().then(() => client.close(), (e) => { console.error(e); return client.close().then(() => process.exit(1)); });
