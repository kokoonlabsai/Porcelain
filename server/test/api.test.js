const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

// Tests run against MONGODB_URI when it's set (a throwaway database is created and dropped),
// otherwise against an in-memory MongoDB that mongodb-memory-server downloads on first use.
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.ADMIN_PHONE = '9000000001';
process.env.ADMIN_PASSWORD = 'admin123';
process.env.MONGODB_DB = `clinic_test_${process.pid}`;

const { normalizePhone } = require('../src/phone');
// Local date helpers: requiring src/util would connect to MongoDB before the URI is chosen.
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoOf(new Date());
const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return isoOf(new Date(y, m - 1, d + n)); };

let server;
let base;
let mongo;
let dbModule;
before(async () => {
  if (!process.env.MONGODB_URI) {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongo = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongo.getUri();
  }
  const app = require('../src/index');
  dbModule = require('../src/db');
  await dbModule.ready;
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server?.close();
  if (dbModule) {
    await dbModule.database.dropDatabase().catch(() => {});
    await dbModule.client.close();
  }
  await mongo?.stop();
});

async function call(method, url, { token, body } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}
const login = async (phone, password) => (await call('POST', '/api/auth/login', { body: { phone, password } })).body.token;

const tomorrow = addDays(today(), 1);
const weekday = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
let admin;

test('phone numbers normalise to one form', () => {
  assert.equal(normalizePhone('98765 43210'), '+919876543210');
  assert.equal(normalizePhone('098765-43210'), '+919876543210');
  assert.equal(normalizePhone('+91 98765 43210'), '+919876543210');
  assert.equal(normalizePhone('919876543210'), '+919876543210');
  assert.equal(normalizePhone('+1 415 555 0100'), '+14155550100');
  assert.equal(normalizePhone('123'), null);
});

test('admin sets the weekly schedule with several windows per day', async () => {
  admin = await login('9000000001', 'admin123');
  assert.ok(admin);
  const wd = weekday(tomorrow);
  const bad = await call('PUT', '/api/admin/availability', { token: admin, body: { windows: [
    { weekday: wd, start_time: '10:00', end_time: '12:00', slot_minutes: 30 },
    { weekday: wd, start_time: '11:00', end_time: '13:00', slot_minutes: 30 },
  ] } });
  assert.equal(bad.status, 422);
  const ok = await call('PUT', '/api/admin/availability', { token: admin, body: { windows: [
    { weekday: wd, start_time: '10:00', end_time: '12:00', slot_minutes: 60 },
    { weekday: wd, start_time: '17:00', end_time: '18:00', slot_minutes: 30, capacity: 2 },
  ] } });
  assert.equal(ok.status, 200);
  const slots = (await call('GET', `/api/slots?date=${tomorrow}`)).body.slots;
  assert.deepEqual(slots.map((s) => s.start), ['10:00', '11:00', '17:00', '17:30']);
  assert.equal(slots[2].remaining, 2);
});

let guestAppt;
test('guests book without an account, and a full slot is refused', async () => {
  const missing = await call('POST', '/api/appointments', { body: { name: 'Asha', phone: '9811111111', date: tomorrow, start_time: '10:00' } });
  assert.equal(missing.status, 422);
  assert.ok(missing.body.details.concern);

  const r = await call('POST', '/api/appointments', { body: {
    name: 'Asha Rao', phone: '98111 11111', email: 'asha@example.com', concern: 'hair', description: 'Hair fall for 3 months', date: tomorrow, start_time: '10:00',
  } });
  assert.equal(r.status, 201);
  assert.equal(r.body.appointment.end_time, '11:00');
  assert.equal(r.body.can_create_account, true);
  guestAppt = r.body.appointment;

  const taken = await call('POST', '/api/appointments', { body: { name: 'Ravi', phone: '9822222222', concern: 'skin', date: tomorrow, start_time: '10:00' } });
  assert.equal(taken.status, 409);
  const notInSchedule = await call('POST', '/api/appointments', { body: { name: 'Ravi', phone: '9822222222', concern: 'skin', date: tomorrow, start_time: '10:30' } });
  assert.equal(notInSchedule.status, 409);

  const slots = (await call('GET', `/api/slots?date=${tomorrow}`)).body.slots;
  assert.equal(slots.find((s) => s.start === '10:00').available, false);
});

