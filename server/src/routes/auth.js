const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { normalizePhone } = require('../phone');
const { HttpError, wrap, signToken, requireAuth, publicUser, str, isEmail } = require('../util');

const router = express.Router();

/** Whether the clinic already holds medical records for this person. */
async function hasClinicalRecords(userId) {
  return !!(await db.get('SELECT 1 FROM visits WHERE patient_id = ? LIMIT 1', userId));
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
    const existing = await db.get('SELECT * FROM users WHERE phone = ?', phone);
    let id;
    if (existing) {
      if (existing.password_hash) {
        throw new HttpError(409, 'This number already has an account. Log in instead.', { phone: 'Already registered' });
      }
      if (await hasClinicalRecords(existing.id)) {
        throw new HttpError(409, 'The clinic already has your records. Ask the reception for your login — they can send a temporary password.', { phone: 'Ask the clinic for your login' });
      }
      await db.run('UPDATE users SET name = ?, email = COALESCE(?, email), password_hash = ? WHERE id = ?', name, email, hash, existing.id);
      id = existing.id;
    } else {
      id = (await db.run('INSERT INTO users (name, phone, email, password_hash) VALUES (?, ?, ?, ?)', name, phone, email, hash)).lastInsertRowid;
    }
    const user = await db.get('SELECT * FROM users WHERE id = ?', id);
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  })
);

router.post(
  '/login',
  wrap(async (req, res) => {
    const phone = normalizePhone(req.body?.phone);
    const password = String(req.body?.password || '');
    const user = phone && (await db.get('SELECT * FROM users WHERE phone = ? AND active = 1', phone));
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
    if (b.name !== undefined) {
      const name = str(b.name, 120);
      if (!name) throw new HttpError(422, 'Name cannot be empty');
      await db.run('UPDATE users SET name = ? WHERE id = ?', name, u.id);
    }
    if (b.email !== undefined) {
      const email = str(b.email, 200);
      if (email && !isEmail(email)) throw new HttpError(422, 'That email doesn’t look right');
      await db.run('UPDATE users SET email = ? WHERE id = ?', email, u.id);
    }
    if (b.gender !== undefined) await db.run('UPDATE users SET gender = ? WHERE id = ?', str(b.gender, 20), u.id);
    if (b.dob !== undefined) await db.run('UPDATE users SET dob = ? WHERE id = ?', str(b.dob, 10), u.id);
    if (b.new_password !== undefined) {
      const next = String(b.new_password || '');
      if (next.length < 6) throw new HttpError(422, 'Use at least 6 characters');
      // A temporary password was just typed to log in, so it isn't asked for again.
      if (!u.must_change_password && !(await bcrypt.compare(String(b.current_password || ''), u.password_hash))) {
        throw new HttpError(403, 'Your current password is incorrect');
      }
      await db.run('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', await bcrypt.hash(next, 10), u.id);
    }
    const user = await db.get('SELECT * FROM users WHERE id = ?', u.id);
    res.json({ user: publicUser(user) });
  })
);

module.exports = router;
