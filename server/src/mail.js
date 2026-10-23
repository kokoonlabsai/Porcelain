const { getSettings } = require('./db');

/**
 * Email goes out through SMTP when SMTP_HOST is set (Gmail, Zoho, Brevo, SES…).
 * Without it, messages are printed to the log so nothing breaks in development.
 */
let transport = null;
function getTransport() {
  if (transport !== null) return transport;
  if (!process.env.SMTP_HOST) return (transport = false);
  const nodemailer = require('nodemailer');
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transport;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function prettyDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function prettyTime(t) {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function appUrl(path = '') {
  return (process.env.APP_URL || '').replace(/\/$/, '') + path;
}

function layout(settings, title, inner) {
  const link = appUrl() ? `<p style="margin:24px 0 0"><a href="${esc(appUrl('/login'))}" style="background:#2f5d50;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">Open your patient portal</a></p>` : '';
  return `<!doctype html><html><body style="margin:0;background:#f6f1ea;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#24302c">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="font-size:20px;font-weight:700;color:#2f5d50">${esc(settings.clinic_name)}</div>
    <div style="background:#fff;border-radius:18px;padding:28px;margin-top:16px">
      <h1 style="font-size:22px;margin:0 0 12px">${esc(title)}</h1>
      ${inner}
      ${link}
    </div>
    <p style="font-size:12px;color:#7a847f;margin-top:16px">${esc([settings.address, settings.phone].filter(Boolean).join(' · '))}</p>
  </div></body></html>`;
}

async function send(to, subject, html) {
  if (!to) return { sent: false, reason: 'no email' };
  const t = getTransport();
  if (!t) {
    if (process.env.NODE_ENV !== 'test') console.log(`[mail:dev] to=${to} subject="${subject}"`);
    return { sent: false, reason: 'smtp not configured' };
  }
  const settings = await getSettings();
  try {
    await t.sendMail({ from: process.env.MAIL_FROM || `${settings.clinic_name} <${process.env.SMTP_USER}>`, to, subject, html });
    return { sent: true };
  } catch (e) {
    console.error('[mail] failed:', e.message);
    return { sent: false, reason: e.message };
  }
}

async function bookingConfirmation(patient, appt) {
  const s = await getSettings();
  const html = layout(s, 'Your appointment is booked', `
    <p>Hi ${esc(patient.name)},</p>
    <p>We're expecting you on <b>${esc(prettyDate(appt.date))}</b> at <b>${esc(prettyTime(appt.start_time))}</b>.</p>
    ${s.address ? `<p>📍 ${esc(s.address)}</p>` : ''}
    <p>Please arrive 10 minutes early and bring any previous prescriptions or reports.</p>`);
  return send(patient.email, `Appointment confirmed — ${prettyDate(appt.date)}, ${prettyTime(appt.start_time)}`, html);
}

async function appointmentReminder(patient, appt) {
  const s = await getSettings();
  const html = layout(s, 'See you tomorrow', `
    <p>Hi ${esc(patient.name)}, a reminder that your appointment is on <b>${esc(prettyDate(appt.date))}</b> at <b>${esc(prettyTime(appt.start_time))}</b>.</p>
    <p>Can't make it? Reply to this email or call us${s.phone ? ` on ${esc(s.phone)}` : ''} so we can give the slot to someone else.</p>`);
  return send(patient.email, `Reminder: your appointment tomorrow at ${prettyTime(appt.start_time)}`, html);
}

async function visitSummary(patient, visit, items) {
  const s = await getSettings();
  const rows = items.map((i) => `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #eee"><b>${esc(i.medicine)}</b>${i.kind ? ` <span style="color:#7a847f">(${esc(i.kind)})</span>` : ''}<br>
      <span style="color:#56615c;font-size:14px">${esc([i.dosage, i.frequency, i.duration].filter(Boolean).join(' · '))}${i.instructions ? `<br>${esc(i.instructions)}` : ''}</span></td></tr>`).join('');
  const html = layout(s, 'Your prescription', `
    <p>Hi ${esc(patient.name)}, here's a summary of your visit on ${esc(prettyDate(visit.date))}.</p>
    ${visit.diagnosis ? `<p><b>Diagnosis:</b> ${esc(visit.diagnosis)}</p>` : ''}
    ${visit.procedure_done ? `<p><b>Procedure:</b> ${esc(visit.procedure_done)}</p>` : ''}
    ${items.length ? `<table style="width:100%;border-collapse:collapse">${rows}</table>` : ''}
    ${visit.advice ? `<p><b>Advice:</b><br>${esc(visit.advice).replace(/\n/g, '<br>')}</p>` : ''}
    ${visit.follow_up_date ? `<p>🗓️ <b>Next visit:</b> around ${esc(prettyDate(visit.follow_up_date))}. We'll remind you.</p>` : ''}`);
  return send(patient.email, `Your prescription from ${s.clinic_name}`, html);
}

async function followUpReminder(patient, visit) {
  const s = await getSettings();
  const html = layout(s, 'Time for your follow-up', `
    <p>Hi ${esc(patient.name)}, the doctor asked to see you again around <b>${esc(prettyDate(visit.follow_up_date))}</b>.</p>
    <p>Book a slot that suits you from the patient portal${s.phone ? `, or call us on ${esc(s.phone)}` : ''}.</p>`);
  return send(patient.email, 'Time to book your follow-up visit', html);
}

async function welcome(patient, password) {
  const s = await getSettings();
  const html = layout(s, 'Your patient account is ready', `
    <p>Hi ${esc(patient.name)}, the clinic has created an account for you so you can see your prescriptions, photos and next visit date.</p>
    <p>Log in with your phone number <b>${esc(patient.phone)}</b> and this temporary password:</p>
    <p style="font-size:22px;font-weight:700;letter-spacing:1px">${esc(password)}</p>
    <p>You'll be asked to choose your own password the first time.</p>`);
  return send(patient.email, `Your ${s.clinic_name} patient account`, html);
}

module.exports = { send, bookingConfirmation, appointmentReminder, visitSummary, followUpReminder, welcome, prettyDate, prettyTime };
