const path = require('path');
const fs = require('fs');
const { createClient } = require('@libsql/client');

/**
 * Database: Turso (hosted libSQL/SQLite) when TURSO_DATABASE_URL is set,
 * otherwise a local SQLite file — same SQL either way.
 */
function connect() {
  if (process.env.TURSO_DATABASE_URL) {
    return createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  const file = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'clinic.db');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return createClient({ url: `file:${file}` });
}

const client = connect();

const clean = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
function toArgs(params) {
  if (params.length === 1 && params[0] && typeof params[0] === 'object' && !Array.isArray(params[0])) {
    return Object.fromEntries(Object.entries(params[0]).map(([k, v]) => [k, clean(v)]));
  }
  return params.map(clean);
}
const toObjects = (rs) => rs.rows.map((r) => ({ ...r }));

/** Small query helpers shared by the client and transactions. */
function wrap(exec) {
  return {
    async all(sql, ...params) {
      return toObjects(await exec({ sql, args: toArgs(params) }));
    },
    async get(sql, ...params) {
      return toObjects(await exec({ sql, args: toArgs(params) }))[0];
    },
    async run(sql, ...params) {
      const rs = await exec({ sql, args: toArgs(params) });
      return { changes: rs.rowsAffected, lastInsertRowid: rs.lastInsertRowid === undefined ? undefined : Number(rs.lastInsertRowid) };
    },
  };
}

const db = {
  ...wrap((stmt) => client.execute(stmt)),
  /** Several writes in one atomic round-trip. */
  batch(statements) {
    return client.batch(statements.map(([sql, ...params]) => ({ sql, args: toArgs(params) })), 'write');
  },
  /** Interactive transaction: fn receives the same all/get/run helpers. */
  async tx(fn) {
    const t = await client.transaction('write');
    try {
      const result = await fn(wrap((stmt) => t.execute(stmt)));
      await t.commit();
      return result;
    } catch (e) {
      await t.rollback().catch(() => {});
      throw e;
    } finally {
      t.close();
    }
  },
};

