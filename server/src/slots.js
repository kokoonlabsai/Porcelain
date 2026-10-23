const { db, getSettings } = require('./db');
const { today, addDays, toMinutes, fromMinutes } = require('./util');

/** Appointments in these states hold their slot. */
const HOLDING = "('booked','checked_in','completed')";

function weekdayOf(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/**
 * Every slot the weekly schedule creates on a date, with how many places are left.
 * Staff see past and short-notice slots too (for walk-ins); patients don't.
 */
async function slotsFor(date, { forStaff = false, conn = db } = {}) {
  const settings = await getSettings();
  const now = new Date();
  const todayIso = today();
  if (!forStaff) {
    if (date < todayIso) return [];
    if (date > addDays(todayIso, Number(settings.booking_days_ahead) || 30)) return [];
  }
  if (await conn.get('SELECT 1 FROM closures WHERE date = ?', date)) return [];

  const windows = await conn.all(
    'SELECT * FROM availability WHERE weekday = ? ORDER BY start_time', weekdayOf(date)
  );
  const booked = await conn.all(
    `SELECT start_time, COUNT(*) AS n FROM appointments WHERE date = ? AND status IN ${HOLDING} GROUP BY start_time`, date
  );
  const taken = Object.fromEntries(booked.map((b) => [b.start_time, Number(b.n)]));
  const earliest = now.getHours() * 60 + now.getMinutes() + (Number(settings.min_notice_minutes) || 0);

  const seen = new Map();
  for (const w of windows) {
    const step = Math.max(5, Number(w.slot_minutes) || 30);
    const end = toMinutes(w.end_time);
    for (let m = toMinutes(w.start_time); m + step <= end; m += step) {
      const start = fromMinutes(m);
      if (seen.has(start)) continue; // overlapping windows: first one wins
      const capacity = Math.max(1, Number(w.capacity) || 1);
      const remaining = Math.max(0, capacity - (taken[start] || 0));
      const past = date < todayIso || (date === todayIso && m < earliest);
      if (past && !forStaff) continue;
      seen.set(start, { start, end: fromMinutes(m + step), capacity, remaining, available: remaining > 0, past });
    }
  }
  return [...seen.values()].sort((a, b) => a.start.localeCompare(b.start));
}

/** Days in the booking window and whether each has a free slot — for the date strip. */
async function upcomingDays(count) {
  const settings = await getSettings();
  const days = Math.min(count || Number(settings.booking_days_ahead) || 30, 90);
  const out = [];
  for (let i = 0; i <= days; i++) {
    const date = addDays(today(), i);
    const slots = await slotsFor(date);
    out.push({ date, open: slots.length > 0, free: slots.filter((s) => s.available).length });
  }
  return out;
}

module.exports = { slotsFor, upcomingDays, weekdayOf, HOLDING };
