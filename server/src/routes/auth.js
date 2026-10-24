const express = require('express');
const bcrypt = require('bcryptjs');
const { db, newUser } = require('../db');
const { normalizePhone } = require('../phone');
const { HttpError, wrap, signToken, requireAuth, publicUser, str, isEmail } = require('../util');

const router = express.Router();

/** Whether the clinic already holds medical records for this person. */
async function hasClinicalRecords(userId) {
  return !!(await db.visits.findOne({ patient_id: userId }, { projection: { _id: 1 } }));
}

/**
 * Patients sign up with name, phone and password (email optional).
 * If they booked before as a guest, the account takes over that record — unless the clinic
 * already has prescriptions under this number. Then the clinic issues a temporary password,
 * so nobody can read someone else's records just by knowing their phone number.
 */
router.post(
  '/signup',
  wrap(async (req, res) => {
    const name = str(req.body?.name, 120);
    const phone = normalizePhone(req.body?.phone);
    const email = str(req.body?.email, 200);
    const password = String(req.body?.password || '');
    const errors = {};
    if (!name) errors.name = 'Tell us your name';
    if (!phone) errors.phone = 'Enter a valid phone number';
    if (email && !isEmail(email)) errors.email = 'That email doesn’t look right';
    if (password.length < 6) errors.password = 'Use at least 6 characters';
    if (Object.keys(errors).length) throw new HttpError(422, 'Please check the highlighted fields', errors);

    const hash = await bcrypt.hash(password, 10);
    const existing = await db.users.findOne({ phone });
    let id;
    if (existing) {
      if (existing.password_hash) {
        throw new HttpError(409, 'This number already has an account. Log in instead.', { phone: 'Already registered' });
      }
      if (await hasClinicalRecords(existing._id)) {
        throw new HttpError(409, 'The clinic already has your records. Ask the reception for your login — they can send a temporary password.', { phone: 'Ask the clinic for your login' });
      }
      // Only claim the record if it's still password-less (guards against a double submit).
      const { modifiedCount } = await db.users.updateOne(
        { _id: existing._id, password_hash: null },
        { $set: { name, password_hash: hash, ...(email ? { email } : {}) } }
      );
      if (!modifiedCount) throw new HttpError(409, 'This number already has an account. Log in instead.', { phone: 'Already registered' });
      id = existing._id;
    } else {
      try {
        id = (await db.users.insertOne(newUser({ name, phone, email, password_hash: hash }))).insertedId;
      } catch (e) {
        if (e.code === 11000) throw new HttpError(409, 'This number already has an account. Log in instead.', { phone: 'Already registered' });
        throw e;
      }
    }
    const user = await db.users.findOne({ _id: id });
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  })
);

router.post(
  '/login',
  wrap(async (req, res) => {
    const phone = normalizePhone(req.body?.phone);
    const password = String(req.body?.password || '');
    const user = phone && (await db.users.findOne({ phone, active: true }));
    if (!user || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
      throw new HttpError(401, 'Phone number or password is incorrect');
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

router.get('/me', requireAuth(), (req, res) => res.json({ user: publicUser(req.user) }));

router.patch(
  '/me',
  requireAuth(),
  wrap(async (req, res) => {
    const u = req.user;
    const b = req.body || {};
    const set = {};
    if (b.name !== undefined) {
      set.name = str(b.name, 120);
      if (!set.name) throw new HttpError(422, 'Name cannot be empty');
    }
    if (b.email !== undefined) {
      set.email = str(b.email, 200);
      if (set.email && !isEmail(set.email)) throw new HttpError(422, 'That email doesn’t look right');
    }
    if (b.gender !== undefined) set.gender = str(b.gender, 20);
    if (b.dob !== undefined) set.dob = str(b.dob, 10);
    if (b.new_password !== undefined) {
      const next = String(b.new_password || '');
      if (next.length < 6) throw new HttpError(422, 'Use at least 6 characters');
      // A temporary password was just typed to log in, so it isn't asked for again.
      if (!u.must_change_password && !(await bcrypt.compare(String(b.current_password || ''), u.password_hash))) {
        throw new HttpError(403, 'Your current password is incorrect');
      }
      set.password_hash = await bcrypt.hash(next, 10);
      set.must_change_password = false;
    }
    if (Object.keys(set).length) await db.users.updateOne({ _id: u._id }, { $set: set });
    res.json({ user: publicUser(await db.users.findOne({ _id: u._id })) });
  })
);

module.exports = router;
