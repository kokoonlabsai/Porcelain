const express = require('express');
const crypto = require('crypto');
const { Binary } = require('mongodb');
const { db, getSettings, oid, out, contains, ObjectId } = require('../db');
const { normalizePhone } = require('../phone');
const mail = require('../mail');
const razorpay = require('../razorpay');
const { HttpError, wrap, optionalAuth, requireAuth, requireStaff, str, isEmail } = require('../util');

/**
 * The shop: products, cart checkout and orders.
 * Customers pay online through Razorpay (when its keys are set), at the clinic on pickup, or on delivery.
 * Card and UPI details are entered on Razorpay's checkout and never reach this server.
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

/** Unpaid online orders give their stock back after this long. */
const PAYMENT_WINDOW_MS = 30 * 60_000;

const releaseStock = (order) => Promise.all(order.items.map((i) => db.products.updateOne({ _id: i.product_id }, { $inc: { stock: i.qty } })));

/**
 * Marks an online order paid (from the checkout handler, the webhook or the expiry check). Safe to call twice.
 * A payment that arrives after the order expired revives it, and staff are told to check the stock.
 */
async function markPaid(order, paymentId, via) {
  const now = new Date();
  const revived = order.status === 'cancelled' && order.cancel_reason === 'payment_timeout';
  const r = await db.orders.updateOne(
    { _id: order._id, payment_status: { $ne: 'paid' } },
    {
      $set: {
        payment_status: 'paid', razorpay_payment_id: paymentId, paid_at: now, paid_via: via, status: 'placed', updated_at: now,
        ...(revived ? { staff_note: 'Paid after the order had expired — please check stock.' } : {}),
      },
      $unset: { cancel_reason: '' },
    }
  );
  if (!r.modifiedCount) return false;
  if (revived) await Promise.all(order.items.map((i) => db.products.updateOne({ _id: i.product_id }, { $inc: { stock: -i.qty } })));
  const fresh = await db.orders.findOne({ _id: order._id });
  if (fresh.customer.email) mail.orderConfirmation(fresh).catch(() => {});
  return true;
}

/** Releases stock held by online orders nobody paid for — after checking with Razorpay first. */
async function expireUnpaidOrders() {
  if (!razorpay.enabled()) return 0;
  const stale = await db.orders.find({ status: 'awaiting_payment', created_at: { $lt: new Date(Date.now() - PAYMENT_WINDOW_MS) } }).toArray();
  let expired = 0;
  for (const o of stale) {
    try {
      const { items = [] } = await razorpay.orderPayments(o.razorpay_order_id);
      const paid = items.find((p) => p.status === 'captured' || p.status === 'authorized');
      if (paid) { await markPaid(o, paid.id, 'reconcile'); continue; }
    } catch {
      continue; // Razorpay unreachable: try again on the next run rather than guess.
    }
    const r = await db.orders.updateOne({ _id: o._id, status: 'awaiting_payment' }, { $set: { status: 'cancelled', cancel_reason: 'payment_timeout', payment_status: 'failed', updated_at: new Date() } });
    if (r.modifiedCount) { await releaseStock(o); expired++; }
  }
  return expired;
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
    const online = b.payment === 'online';
    if (online && !razorpay.enabled()) throw new HttpError(422, 'Online payment isn’t available. Please choose pay at the clinic or on delivery.');
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
      payment: online ? 'online' : fulfilment === 'delivery' ? 'cod' : 'pay_at_clinic',
      payment_status: online ? 'pending' : 'due',
      notes: str(b.notes, 500),
      status: online ? 'awaiting_payment' : 'placed',
      created_at: new Date(),
      updated_at: new Date(),
    };
    await db.orders.insertOne(order);

    if (!online) {
      if (email) mail.orderConfirmation(order).catch(() => {});
      return res.status(201).json({ order: out(order) });
    }

    // Online: a Razorpay order for the exact total, in paise. The browser opens Razorpay's checkout with it.
    let rzp;
    try {
      rzp = await razorpay.createOrder({ amount: order.total * 100, receipt: order.number, notes: { order_id: String(order._id), order_number: order.number } });
    } catch (e) {
      await db.orders.deleteOne({ _id: order._id });
      await releaseStock(order);
      console.error('[razorpay] create order failed:', e.message);
      throw new HttpError(502, 'Online payment isn’t available right now. Please choose pay at the clinic or on delivery.');
    }
    await db.orders.updateOne({ _id: order._id }, { $set: { razorpay_order_id: rzp.id } });
    const s = await getSettings();
    res.status(201).json({
      order: out({ ...order, razorpay_order_id: rzp.id }),
      razorpay: {
        key: razorpay.keyId(), order_id: rzp.id, amount: rzp.amount, currency: rzp.currency,
        name: s.clinic_name, description: `Order ${order.number}`, prefill: { name, contact: phone, email: email || '' },
      },
    });
  })
);

