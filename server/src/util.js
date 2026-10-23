const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { db } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('[clinic] JWT_SECRET is not set — using an insecure default. Set it in production.');
}

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const STAFF_ROLES = ['doctor', 'reception', 'admin'];

function signToken(user) {
  return jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: user.role === 'patient' ? '60d' : '14d' });
}

async function userFromJwt(token) {
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
  const user = await db.get('SELECT * FROM users WHERE id = ? AND active = 1', payload.sub);
  return user && user.password_hash ? user : null;
}

/** Reads the session if there is one; never rejects. */
async function readSession(req) {
  const header = req.get('authorization') || '';
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null;
  return bearer ? userFromJwt(bearer) : null;
}

function optionalAuth() {
  return async (req, res, next) => {
    try {
      req.user = await readSession(req);
      next();
    } catch (e) {
      next(e);
    }
  };
}

/** requireAuth() for any logged-in person; requireAuth('doctor', 'admin') to limit by role. */
function requireAuth(...roles) {
  return async (req, res, next) => {
    try {
      const user = await readSession(req);
      if (!user) return next(new HttpError(401, 'Please log in'));
      if (roles.length && !roles.includes(user.role)) return next(new HttpError(403, 'You do not have access to this'));
      req.user = user;
      next();
    } catch (e) {
      next(e);
    }
  };
}
const requireStaff = () => requireAuth(...STAFF_ROLES);

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    email: u.email,
    role: u.role,
    gender: u.gender,
    dob: u.dob,
    must_change_password: !!u.must_change_password,
    has_account: !!u.password_hash,
    created_at: u.created_at,
  };
}

/** Readable temporary password, e.g. "skin-4821". */
function tempPassword() {
  const words = ['skin', 'glow', 'calm', 'care', 'leaf', 'aloe', 'mint', 'silk', 'dew', 'sun'];
  return `${words[crypto.randomInt(words.length)]}-${crypto.randomInt(1000, 10000)}`;
}

const pad = (n) => String(n).padStart(2, '0');
/** Dates are the clinic's local calendar dates (set TZ to the clinic's time zone). */
function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function today() {
  return toISODate(new Date());
}
function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return toISODate(new Date(y, m - 1, d + n));
}
function isISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
function isTime(s) {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}
const toMinutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fromMinutes = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

const str = (v, max = 2000) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};
const isEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

module.exports = {
  HttpError,
  wrap,
  STAFF_ROLES,
  signToken,
  requireAuth,
  requireStaff,
  optionalAuth,
  publicUser,
  tempPassword,
  toISODate,
  today,
  addDays,
  isISODate,
  isTime,
  toMinutes,
  fromMinutes,
  str,
  isEmail,
};
