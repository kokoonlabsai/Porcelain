const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => toISO(new Date());
export const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function fmtDate(iso, opts = {}) {
  if (!iso) return '';
  return parseISO(iso.slice(0, 10)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', ...opts });
}
export function fmtDateLong(iso) {
  return fmtDate(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
export function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}
/** "Today", "Tomorrow", "In 5 days", "3 days ago" */
export function relDay(iso) {
  const n = daysBetween(todayISO(), iso);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 14) return `In ${n} days`;
  if (n >= 14 && n < 60) return `In ${Math.round(n / 7)} weeks`;
  if (n < -1 && n > -14) return `${-n} days ago`;
  return fmtDate(iso);
}
export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
export const firstName = (name = '') => name.replace(/^(dr\.?|mr\.?|ms\.?|mrs\.?)\s+/i, '').split(' ')[0];
export function displayPhone(p = '') {
  const m = /^\+91(\d{5})(\d{5})$/.exec(p);
  return m ? `+91 ${m[1]} ${m[2]}` : p;
}
export function age(dob) {
  if (!dob) return null;
  const d = parseISO(dob);
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
}

export const CONCERNS = [
  { id: 'hair', label: 'Hair', hint: 'Hair fall, thinning, dandruff, scalp' },
  { id: 'skin', label: 'Skin', hint: 'Acne, pigmentation, rashes, allergies' },
  { id: 'wellness', label: 'Wellness', hint: 'Check-up, skincare routine, glow' },
  { id: 'procedure', label: 'Procedure', hint: 'Peels, laser, PRP, HydraFacial' },
  { id: 'other', label: 'Something else', hint: 'Nails, moles, anything you’re unsure about' },
];
export const concernLabel = (id) => CONCERNS.find((c) => c.id === id)?.label || id || '';

export const ARTICLE_CATS = [
  { id: 'procedures', label: 'Procedures' },
  { id: 'hair', label: 'Hair care' },
  { id: 'skin', label: 'Skin care' },
  { id: 'myths', label: 'Myths busted' },
  { id: 'wellness', label: 'Wellness' },
];
export const catLabel = (id) => ARTICLE_CATS.find((c) => c.id === id)?.label || id;

export const STATUS = {
  booked: { label: 'Booked', tone: 'blue' },
  checked_in: { label: 'Checked in', tone: 'amber' },
  completed: { label: 'Seen', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'grey' },
  no_show: { label: 'No-show', tone: 'red' },
};

/** wa.me link with a message. Phone in +91… form. */
export function whatsappLink(phone, text) {
  const digits = (phone || '').replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Downloads an .ics file so the appointment lands in the phone's calendar. */
export function downloadIcs({ title, date, start, end, location }) {
  const stamp = (d, t) => `${d.replace(/-/g, '')}T${t.replace(':', '')}00`;
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Clinic//Booking//EN', 'BEGIN:VEVENT',
    `UID:${date}-${start}-${Math.random().toString(36).slice(2)}@clinic`,
    `DTSTART:${stamp(date, start)}`, `DTEND:${stamp(date, end)}`,
    `SUMMARY:${title}`, location ? `LOCATION:${location.replace(/,/g, '\\,')}` : '',
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', `DESCRIPTION:${title}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = 'appointment.ics';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Shrinks phone photos (often 4–8 MB) to ~1600px JPEGs before upload. */
export function compressImage(file, max = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (file.type === 'application/pdf') {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('That file isn’t an image we can read'));
    img.src = URL.createObjectURL(file);
  });
}
