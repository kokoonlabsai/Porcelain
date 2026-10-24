const express = require('express');
const crypto = require('crypto');
const { Binary } = require('mongodb');
const { db, getSettings, oid, out, contains, ObjectId } = require('../db');
const { normalizePhone } = require('../phone');
const mail = require('../mail');
const { HttpError, wrap, optionalAuth, requireAuth, requireStaff, str, isEmail } = require('../util');

/**
 * The shop: products, cart checkout and orders.
 * Payment happens at the clinic (pickup) or on delivery — no card details ever reach this server.
 */
const CATEGORIES = ['cleansers', 'serums', 'moisturisers', 'sunscreen', 'treatments', 'hair', 'body'];
const ORDER_STATUSES = ['placed', 'confirmed', 'ready', 'completed', 'cancelled'];
const MAX_IMAGE = 3 * 1024 * 1024;

/** Product in API shape: no image bytes, just a cache-busting URL when there is one. */
function productOut(p) {
  const { image, ...rest } = p;
  const res = out(rest);
  res.image_url = image ? `/api/shop/products/${p._id}/image?v=${(p.updated_at || p.created_at).getTime()}` : null;
  return res;
}

async function deliveryTerms() {
  const s = await getSettings();
  return {
    fee: Math.max(0, Number(s.shop_delivery_fee) || 0),
    freeOver: Math.max(0, Number(s.shop_free_delivery_over) || 0),
    enabled: s.shop_delivery !== '0',
    areas: s.shop_delivery_areas,
  };
}

