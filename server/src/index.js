const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { HttpError, wrap, requireAuth } = require('./util');
const { db, ready } = require('./db');
const { startJobs } = require('./jobs');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
// CORS_ORIGIN: comma-separated list of allowed frontend origins (e.g. your Vercel URL). Unset = allow all.
const origins = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
app.use(cors(origins.length ? { origin: origins } : undefined));
// Make sure the schema exists before the first query.
app.use((req, res, next) => ready.then(() => next(), next));
// Photo uploads arrive as base64 inside JSON, so this route gets a bigger limit.
app.use('/api/staff/attachments', express.json({ limit: '9mb' }));
app.use(express.json({ limit: '1mb' }));

// Tiny in-memory rate limiter for login and booking.
const hits = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    if (req.method === 'GET') return next();
    const key = `${req.ip}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    const entry = hits.get(key) || { n: 0, reset: now + windowMs };
    if (now > entry.reset) { entry.n = 0; entry.reset = now + windowMs; }
    entry.n++;
    hits.set(key, entry);
    if (entry.n > max) return next(new HttpError(429, 'Too many attempts. Try again in a minute.'));
    next();
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
}, 5 * 60_000).unref();

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', rateLimit(20, 60_000), require('./routes/auth'));
app.use('/api/me', require('./routes/patient'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/admin', require('./routes/admin'));

/** Photos and reports: the patient they belong to (if shared with them) or any staff member. */
app.get(
  '/api/files/:id',
  requireAuth(),
  wrap(async (req, res) => {
    const f = await db.get('SELECT * FROM attachments WHERE id = ?', req.params.id);
    const allowed = f && (req.user.role !== 'patient' || (f.patient_id === req.user.id && f.visible_to_patient));
    if (!allowed) throw new HttpError(404, 'File not found');
    res.set('Content-Type', f.mime);
    res.set('Cache-Control', 'private, max-age=86400');
    res.send(Buffer.from(f.data, 'base64'));
  })
);

app.use('/api', rateLimit(30, 60_000), require('./routes/public'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

const dist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Body is not valid JSON' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That upload is too large' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

const port = Number(process.env.PORT) || 4000;
if (require.main === module) {
  app.listen(port, () => console.log(`Clinic API listening on http://localhost:${port}`));
  startJobs();
}

module.exports = app;