pub.get('/config', (req, res) => res.json({ online_payment: razorpay.enabled() }));

/** Razorpay checkout succeeded in the browser: check the signature, then mark the order paid. */
pub.post(
  '/orders/:id/verify',
  wrap(async (req, res) => {
    const o = await db.orders.findOne({ _id: oid(req.params.id) });
    const b = req.body || {};
    if (!o || o.payment !== 'online' || o.razorpay_order_id !== b.razorpay_order_id) throw new HttpError(404, 'Order not found');
    if (!razorpay.verifyPayment(b)) throw new HttpError(400, 'We couldn’t confirm that payment. If money was taken, it will be matched automatically — or call the clinic.');
    await markPaid(o, b.razorpay_payment_id, 'checkout');
    res.json({ order: out(await db.orders.findOne({ _id: o._id })) });
  })
);

/** The customer closed Razorpay's window without paying: give the stock back now instead of in 30 minutes. */
pub.post(
  '/orders/:id/abandon',
  wrap(async (req, res) => {
    const o = await db.orders.findOne({ _id: oid(req.params.id) });
    if (!o || o.status !== 'awaiting_payment' || o.razorpay_order_id !== req.body?.razorpay_order_id) return res.json({ ok: true });
    try {
      const { items = [] } = await razorpay.orderPayments(o.razorpay_order_id);
      const paid = items.find((p) => p.status === 'captured' || p.status === 'authorized');
      if (paid) { await markPaid(o, paid.id, 'reconcile'); return res.json({ ok: true, paid: true }); }
    } catch {
      return res.json({ ok: true }); // Let the expiry check decide later.
    }
    const r = await db.orders.updateOne({ _id: o._id, status: 'awaiting_payment' }, { $set: { status: 'cancelled', cancel_reason: 'payment_abandoned', payment_status: 'failed', updated_at: new Date() } });
    if (r.modifiedCount) await releaseStock(o);
    res.json({ ok: true });
  })
);

/**
 * Razorpay webhook (Dashboard → Webhooks → https://your-site/api/shop/razorpay/webhook, events: payment.captured, order.paid).
 * Catches payments where the customer closed the browser before returning. Needs the raw body for the signature.
 */
const webhook = express.Router();
webhook.post(
  '/',
  express.raw({ type: '*/*', limit: '1mb' }),
  wrap(async (req, res) => {
    if (!razorpay.verifyWebhook(req.body, req.get('x-razorpay-signature'))) throw new HttpError(400, 'Bad signature');
    const event = JSON.parse(req.body.toString('utf8'));
    const payment = event.payload?.payment?.entity;
    if (['payment.captured', 'payment.authorized', 'order.paid'].includes(event.event) && payment?.order_id) {
      const o = await db.orders.findOne({ razorpay_order_id: payment.order_id });
      if (o) await markPaid(o, payment.id, 'webhook');
      else {
        // Not a shop order: perhaps a booking deposit.
        const a = await db.appointments.findOne({ 'deposit.razorpay_order_id': payment.order_id });
        if (a) await require('../deposits').markDepositPaid(a, payment.id, 'webhook');
      }
    }
    res.json({ ok: true });
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
    if (ORDER_STATUSES.includes(req.query.status) || req.query.status === 'awaiting_payment') filter.status = req.query.status;
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
    if (o.status === 'awaiting_payment' && status !== 'cancelled') throw new HttpError(409, 'This order hasn’t been paid yet');
    const set = { status, updated_at: new Date() };
    if (status === 'cancelled') {
      // Paid online: refund through Razorpay first, so a failed refund leaves the order as it was.
      if (o.payment === 'online' && o.payment_status === 'paid') {
        try {
          const r = await razorpay.refund(o.razorpay_payment_id, o.total * 100);
          Object.assign(set, { payment_status: 'refunded', refund_id: r.id, refunded_at: new Date() });
        } catch (e) {
          throw new HttpError(502, `The refund didn’t go through (${e.message}). The order hasn’t been cancelled — try again, or refund from the Razorpay dashboard.`);
        }
      }
      await releaseStock(o);
    }
    await db.orders.updateOne({ _id: o._id }, { $set: set });
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

module.exports = { pub, mine, staff, admin, webhook, expireUnpaidOrders, productOut, CATEGORIES };
