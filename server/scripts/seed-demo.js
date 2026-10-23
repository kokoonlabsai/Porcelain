/**
 * Demo data: staff logins, patients, today's appointments, past visits with prescriptions.
 *   Admin     +91 90000 00001 / admin123
 *   Doctor    +91 90000 00002 / doctor123
 *   Reception +91 90000 00003 / reception123
 *   Patient   +91 98111 11111 / patient123
 */
const bcrypt = require('bcryptjs');
const { db, ready } = require('../src/db');
const { slotsFor } = require('../src/slots');
const { today, addDays } = require('../src/util');

async function user(name, phone, role, password, extra = {}) {
  const existing = await db.get('SELECT id FROM users WHERE phone = ?', phone);
  if (existing) return existing.id;
  const hash = password ? await bcrypt.hash(password, 10) : null;
  return (await db.run(
    'INSERT INTO users (name, phone, role, password_hash, email, gender, dob) VALUES (?, ?, ?, ?, ?, ?, ?)',
    name, phone, role, hash, extra.email || null, extra.gender || null, extra.dob || null
  )).lastInsertRowid;
}

async function visit(patientId, doctorId, date, v, items, dispensed) {
  const id = (await db.run(
    `INSERT INTO visits (patient_id, doctor_id, date, concern, complaint, diagnosis, procedure_done, advice, follow_up_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    patientId, doctorId, date, v.concern, v.complaint, v.diagnosis, v.procedure_done || null, v.advice, v.follow_up_date || null
  )).lastInsertRowid;
  for (const [n, i] of items.entries()) {
    await db.run(
      `INSERT INTO prescription_items (visit_id, position, medicine, kind, dosage, frequency, duration, instructions, dispensed, dispensed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, n, i[0], i[1], i[2], i[3], i[4], i[5] || null, dispensed ? 1 : 0, dispensed ? `${date} 12:00:00` : null
    );
  }
  return id;
}

async function main() {
  await ready;
  await db.run("INSERT INTO settings (key, value) VALUES ('clinic_name', 'Lumen Skin & Hair Clinic') ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  await db.batch([
    ["UPDATE settings SET value = 'Dr. Anjali Mehta' WHERE key = 'doctor_name'"],
    ["UPDATE settings SET value = '+91 80 4123 4567' WHERE key = 'phone'"],
    ["UPDATE settings SET value = '+91 98450 00000' WHERE key = 'whatsapp'"],
    ["UPDATE settings SET value = '2nd floor, 14 Residency Road, Bengaluru 560025' WHERE key = 'address'"],
  ]);
  await user('Clinic Admin', '+919000000001', 'admin', 'admin123');
  const doctor = await user('Dr. Anjali Mehta', '+919000000002', 'doctor', 'doctor123');
  await user('Priya (Reception)', '+919000000003', 'reception', 'reception123');

  const asha = await user('Asha Rao', '+919811111111', 'patient', 'patient123', { email: 'asha@example.com', gender: 'Female', dob: '1994-06-12' });
  const ravi = await user('Ravi Kumar', '+919822222222', 'patient', null, { gender: 'Male', dob: '1988-01-30' });
  const meera = await user('Meera Iyer', '+919833333333', 'patient', null, { gender: 'Female', dob: '2001-11-02' });
  const arjun = await user('Arjun Shah', '+919844444444', 'patient', null, { gender: 'Male' });

  if (!(await db.get('SELECT 1 FROM visits LIMIT 1'))) {
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

  if (!(await db.get('SELECT 1 FROM appointments WHERE date = ?', today()))) {
    const free = (await slotsFor(today(), { forStaff: true })).filter((s) => s.available);
    const plan = [
      [meera, 'skin', 'completed', 'Pimples for 6 months'],
      [arjun, 'procedure', 'checked_in', 'Interested in laser hair reduction'],
      [ravi, 'hair', 'booked', 'Receding hairline'],
    ];
    for (const [i, [pid, concern, status, desc]] of plan.entries()) {
      const s = free[i * 2];
      if (!s) break;
      await db.run(
        'INSERT INTO appointments (patient_id, date, start_time, end_time, concern, description, status, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        pid, today(), s.start, s.end, concern, desc, status, i === 1 ? 'walk_in' : 'online'
      );
    }
  }
  console.log('Demo data ready. Admin +91 90000 00001 / admin123 · Doctor 90000 00002 / doctor123 · Reception 90000 00003 / reception123 · Patient 98111 11111 / patient123');
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