test('a guest can set a password right after booking', async () => {
  const wrongPhone = await call('POST', `/api/appointments/${guestAppt.id}/claim`, { body: { phone: '9800000000', password: 'secret1' } });
  assert.equal(wrongPhone.status, 404);
  const r = await call('POST', `/api/appointments/${guestAppt.id}/claim`, { body: { phone: '9811111111', password: 'secret1' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.name, 'Asha Rao');
  const again = await call('POST', '/api/auth/signup', { body: { name: 'X', phone: '9811111111', password: 'secret2' } });
  assert.equal(again.status, 409);
});

test('closed days have no slots', async () => {
  const day = addDays(today(), 8);
  await call('PUT', '/api/admin/availability', { token: admin, body: { windows: [0, 1, 2, 3, 4, 5, 6].map((w) => ({ weekday: w, start_time: '10:00', end_time: '12:00', slot_minutes: 60 })) } });
  assert.ok((await call('GET', `/api/slots?date=${day}`)).body.slots.length > 0);
  const c = await call('POST', '/api/admin/closures', { token: admin, body: { date: day, reason: 'Conference' } });
  assert.equal(c.status, 201);
  assert.equal((await call('GET', `/api/slots?date=${day}`)).body.slots.length, 0);
});

let doctor; let reception; let visitId; let itemIds;
test('admin creates staff with temporary passwords', async () => {
  const d = await call('POST', '/api/admin/staff', { token: admin, body: { name: 'Dr. Mehta', phone: '9000000002', role: 'doctor' } });
  assert.equal(d.status, 201);
  doctor = await login('9000000002', d.body.password);
  const me = await call('GET', '/api/auth/me', { token: doctor });
  assert.equal(me.body.user.must_change_password, true);
  const changed = await call('PATCH', '/api/auth/me', { token: doctor, body: { new_password: 'doctor123' } });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.user.must_change_password, false);

  const r = await call('POST', '/api/admin/staff', { token: admin, body: { name: 'Priya', phone: '9000000003', role: 'reception' } });
  reception = await login('9000000003', r.body.password);
  assert.equal((await call('GET', '/api/admin/staff', { token: doctor })).status, 403);
});

test('doctor writes a visit; the patient sees it without private notes', async () => {
  const patient = (await call('GET', '/api/staff/patients?q=asha', { token: doctor })).body.patients[0];
  assert.equal(patient.name, 'Asha Rao');
  const v = await call('POST', '/api/staff/visits', { token: doctor, body: {
    patient_id: patient.id, appointment_id: guestAppt.id, diagnosis: 'Telogen effluvium', advice: 'Eat protein-rich meals',
    private_notes: 'Check ferritin', follow_up_date: addDays(today(), 30),
    items: [
      { medicine: 'Minoxidil 5% solution', dosage: '1 ml', frequency: 'Night', duration: '3 months' },
      { medicine: 'Biotin', frequency: 'Once daily', duration: '30 days' },
      { medicine: '' },
    ],
  } });
  assert.equal(v.status, 201);
  assert.equal(v.body.visit.items.length, 2);
  assert.equal(v.body.visit.private_notes, 'Check ferritin');
  visitId = v.body.visit.id;
  itemIds = v.body.visit.items.map((i) => i.id);

  const appts = (await call('GET', `/api/staff/appointments?date=${tomorrow}`, { token: reception })).body.appointments;
  assert.equal(appts.find((a) => a.id === guestAppt.id).status, 'completed');

  assert.equal((await call('POST', '/api/staff/visits', { token: reception, body: { patient_id: patient.id } })).status, 403);

  const asha = await login('9811111111', 'secret1');
  const overview = (await call('GET', '/api/me/overview', { token: asha })).body;
  assert.equal(overview.latest_visit.diagnosis, 'Telogen effluvium');
  assert.equal(overview.latest_visit.private_notes, undefined);
  assert.equal(overview.pending_medicines, 2);
  assert.equal(overview.follow_up.booked, false);
  assert.equal((await call('GET', '/api/staff/patients', { token: asha })).status, 403);

  const recView = (await call('GET', `/api/staff/visits/${visitId}`, { token: reception })).body.visit;
  assert.equal(recView.private_notes, undefined);
});

test('pharmacy finds the prescription and marks it handed over', async () => {
  const q = (await call('GET', '/api/staff/pharmacy/queue', { token: reception })).body.prescriptions;
  assert.equal(q.length, 1);
  const found = (await call('GET', '/api/staff/pharmacy/search?q=81111', { token: reception })).body.prescriptions;
  assert.equal(found[0].visit_id, visitId);
  await call('POST', `/api/staff/prescription-items/${itemIds[0]}/dispense`, { token: reception, body: {} });
  const left = (await call('GET', '/api/staff/pharmacy/queue', { token: reception })).body.prescriptions;
  assert.equal(left[0].items.filter((i) => !i.dispensed).length, 1);
  await call('POST', `/api/staff/visits/${visitId}/dispense-all`, { token: reception });
  assert.equal((await call('GET', '/api/staff/pharmacy/queue', { token: reception })).body.prescriptions.length, 0);
});

test('editing a visit keeps handed-over medicines', async () => {
  const r = await call('PUT', `/api/staff/visits/${visitId}`, { token: doctor, body: { items: [{ medicine: 'Ketoconazole shampoo', frequency: 'Twice a week' }] } });
  assert.equal(r.status, 200);
  assert.equal(r.body.visit.items.length, 3);
  assert.equal(r.body.visit.diagnosis, 'Telogen effluvium');
});

test('records under a number block self sign-up; the clinic issues a login instead', async () => {
  const p = await call('POST', '/api/staff/patients', { token: reception, body: { name: 'Kiran', phone: '9833333333' } });
  assert.equal(p.status, 201);
  await call('POST', '/api/staff/visits', { token: doctor, body: { patient_id: p.body.patient.id, diagnosis: 'Acne' } });
  const s = await call('POST', '/api/auth/signup', { body: { name: 'Someone', phone: '9833333333', password: 'hacker1' } });
  assert.equal(s.status, 409);
  const acc = await call('POST', `/api/staff/patients/${p.body.patient.id}/account`, { token: reception, body: {} });
  assert.match(acc.body.account.password, /^[a-z]+-\d{4}$/);
  assert.ok(await login('9833333333', acc.body.account.password));
});

test('photos are visible to their patient only when shared', async () => {
  const asha = await login('9811111111', 'secret1');
  const patientId = (await call('GET', '/api/auth/me', { token: asha })).body.user.id;
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const shared = await call('POST', '/api/staff/attachments', { token: doctor, body: { patient_id: patientId, visit_id: visitId, data: png, caption: 'Crown, week 0' } });
  const hidden = await call('POST', '/api/staff/attachments', { token: doctor, body: { patient_id: patientId, data: png, visible_to_patient: false } });
  assert.equal(shared.status, 201);
  const photos = (await call('GET', '/api/me/photos', { token: asha })).body.photos;
  assert.deepEqual(photos.map((p) => p.id), [shared.body.attachment.id]);
  const res = await fetch(`${base}/api/files/${shared.body.attachment.id}`, { headers: { authorization: `Bearer ${asha}` } });
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal((await call('GET', `/api/files/${hidden.body.attachment.id}`, { token: asha })).status, 404);
  const kiran = await login('9833333333', (await call('POST', '/api/staff/patients/' + (await call('GET', '/api/staff/patients?q=kiran', { token: doctor })).body.patients[0].id + '/account', { token: doctor, body: {} })).body.account.password);
  assert.equal((await call('GET', `/api/files/${shared.body.attachment.id}`, { token: kiran })).status, 404);
});

test('logged-in patients book, see and cancel their appointments', async () => {
  const asha = await login('9811111111', 'secret1');
  const day = addDays(today(), 3);
  const r = await call('POST', '/api/appointments', { token: asha, body: { concern: 'skin', date: day, start_time: '11:00' } });
  assert.equal(r.status, 201);
  const dup = await call('POST', '/api/appointments', { token: asha, body: { concern: 'skin', date: day, start_time: '10:00' } });
  assert.equal(dup.status, 409);
  const overview = (await call('GET', '/api/me/overview', { token: asha })).body;
  assert.equal(overview.upcoming.length, 1);
  const c = await call('POST', `/api/me/appointments/${r.body.appointment.id}/cancel`, { token: asha });
  assert.equal(c.body.appointment.status, 'cancelled');
});

test('articles are seeded and readable', async () => {
  const list = (await call('GET', '/api/articles')).body.articles;
  assert.ok(list.length >= 10);
  const myths = (await call('GET', '/api/articles?category=myths')).body.articles;
  assert.ok(myths.length > 0);
  const one = await call('GET', `/api/articles/${list[0].slug}`);
  assert.ok(one.body.article.body.length > 200);
});

test('reminder job sends each reminder once', async () => {
  const { runReminders } = require('../src/jobs');
  const first = await runReminders();
  assert.equal(first.appointmentReminders, 0); // the only booking for tomorrow is already completed
  const second = await runReminders();
  assert.equal(second.followUpReminders, 0);
});

test('two people grabbing the last place at the same moment: exactly one gets it', async () => {
  const day = addDays(today(), 5);
  const tries = await Promise.all(['9866666661', '9866666662', '9866666663'].map((phone, i) =>
    call('POST', '/api/appointments', { body: { name: `Racer ${i}`, phone, concern: 'skin', date: day, start_time: '10:00' } })
  ));
  assert.deepEqual(tries.map((t) => t.status).sort(), [201, 409, 409]);
  const slot = (await call('GET', `/api/slots?date=${day}`)).body.slots.find((s) => s.start === '10:00');
  assert.equal(slot.remaining, 0);
});

test('malformed ids are a clean 404, not a crash', async () => {
  assert.equal((await call('GET', '/api/staff/patients/not-an-id', { token: admin })).status, 404);
  assert.equal((await call('GET', '/api/staff/visits/123', { token: admin })).status, 404);
  assert.equal((await call('POST', '/api/appointments/xyz/claim', { body: { phone: '9811111111', password: 'secret1' } })).status, 404);
});

test('admin edits a staff member’s name, phone and email; phone stays unique', async () => {
  const staff = (await call('GET', '/api/admin/staff', { token: admin })).body.staff;
  const doc = staff.find((u) => u.role === 'doctor');
  const rec = staff.find((u) => u.role === 'reception');
  const dup = await call('PATCH', `/api/admin/staff/${rec.id}`, { token: admin, body: { phone: doc.phone } });
  assert.equal(dup.status, 409);
  assert.ok(dup.body.details.phone);
  const bad = await call('PATCH', `/api/admin/staff/${rec.id}`, { token: admin, body: { name: '', email: 'nope' } });
  assert.equal(bad.status, 422);
  const ok = await call('PATCH', `/api/admin/staff/${rec.id}`, { token: admin, body: { name: 'Priya Sharma', phone: '90000 00009', email: 'priya@example.com' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.phone, '+919000000009');
  assert.ok(await login('9000000009', (await call('POST', `/api/admin/staff/${rec.id}/reset`, { token: admin })).body.password));
});

test('shop: admin adds products; customers order; stock is reserved and restored on cancel', async () => {
  const bad = await call('POST', '/api/admin/products', { token: admin, body: { name: '', category: 'nope', price: 0 } });
  assert.equal(bad.status, 422);
  const made = await call('POST', '/api/admin/products', { token: admin, body: { name: 'Test Sunscreen SPF 50', category: 'sunscreen', price: 800, mrp: 900, size: '50 g', stock: 3 } });
  assert.equal(made.status, 201);
  const pid = made.body.product.id;
  assert.equal((await call('POST', '/api/admin/products', { token: doctor, body: {} })).status, 403);

  const list = (await call('GET', '/api/shop/products?category=sunscreen')).body.products;
  assert.ok(list.some((p) => p.id === pid));
  const one = await call('GET', `/api/shop/products/${made.body.product.slug}`);
  assert.equal(one.body.product.price, 800);

  const tooMany = await call('POST', '/api/shop/orders', { body: { name: 'Neha', phone: '9877777777', items: [{ product_id: pid, qty: 5 }] } });
  assert.equal(tooMany.status, 409);
  const noAddress = await call('POST', '/api/shop/orders', { body: { name: 'Neha', phone: '9877777777', fulfilment: 'delivery', items: [{ product_id: pid, qty: 1 }] } });
  assert.equal(noAddress.status, 422);

  // The price the browser sends is ignored.
  const o = await call('POST', '/api/shop/orders', { body: { name: 'Neha', phone: '9877777777', fulfilment: 'delivery', address: '12 Lake View', city: 'Bhopal', pincode: '462016', items: [{ product_id: pid, qty: 2, price: 1 }] } });
  assert.equal(o.status, 201);
  assert.equal(o.body.order.subtotal, 1600);
  assert.equal(o.body.order.delivery_fee, 0); // over the free-delivery threshold
  assert.equal(o.body.order.payment, 'cod');
  assert.match(o.body.order.number, /^PSC-[0-9A-F]{6}$/);
  const after = (await call('GET', '/api/admin/products', { token: admin })).body.products.find((p) => p.id === pid);
  assert.equal(after.stock, 1);

  const open = (await call('GET', '/api/staff/orders?status=open', { token: reception })).body;
  assert.ok(open.orders.some((x) => x.id === o.body.order.id));
  const c = await call('PATCH', `/api/staff/orders/${o.body.order.id}`, { token: reception, body: { status: 'cancelled' } });
  assert.equal(c.body.order.status, 'cancelled');
  const restocked = (await call('GET', '/api/admin/products', { token: admin })).body.products.find((p) => p.id === pid);
  assert.equal(restocked.stock, 3);

  // Logged-in patients see their own orders.
  const asha = await login('9811111111', 'secret1');
  const mine = await call('POST', '/api/shop/orders', { token: asha, body: { items: [{ product_id: pid, qty: 1 }] } });
  assert.equal(mine.status, 201);
  assert.equal(mine.body.order.customer.name, 'Asha Rao');
  assert.equal(mine.body.order.payment, 'pay_at_clinic');
  assert.equal((await call('GET', '/api/me/orders', { token: asha })).body.orders.length, 1);
});
