const crypto = require('crypto');

/**
 * Razorpay: online payments for shop orders (UPI, cards, netbanking, wallets).
 * Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET (Dashboard → Account & Settings → API keys),
 * and RAZORPAY_WEBHOOK_SECRET for the webhook. Without the keys, online payment is simply not offered.
 * Card and UPI details are entered on Razorpay's own checkout and never reach this server.
 */
const API = (process.env.RAZORPAY_API_BASE || 'https://api.razorpay.com/v1').replace(/\/$/, '');

const keyId = () => process.env.RAZORPAY_KEY_ID || '';
const enabled = () => !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

async function call(method, path, body) {
  const auth = Buffer.from(`${keyId()}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Basic ${auth}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.description || `Razorpay error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Amounts are in paise. */
const createOrder = ({ amount, receipt, notes }) => call('POST', '/orders', { amount, currency: 'INR', receipt, notes });
const orderPayments = (razorpayOrderId) => call('GET', `/orders/${razorpayOrderId}/payments`);
const refund = (paymentId, amount) => call('POST', `/payments/${paymentId}/refund`, { amount, speed: 'normal' });

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Checkout handler signature: HMAC-SHA256("order_id|payment_id", key secret). */
function verifyPayment({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  if (!enabled() || !razorpay_order_id || !razorpay_payment_id) return false;
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
  return safeEqual(expected, razorpay_signature);
}

/** Webhook signature: HMAC-SHA256(raw body, webhook secret). */
function verifyWebhook(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !rawBody) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}

module.exports = { enabled, keyId, createOrder, orderPayments, refund, verifyPayment, verifyWebhook };
