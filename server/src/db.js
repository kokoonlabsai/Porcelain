const { MongoClient, ObjectId } = require('mongodb');

/**
 * MongoDB: Atlas in production (MONGODB_URI=mongodb+srv://…), or a local mongod in development.
 * The database name comes from MONGODB_DB, else the URI path, else "clinic".
 */
const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/clinic';
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
const uriDb = (/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/.exec(uri) || [])[1];
const database = client.db(process.env.MONGODB_DB || uriDb || 'clinic');

const col = (name) => database.collection(name);
const db = {
  users: col('users'),
  availability: col('availability'),
  closures: col('closures'),
  appointments: col('appointments'),
  visits: col('visits'),
  attachments: col('attachments'),
  articles: col('articles'),
  settings: col('settings'),
};

/** Turns a URL/body id into an ObjectId, or null when it isn't one. */
function oid(v) {
  if (v instanceof ObjectId) return v;
  return typeof v === 'string' && /^[a-f\d]{24}$/i.test(v) ? new ObjectId(v) : null;
}

/** API shape: `_id` becomes `id`, and every ObjectId becomes its string, so the web app sees plain ids. */
function out(doc) {
  if (doc === null || doc === undefined) return doc;
  if (Array.isArray(doc)) return doc.map(out);
  if (doc instanceof ObjectId) return doc.toHexString();
  if (doc instanceof Date || typeof doc !== 'object') return doc;
  const res = {};
  for (const [k, v] of Object.entries(doc)) res[k === '_id' ? 'id' : k] = out(v);
  return res;
}

/** Case-insensitive "contains" match on user input. */
const contains = (s) => new RegExp(String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

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

/** Every user document has the same fields, so queries never trip over missing ones. */
function newUser(fields) {
  return {
    name: '', phone: '', email: null, password_hash: null, role: 'patient', must_change_password: false,
    gender: null, dob: null, notes: null, active: true, created_at: new Date(), ...fields,
  };
}

async function setup() {
  await client.connect();
  await Promise.all([
    db.users.createIndex({ phone: 1 }, { unique: true }),
    db.users.createIndex({ role: 1, name: 1 }),
    db.appointments.createIndex({ date: 1, start_time: 1 }),
    db.appointments.createIndex({ patient_id: 1, date: -1 }),
    db.visits.createIndex({ patient_id: 1, date: -1 }),
    db.visits.createIndex({ follow_up_date: 1 }),
    db.visits.createIndex({ 'items.dispensed': 1, date: -1 }),
    db.attachments.createIndex({ patient_id: 1, created_at: -1 }),
    db.attachments.createIndex({ visit_id: 1 }),
    db.articles.createIndex({ slug: 1 }, { unique: true }),
    db.closures.createIndex({ date: 1 }, { unique: true }),
    db.availability.createIndex({ weekday: 1, start_time: 1 }),
  ]);

  // First start only: default settings, opening hours and the starter articles.
  const before = await db.settings.findOneAndUpdate(
    { _id: 'clinic' },
    { $setOnInsert: { ...DEFAULT_SETTINGS } },
    { upsert: true, returnDocument: 'before' }
  );
  if (!before) {
    const articles = require('./content/articles');
    const now = new Date();
    await db.availability.insertMany(DEFAULT_HOURS.map((h) => ({ ...h })));
    await db.articles.insertMany(articles.map((a) => ({
      slug: a.slug, title: a.title, category: a.category, summary: a.summary, body: a.body,
      read_minutes: a.read_minutes || 3, published: true, created_at: now, updated_at: now,
    })));
  }

  await bootstrapAdmin();
}

/** ADMIN_PHONE + ADMIN_PASSWORD create (or promote) the first admin, so a fresh deploy can be logged into. */
async function bootstrapAdmin() {
  const { normalizePhone } = require('./phone');
  const bcrypt = require('bcryptjs');
  const phone = normalizePhone(process.env.ADMIN_PHONE);
  const password = process.env.ADMIN_PASSWORD;
  if (!phone || !password) return;
  const existing = await db.users.findOne({ phone });
  if (existing) {
    const set = { role: 'admin', active: true };
    if (!existing.password_hash) set.password_hash = await bcrypt.hash(password, 10);
    await db.users.updateOne({ _id: existing._id }, { $set: set });
    return;
  }
  await db.users.insertOne(newUser({
    name: process.env.ADMIN_NAME || 'Clinic Admin', phone, role: 'admin', password_hash: await bcrypt.hash(password, 10),
  }));
}

const ready = setup();
ready.catch((e) => console.error('[db] could not connect to MongoDB:', e.message));

async function getSettings() {
  const doc = (await db.settings.findOne({ _id: 'clinic' })) || {};
  const settings = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS)) if (typeof doc[k] === 'string') settings[k] = doc[k];
  return settings;
}

module.exports = { db, client, database, ready, getSettings, DEFAULT_SETTINGS, oid, out, contains, newUser, ObjectId };