function orderNumber() {
  return `PSC-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

// ---------- Public ----------

const pub = express.Router();

pub.get(
  '/products',
  wrap(async (req, res) => {
    const filter = { active: true };
    if (CATEGORIES.includes(req.query.category)) filter.category = req.query.category;
    if (str(req.query.q, 80)) filter.$or = [{ name: contains(req.query.q) }, { brand: contains(req.query.q) }, { summary: contains(req.query.q) }];
    const rows = await db.products.find(filter).sort({ featured: -1, category: 1, name: 1 }).toArray();
    res.json({ products: rows.map(productOut), categories: CATEGORIES, delivery: await deliveryTerms() });
  })
);

pub.get(
  '/products/:slug',
  wrap(async (req, res) => {
    const p = await db.products.findOne({ slug: String(req.params.slug), active: true });
    if (!p) throw new HttpError(404, 'Product not found');
    const related = await db.products.find({ active: true, category: p.category, _id: { $ne: p._id } }).limit(4).toArray();
    res.json({ product: productOut(p), related: related.map(productOut), delivery: await deliveryTerms() });
  })
);

pub.get(
  '/products/:id/image',
  wrap(async (req, res) => {
    const p = await db.products.findOne({ _id: oid(req.params.id) }, { projection: { image: 1 } });
    if (!p?.image) throw new HttpError(404, 'No image');
    res.set('Content-Type', p.image.mime);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(Buffer.from(p.image.data.buffer));
  })
);

/** Place an order. Prices come from the database; stock is reserved item by item and released if anything fails. */
pub.post(
  '/orders',
  optionalAuth(),
  wrap(async (req, res) => {
    const b = req.body || {};
    const patient = req.user && req.user.role === 'patient' ? req.user : null;
    const errors = {};
    const name = str(b.name, 120) || patient?.name;
    const phone = normalizePhone(b.phone) || patient?.phone;
    const email = str(b.email, 200) || patient?.email || null;
    if (!name) errors.name = 'Tell us your name';
    if (!phone) errors.phone = 'Enter a valid phone number';
    if (email && !isEmail(email)) errors.email = 'That email doesn’t look right';
    const terms = await deliveryTerms();
    const fulfilment = b.fulfilment === 'delivery' && terms.enabled ? 'delivery' : 'pickup';
    let address = null;
    if (fulfilment === 'delivery') {
      address = { line: str(b.address, 300), city: str(b.city, 80), pincode: str(b.pincode, 10) };
      if (!address.line) errors.address = 'Add your delivery address';
      if (!address.city) errors.city = 'Add your city';
      if (!/^\d{6}$/.test(address.pincode || '')) errors.pincode = 'Enter a 6-digit PIN code';
    }
    const wanted = new Map();
    for (const i of Array.isArray(b.items) ? b.items : []) {
      const id = oid(String(i?.product_id || ''));
      const qty = Math.floor(Number(i?.qty));
      if (id && qty > 0) wanted.set(id.toHexString(), Math.min(10, (wanted.get(id.toHexString()) || 0) + qty));
    }
    if (!wanted.size) errors.items = 'Your bag is empty';
    if (Object.keys(errors).length) throw new HttpError(422, 'Please check the highlighted fields', errors);

    const products = await db.products.find({ _id: { $in: [...wanted.keys()].map((k) => new ObjectId(k)) }, active: true }).toArray();
    if (products.length !== wanted.size) throw new HttpError(409, 'Some items are no longer available. Please review your bag.');

    const reserved = [];
    try {
      for (const p of products) {
        const qty = wanted.get(p._id.toHexString());
        const r = await db.products.updateOne({ _id: p._id, stock: { $gte: qty } }, { $inc: { stock: -qty } });
        if (!r.modifiedCount) throw new HttpError(409, `Only ${p.stock} of “${p.name}” left. Please update your bag.`, { product_id: String(p._id) });
        reserved.push([p._id, qty]);
      }
    } catch (e) {
      await Promise.all(reserved.map(([id, qty]) => db.products.updateOne({ _id: id }, { $inc: { stock: qty } })));
      throw e;
    }

    const items = products.map((p) => ({ product_id: p._id, name: p.name, brand: p.brand || null, size: p.size || null, price: p.price, qty: wanted.get(p._id.toHexString()) }));
    const subtotal = items.reduce((n, i) => n + i.price * i.qty, 0);
    const deliveryFee = fulfilment === 'delivery' && !(terms.freeOver && subtotal >= terms.freeOver) ? terms.fee : 0;
    const order = {
      number: orderNumber(),
      patient_id: patient?._id || null,
      customer: { name, phone, email },
      fulfilment,
      address,
      items,
      subtotal,
      delivery_fee: deliveryFee,
      total: subtotal + deliveryFee,
      payment: fulfilment === 'delivery' ? 'cod' : 'pay_at_clinic',
      notes: str(b.notes, 500),
      status: 'placed',
      created_at: new Date(),
      updated_at: new Date(),
    };
    await db.orders.insertOne(order);
    if (email) mail.orderConfirmation(order).catch(() => {});
    res.status(201).json({ order: out(order) });
  })
);

// ---------- Patient: my orders ----------

const mine = express.Router();
mine.get(
  '/',
  requireAuth('patient'),
  wrap(async (req, res) => {
    const rows = await db.orders.find({ $or: [{ patient_id: req.user._id }, { 'customer.phone': req.user.phone }] }).sort({ created_at: -1 }).limit(50).toArray();
    res.json({ orders: out(rows) });
  })
);

// ---------- Staff: orders ----------

const staff = express.Router();
staff.use(requireStaff());

staff.get(
  '/',
  wrap(async (req, res) => {
    const filter = {};
    if (ORDER_STATUSES.includes(req.query.status)) filter.status = req.query.status;
    else if (req.query.status === 'open') filter.status = { $in: ['placed', 'confirmed', 'ready'] };
    const q = str(req.query.q, 80);
    if (q) filter.$or = [{ number: contains(q) }, { 'customer.name': contains(q) }, { 'customer.phone': contains(q.replace(/\D/g, '') || q) }];
    const rows = await db.orders.find(filter).sort({ created_at: -1 }).limit(100).toArray();
    const open = await db.orders.countDocuments({ status: { $in: ['placed', 'confirmed', 'ready'] } });
    res.json({ orders: out(rows), open });
  })
);

staff.patch(
  '/:id',
  wrap(async (req, res) => {
    const o = await db.orders.findOne({ _id: oid(req.params.id) });
    if (!o) throw new HttpError(404, 'Order not found');
    const status = req.body?.status;
    if (!ORDER_STATUSES.includes(status)) throw new HttpError(422, 'Unknown status');
    if (o.status === 'cancelled') throw new HttpError(409, 'This order was cancelled');
    if (status === 'cancelled') {
      // Put the stock back.
      await Promise.all(o.items.map((i) => db.products.updateOne({ _id: i.product_id }, { $inc: { stock: i.qty } })));
    }
    await db.orders.updateOne({ _id: o._id }, { $set: { status, updated_at: new Date() } });
    res.json({ order: out(await db.orders.findOne({ _id: o._id })) });
  })
);

// ---------- Admin: products ----------

const admin = express.Router();
admin.use(requireAuth('admin'));

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const money = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

function productFields(b) {
  const errors = {};
  const f = {
    name: str(b.name, 160),
    brand: str(b.brand, 80),
    category: b.category,
    size: str(b.size, 40),
    summary: str(b.summary, 300) || '',
    description: str(b.description, 4000) || '',
    how_to_use: str(b.how_to_use, 2000) || '',
    ingredients: str(b.ingredients, 1000) || '',
    skin_types: str(b.skin_types, 200) || '',
    price: money(b.price),
    mrp: b.mrp === '' || b.mrp === null || b.mrp === undefined ? null : money(b.mrp),
    stock: Math.max(0, Math.floor(Number(b.stock) || 0)),
    active: b.active !== false,
    featured: !!b.featured,
  };
  if (!f.name) errors.name = 'Name is required';
  if (!CATEGORIES.includes(f.category)) errors.category = 'Pick a category';
  if (f.price === null || f.price <= 0) errors.price = 'Enter a price in rupees';
  if (f.mrp !== null && f.mrp < f.price) errors.mrp = 'MRP can’t be lower than the price';
  if (Object.keys(errors).length) throw new HttpError(422, 'Please check the highlighted fields', errors);
  return f;
}

function imageField(data) {
  if (data === null) return null;
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(data || ''));
  if (!m) throw new HttpError(422, 'Use a JPG, PNG or WebP image', { image: 'Use a JPG, PNG or WebP image' });
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > MAX_IMAGE) throw new HttpError(413, 'That image is larger than 3 MB', { image: 'Too large' });
  return { mime: m[1], data: new Binary(bytes), size: bytes.length };
}

admin.get(
  '/',
  wrap(async (req, res) => {
    const rows = await db.products.find({}).sort({ active: -1, category: 1, name: 1 }).toArray();
    res.json({ products: rows.map(productOut), categories: CATEGORIES });
  })
);

admin.post(
  '/',
  wrap(async (req, res) => {
    const f = productFields(req.body || {});
    let slug = slugify(f.name) || 'product';
    if (await db.products.findOne({ slug })) slug = `${slug}-${Date.now().toString(36)}`;
    const now = new Date();
    const doc = { slug, ...f, image: req.body?.image ? imageField(req.body.image) : null, created_at: now, updated_at: now };
    await db.products.insertOne(doc);
    res.status(201).json({ product: productOut(doc) });
  })
);

admin.put(
  '/:id',
  wrap(async (req, res) => {
    const p = await db.products.findOne({ _id: oid(req.params.id) });
    if (!p) throw new HttpError(404, 'Product not found');
    const set = { ...productFields(req.body || {}), updated_at: new Date() };
    // `image` omitted keeps the current one; null removes it; a data URL replaces it.
    if (req.body?.image !== undefined) set.image = imageField(req.body.image);
    await db.products.updateOne({ _id: p._id }, { $set: set });
    res.json({ product: productOut(await db.products.findOne({ _id: p._id })) });
  })
);

admin.delete(
  '/:id',
  wrap(async (req, res) => {
    // Products that were ordered stay on the record but disappear from the shop.
    const _id = oid(req.params.id);
    const ordered = await db.orders.findOne({ 'items.product_id': _id }, { projection: { _id: 1 } });
    if (ordered) await db.products.updateOne({ _id }, { $set: { active: false, updated_at: new Date() } });
    else await db.products.deleteOne({ _id });
    res.json({ ok: true, archived: !!ordered });
  })
);

module.exports = { pub, mine, staff, admin, CATEGORIES };