const SCHEMA = `
-- Everyone who can log in or has a record: patients and staff.
-- Patients booked as guests have no password until they sign up or the clinic issues one.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'patient' CHECK (role IN ('patient','doctor','reception','admin')),
  must_change_password INTEGER NOT NULL DEFAULT 0,
  gender TEXT,
  dob TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Weekly opening hours. A day can have several windows, each with its own slot length.
CREATE TABLE IF NOT EXISTS availability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  slot_minutes INTEGER NOT NULL DEFAULT 30,
  capacity INTEGER NOT NULL DEFAULT 1
);

-- Holidays and days off: no slots on these dates.
CREATE TABLE IF NOT EXISTS closures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  reason TEXT
);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  concern TEXT NOT NULL DEFAULT 'skin',
  description TEXT,
  status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','checked_in','completed','cancelled','no_show')),
  source TEXT NOT NULL DEFAULT 'online',
  reminder_sent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_appt_date ON appointments(date, start_time);
CREATE INDEX IF NOT EXISTS idx_appt_patient ON appointments(patient_id);

-- One consultation: what the doctor found, did and advised.
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
  doctor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  concern TEXT,
  complaint TEXT,
  diagnosis TEXT,
  procedure_done TEXT,
  advice TEXT,
  private_notes TEXT,
  follow_up_date TEXT,
  follow_up_reminded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_visits_patient ON visits(patient_id, date);
CREATE INDEX IF NOT EXISTS idx_visits_followup ON visits(follow_up_date);

CREATE TABLE IF NOT EXISTS prescription_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_id INTEGER NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  medicine TEXT NOT NULL,
  kind TEXT,
  dosage TEXT,
  frequency TEXT,
  duration TEXT,
  instructions TEXT,
  quantity TEXT,
  dispensed INTEGER NOT NULL DEFAULT 0,
  dispensed_at TEXT,
  dispensed_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_rx_visit ON prescription_items(visit_id);

-- Photos and reports. Stored in the database so the server keeps no files of its own.
CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visit_id INTEGER REFERENCES visits(id) ON DELETE CASCADE,
  mime TEXT NOT NULL,
  data TEXT NOT NULL,
  size INTEGER NOT NULL,
  caption TEXT,
  visible_to_patient INTEGER NOT NULL DEFAULT 1,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_att_patient ON attachments(patient_id);
CREATE INDEX IF NOT EXISTS idx_att_visit ON attachments(visit_id);

CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  read_minutes INTEGER NOT NULL DEFAULT 3,
  published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const DEFAULT_SETTINGS = {
  clinic_name: 'Derma Clinic',
  tagline: 'Skin, hair & wellness — cared for by dermatologists',
  doctor_name: 'Dr. Your Name',
  doctor_credentials: 'MBBS, MD (Dermatology)',
  phone: '',
  whatsapp: '',
  email: '',
  address: '',
  maps_url: '',
  booking_days_ahead: '30',
  min_notice_minutes: '60',
};

/** Monday–Saturday 10:00–13:00 and 16:00–19:00, 30-minute slots. Admin can change it. */
const DEFAULT_HOURS = [1, 2, 3, 4, 5, 6].flatMap((weekday) => [
  { weekday, start_time: '10:00', end_time: '13:00', slot_minutes: 30, capacity: 1 },
  { weekday, start_time: '16:00', end_time: '19:00', slot_minutes: 30, capacity: 1 },
]);

async function migrate() {
  await client.executeMultiple(SCHEMA);

  await db.batch(Object.entries(DEFAULT_SETTINGS).map(([k, v]) => ['INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', k, v]));

  // First start only: seed opening hours and the starter articles.
  const seeded = await db.get("SELECT value FROM settings WHERE key = 'seeded'");
  if (!seeded) {
    const articles = require('./content/articles');
    await db.batch([
      ...DEFAULT_HOURS.map((h) => [
        'INSERT INTO availability (weekday, start_time, end_time, slot_minutes, capacity) VALUES (?, ?, ?, ?, ?)',
        h.weekday, h.start_time, h.end_time, h.slot_minutes, h.capacity,
      ]),
      ...articles.map((a) => [
        'INSERT OR IGNORE INTO articles (slug, title, category, summary, body, read_minutes) VALUES (?, ?, ?, ?, ?, ?)',
        a.slug, a.title, a.category, a.summary, a.body, a.read_minutes || 3,
      ]),
      ["INSERT INTO settings (key, value) VALUES ('seeded', '1')"],
    ]);
  }

  await bootstrapAdmin();
}

/** ADMIN_PHONE + ADMIN_PASSWORD create (or promote) the first admin, so a fresh deploy can be logged into. */
async function bootstrapAdmin() {
  const { normalizePhone } = require('./phone');
  const phone = normalizePhone(process.env.ADMIN_PHONE);
  const password = process.env.ADMIN_PASSWORD;
  if (!phone || !password) return;
  const existing = await db.get('SELECT id, role, password_hash FROM users WHERE phone = ?', phone);
  if (existing) {
    if (existing.role !== 'admin') await db.run("UPDATE users SET role = 'admin' WHERE id = ?", existing.id);
    if (!existing.password_hash) {
      const bcrypt = require('bcryptjs');
      await db.run('UPDATE users SET password_hash = ? WHERE id = ?', await bcrypt.hash(password, 10), existing.id);
    }
    return;
  }
  const bcrypt = require('bcryptjs');
  await db.run(
    "INSERT INTO users (name, phone, password_hash, role) VALUES (?, ?, ?, 'admin')",
    process.env.ADMIN_NAME || 'Clinic Admin', phone, await bcrypt.hash(password, 10)
  );
}

const ready = migrate();

async function getSettings() {
  const rows = await db.all('SELECT key, value FROM settings');
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) out[r.key] = r.value;
  return out;
}

module.exports = { db, client, ready, getSettings, DEFAULT_SETTINGS };
