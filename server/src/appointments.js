const { db } = require('./db');
const { normalizePhone } = require('./phone');
const { slotsFor } = require('./slots');
const { HttpError, str, isEmail, isISODate, isTime } = require('./util');

const CONCERNS = ['hair', 'skin', 'wellness', 'procedure', 'other'];

/** Find the patient by phone, or create a record without a login. */
async function findOrCreatePatient(conn, { name, phone, email }, { trustDetails }) {
  const existing = await conn.get('SELECT * FROM users WHERE phone = ?', phone);
  if (existing) {
    if (existing.role !== 'patient') return existing;
    // Someone booking without logging in can't rename an account holder.
    if (trustDetails || !existing.password_hash) {
      await conn.run('UPDATE users SET name = ?, email = COALESCE(?, email) WHERE id = ?', name, email, existing.id);
    }
    return conn.get('SELECT * FROM users WHERE id = ?', existing.id);
  }
  const { lastInsertRowid } = await conn.run('INSERT INTO users (name, phone, email) VALUES (?, ?, ?)', name, phone, email);
  return conn.get('SELECT * FROM users WHERE id = ?', lastInsertRowid);
}

/**
 * Books a slot after checking it exists in the schedule and still has room.
 * `actor` is the logged-in user (patient or staff) or null for a guest.
 */
async function createAppointment(input, actor) {
  const forStaff = !!actor && actor.role !== 'patient';
  const errors = {};
  const date = input.date;
  const start = input.start_time;
  const concern = CONCERNS.includes(input.concern) ? input.concern : null;
  const description = str(input.description, 2000);

  let name; let phone; let email;
  if (actor && actor.role === 'patient') {
    name = actor.name;
    phone = actor.phone;
    email = str(input.email, 200) || actor.email;
  } else {
    name = str(input.name, 120);
    phone = normalizePhone(input.phone);
    email = str(input.email, 200);
    if (!name) errors.name = 'Tell us your name';
    if (!phone) errors.phone = 'Enter a valid phone number';
  }
  if (email && !isEmail(email)) errors.email = 'That email doesn’t look right';
  if (!concern) errors.concern = 'Pick what you’re coming in for';
  if (!isISODate(date)) errors.date = 'Pick a date';
  if (!isTime(start)) errors.start_time = 'Pick a time';
  if (Object.keys(errors).length) throw new HttpError(422, 'Please check the highlighted fields', errors);

  return db.tx(async (conn) => {
    const slot = (await slotsFor(date, { forStaff, conn })).find((s) => s.start === start);
    if (!slot) throw new HttpError(409, 'That time isn’t available. Please pick another slot.');
    if (!slot.available) throw new HttpError(409, 'Someone just took that slot. Please pick another one.');

    const patient = actor && actor.role === 'patient'
      ? actor
      : await findOrCreatePatient(conn, { name, phone, email }, { trustDetails: forStaff });
    if (patient.role !== 'patient') throw new HttpError(422, 'This number belongs to a staff account', { phone: 'Staff number' });
    if (actor && actor.role === 'patient' && email && email !== actor.email) {
      await conn.run('UPDATE users SET email = ? WHERE id = ?', email, actor.id);
    }
    const clash = await conn.get(
      "SELECT id FROM appointments WHERE patient_id = ? AND date = ? AND status IN ('booked','checked_in')", patient.id, date
    );
    if (clash) throw new HttpError(409, 'You already have an appointment that day. Cancel it first to pick a new time.');

    const { lastInsertRowid } = await conn.run(
      `INSERT INTO appointments (patient_id, date, start_time, end_time, concern, description, source, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      patient.id, date, start, slot.end, concern, description,
      forStaff ? input.source === 'phone' ? 'phone' : 'walk_in' : 'online',
      forStaff && input.check_in ? 'checked_in' : 'booked'
    );
    const appointment = await conn.get('SELECT * FROM appointments WHERE id = ?', lastInsertRowid);
    const fresh = await conn.get('SELECT * FROM users WHERE id = ?', patient.id);
    return { appointment, patient: fresh };
  });
}

module.exports = { createAppointment, findOrCreatePatient, CONCERNS };
