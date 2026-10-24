const { db, newUser } = require('./db');
const { normalizePhone } = require('./phone');
const { slotsFor, HOLDING } = require('./slots');
const { HttpError, str, isEmail, isISODate, isTime } = require('./util');

const CONCERNS = ['hair', 'skin', 'wellness', 'procedure', 'other'];

/** Find the patient by phone, or create a record without a login. */
async function findOrCreatePatient({ name, phone, email }, { trustDetails }) {
  const existing = await db.users.findOne({ phone });
  if (existing) {
    if (existing.role !== 'patient') return existing;
    // Someone booking without logging in can't rename an account holder.
    if (trustDetails || !existing.password_hash) {
      await db.users.updateOne({ _id: existing._id }, { $set: { name, ...(email ? { email } : {}) } });
    }
    return db.users.findOne({ _id: existing._id });
  }
  try {
    const doc = newUser({ name, phone, email });
    await db.users.insertOne(doc);
    return doc;
  } catch (e) {
    // Two bookings for a new number at the same moment: the other one created the record.
    if (e.code === 11000) return db.users.findOne({ phone });
    throw e;
  }
}

/**
 * Books a slot after checking it exists in the schedule and still has room.
 * `actor` is the logged-in user (patient or staff) or null for a guest.
 * There's no transaction: the booking is saved, then the slot is re-counted, and the
 * booking is withdrawn if two people took the last place at the same moment.
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

  const slot = (await slotsFor(date, { forStaff })).find((s) => s.start === start);
  if (!slot) throw new HttpError(409, 'That time isn’t available. Please pick another slot.');
  if (!slot.available) throw new HttpError(409, 'Someone just took that slot. Please pick another one.');

  const patient = actor && actor.role === 'patient'
    ? actor
    : await findOrCreatePatient({ name, phone, email }, { trustDetails: forStaff });
  if (patient.role !== 'patient') throw new HttpError(422, 'This number belongs to a staff account', { phone: 'Staff number' });
  if (actor && actor.role === 'patient' && email && email !== actor.email) {
    await db.users.updateOne({ _id: actor._id }, { $set: { email } });
  }
  const clash = await db.appointments.findOne({ patient_id: patient._id, date, status: { $in: ['booked', 'checked_in'] } });
  if (clash) throw new HttpError(409, 'You already have an appointment that day. Cancel it first to pick a new time.');

  const appointment = {
    patient_id: patient._id,
    date,
    start_time: start,
    end_time: slot.end,
    concern,
    description,
    status: forStaff && input.check_in ? 'checked_in' : 'booked',
    source: forStaff ? (input.source === 'phone' ? 'phone' : 'walk_in') : 'online',
    reminder_sent: false,
    created_at: new Date(),
  };
  await db.appointments.insertOne(appointment);

  // Over capacity because of a simultaneous booking? The later booking gives way.
  const holders = await db.appointments.find({ date, start_time: start, status: { $in: HOLDING } }).sort({ _id: 1 }).project({ _id: 1 }).toArray();
  if (holders.findIndex((h) => h._id.equals(appointment._id)) >= slot.capacity) {
    await db.appointments.deleteOne({ _id: appointment._id });
    throw new HttpError(409, 'Someone just took that slot. Please pick another one.');
  }

  return { appointment, patient: await db.users.findOne({ _id: patient._id }) };
}

module.exports = { createAppointment, findOrCreatePatient, CONCERNS };
