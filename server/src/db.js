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
  products: col('products'),
  orders: col('orders'),
  packages: col('packages'),
  patient_packages: col('patient_packages'),
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
  clinic_name: 'Porcelain Skin Clinic',
  tagline: 'Evidence-based dermatology and aesthetics. Subtle, yet substantial results',
  city: 'Bhopal',
  doctor_name: 'Dr. Mayank Bajpai',
  doctor_role: 'Founder & Chief Dermatologist',
  doctor_credentials: 'MBBS, MD (Dermatology, Venereology & Leprosy)',
  doctor_experience: '10+ years',
  doctor_bio: 'ECFMG-certified, with clinical experience at Mount Sinai Beth Israel, New York. MD from MGM Medical College & MY Hospital, Indore.',
  doctor_tags: 'Acne & scars · Pigmentation · Hair loss · Lasers · Injectables',
  // One per line, shown under the doctor's card.
  doctor_awards: 'Member, IADVL\n1st prize, award paper — Cuticon Bhopal 2022\nQuiz winner — Cuticon Gwalior 2022',
  doctor2_name: 'Dr. Nitya Bajpai',
  doctor2_role: 'Co-founder & Medical Director',
  doctor2_credentials: 'MBBS, Fellowship in Aesthetic Medicine',
  doctor2_experience: '5+ years',
  doctor2_bio: 'Curates Porcelain’s treatments and lasers with experts worldwide — global standards, here in Bhopal.',
  doctor2_tags: 'Clinical facials · Peels · Lasers · Injectables · Skin boosters',
  doctor2_awards: '',
  founders_quote: 'Our products, technologies and techniques are at par with international standards — and we hope to make Bhopal one of the world’s great cities for skin care.',
  // One highlight per line: "value | label". A leading number counts up on the home page.
  highlights: '2000+ | Patients treated\n10+ | Years in dermatology\nNew York | Clinical experience, Mount Sinai\nParis | Fellowship in aesthetic medicine',
  phone: '+91 6268-440839',
  whatsapp: '',
  email: 'touch@porcelainskinclinic.com',
  address: 'E-7/578, Arera Colony, Bhopal, Madhya Pradesh 462016',
  maps_url: 'https://www.google.com/maps/search/?api=1&query=Porcelain+Skin+Clinic+Arera+Colony+Bhopal',
  instagram: 'https://www.instagram.com/porcelainskinclinic/',
  booking_days_ahead: '30',
  min_notice_minutes: '60',
  // Consultation fee (₹), and how many days after a paid consultation follow-ups are free.
  consultation_fee: '500',
  consultation_free_days: '7',
  // Booking deposit (₹) for online bookings of procedures and/or weekend slots. Needs Razorpay.
  deposit_amount: '1000',
  deposit_procedures: '1',
  deposit_weekends: '1',
  deposit_refund_hours: '24',
  shop_delivery: '1',
  shop_delivery_fee: '99',
  shop_free_delivery_over: '1499',
  shop_delivery_areas: 'Bhopal',
};

/** Every day except Thursday, 12:00 noon – 7:45 PM, 30-minute slots. Admin can change it. */
const DEFAULT_HOURS = [0, 1, 2, 3, 5, 6].map((weekday) => ({ weekday, start_time: '12:00', end_time: '19:45', slot_minutes: 30, capacity: 1 }));

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
    db.products.createIndex({ slug: 1 }, { unique: true }),
    db.products.createIndex({ active: 1, category: 1 }),
    db.orders.createIndex({ number: 1 }, { unique: true }),
    db.appointments.createIndex({ 'deposit.razorpay_order_id': 1 }, { sparse: true }),
    db.appointments.createIndex({ status: 1, created_at: 1 }),
    db.appointments.createIndex({ patient_id: 1, 'fee.status': 1, date: -1 }),
    db.appointments.createIndex({ 'fee.paid_at': -1 }),
    db.patient_packages.createIndex({ patient_id: 1, status: 1 }),
    db.patient_packages.createIndex({ 'sessions.visit_id': 1 }),
    db.orders.createIndex({ status: 1, created_at: -1 }),
    db.orders.createIndex({ patient_id: 1, created_at: -1 }),
    db.orders.createIndex({ 'customer.phone': 1 }),
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
