const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { normalizePhone } = require('../phone');
const { createAppointment, CONCERNS } = require('../appointments');
const { visitDetails } = require('../records');
const mail = require('../mail');
const {
  HttpError, wrap, requireStaff, requireAuth, today, addDays, isISODate, isTime, str, isEmail, tempPassword, publicUser,
} = require('../util');

/** Doctors, reception/pharmacy and admins. Writing prescriptions is for doctors and admins. */
const router = express.Router();
router.use(requireStaff());
const clinician = requireAuth('doctor', 'admin');
const canSeePrivate = (u) => u.role === 'doctor' || u.role === 'admin';

// ---------- Dashboard ----------

router.get(
  '/dashboard',
  wrap(async (req, res) => {
    const t = today();
    const counts = await db.get(
      `SELECT
         SUM(CASE WHEN status IN ('booked','checked_in','completed') THEN 1 ELSE 0 END) AS total,
         SUM(CASE WHEN status = 'booked' THEN 1 ELSE 0 END) AS waiting,
         SUM(CASE WHEN status = 'checked_in' THEN 1 ELSE 0 END) AS checked_in,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
       FROM appointments WHERE date = ?`, t
    );
    const pharmacy = await db.get(
      `SELECT COUNT(DISTINCT v.id) AS n FROM prescription_items p JOIN visits v ON v.id = p.visit_id
       WHERE p.dispensed = 0 AND v.date >= ?`, addDays(t, -30)
    );
    // Patients whose follow-up is due within a week (or overdue) and who haven't booked.
    const followUps = await db.all(
      `SELECT v.id AS visit_id, v.follow_up_date, v.diagnosis, u.id AS patient_id, u.name, u.phone
       FROM visits v JOIN users u ON u.id = v.patient_id
       WHERE v.follow_up_date IS NOT NULL AND v.follow_up_date BETWEEN ? AND ?
         AND v.id = (SELECT MAX(id) FROM visits WHERE patient_id = v.patient_id)
         AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id = v.patient_id AND a.date >= v.date AND a.id != COALESCE(v.appointment_id, 0) AND a.status IN ('booked','checked_in','completed'))
       ORDER BY v.follow_up_date LIMIT 50`,
      addDays(t, -30), addDays(t, 7)
    );
    const newPatients = await db.get(
      "SELECT COUNT(*) AS n FROM users WHERE role = 'patient' AND created_at >= datetime('now', '-30 days')"
    );
    res.json({
      today: { total: counts.total || 0, waiting: counts.waiting || 0, checked_in: counts.checked_in || 0, completed: counts.completed || 0 },
      pharmacy_pending: pharmacy.n,
      follow_ups: followUps,
      new_patients_30d: newPatients.n,
    });
  })
);

// ---------- Appointments ----------

router.get(
  '/appointments',
  wrap(async (req, res) => {
    const from = isISODate(req.query.from) ? req.query.from : isISODate(req.query.date) ? req.query.date : today();
    const to = isISODate(req.query.to) ? req.query.to : from;
    const rows = await db.all(
      `SELECT a.*, u.name, u.phone, u.email, u.password_hash IS NOT NULL AS has_account,
         (SELECT id FROM visits WHERE appointment_id = a.id LIMIT 1) AS visit_id,
         (SELECT COUNT(*) FROM visits WHERE patient_id = a.patient_id) AS visit_count
       FROM appointments a JOIN users u ON u.id = a.patient_id
       WHERE a.date BETWEEN ? AND ? ORDER BY a.date, a.start_time`,
      from, to
    );
    res.json({ appointments: rows.map((r) => ({ ...r, has_account: !!r.has_account })) });
  })
);

/** Phone bookings and walk-ins. Staff may book past or short-notice slots. */
router.post(
  '/appointments',
  wrap(async (req, res) => {
    const { appointment, patient } = await createAppointment(req.body || {}, req.user);
    if (patient.email && appointment.status === 'booked' && appointment.date > today()) {
      mail.bookingConfirmation(patient, appointment).catch(() => {});
    }
    res.status(201).json({ appointment, patient: publicUser(patient) });
  })
);

router.patch(
  '/appointments/:id',
  wrap(async (req, res) => {
    const a = await db.get('SELECT * FROM appointments WHERE id = ?', req.params.id);
    if (!a) throw new HttpError(404, 'Appointment not found');
    const { status, date, start_time } = req.body || {};
    if (status !== undefined) {
      if (!['booked', 'checked_in', 'completed', 'cancelled', 'no_show'].includes(status)) throw new HttpError(422, 'Unknown status');
      await db.run('UPDATE appointments SET status = ? WHERE id = ?', status, a.id);
    }
    if (date !== undefined || start_time !== undefined) {
      if (!isISODate(date) || !isTime(start_time)) throw new HttpError(422, 'Pick a date and time');
      const { slotsFor } = require('../slots');
      const slot = (await slotsFor(date, { forStaff: true })).find((s) => s.start === start_time);
      if (!slot) throw new HttpError(409, 'That time isn’t in the schedule');
      const sameSlot = a.date === date && a.start_time === start_time;
      if (!sameSlot && !slot.available) throw new HttpError(409, 'That slot is full');
      await db.run('UPDATE appointments SET date = ?, start_time = ?, end_time = ?, reminder_sent = 0 WHERE id = ?', date, start_time, slot.end, a.id);
    }
    res.json({ appointment: await db.get('SELECT * FROM appointments WHERE id = ?', a.id) });
  })
);

// ---------- Patients ----------

router.get(
  '/patients',
  wrap(async (req, res) => {
    const q = str(req.query.q, 100);
    const digits = q ? q.replace(/\D/g, '') : '';
    const where = ["u.role = 'patient'"];
    const args = [];
    if (q) {
      const parts = ['u.name LIKE ?'];
      args.push(`%${q}%`);
      if (digits.length >= 3) {
        parts.push('u.phone LIKE ?');
        args.push(`%${digits}%`);
      }
      where.push(`(${parts.join(' OR ')})`);
    }
    const rows = await db.all(
      `SELECT u.id, u.name, u.phone, u.email, u.gender, u.dob, u.created_at, u.password_hash IS NOT NULL AS has_account,
         (SELECT MAX(date) FROM visits WHERE patient_id = u.id) AS last_visit,
         (SELECT COUNT(*) FROM visits WHERE patient_id = u.id) AS visit_count,
         (SELECT COUNT(*) FROM prescription_items p JOIN visits v ON v.id = p.visit_id WHERE v.patient_id = u.id AND p.dispensed = 0) AS pending_items
       FROM users u WHERE ${where.join(' AND ')}
       ORDER BY COALESCE((SELECT MAX(date) FROM visits WHERE patient_id = u.id), u.created_at) DESC LIMIT 50`,
      ...args
    );
    res.json({ patients: rows.map((r) => ({ ...r, has_account: !!r.has_account })) });
  })
);

function patientFields(body) {
  const errors = {};
  const out = {};
  if (body.name !== undefined) {
    out.name = str(body.name, 120);
    if (!out.name) errors.name = 'Name is required';
  }
  if (body.phone !== undefined) {
    out.phone = normalizePhone(body.phone);
    if (!out.phone) errors.phone = 'Enter a valid phone number';
  }
  if (body.email !== undefined) {
    out.email = str(body.email, 200);
    if (out.email && !isEmail(out.email)) errors.email = 'That email doesn’t look right';
  }
  if (body.gender !== undefined) out.gender = str(body.gender, 20);
  if (body.dob !== undefined) {
    out.dob = str(body.dob, 10);
    if (out.dob && !isISODate(out.dob)) errors.dob = 'Use a valid date';
  }
  if (body.notes !== undefined) out.notes = str(body.notes, 4000);
  if (Object.keys(errors).length) throw new HttpError(422, 'Please check the highlighted fields', errors);
  return out;
}

/** Gives the patient a login with a temporary password (or resets it). The password is shown once. */
async function issueTempPassword(patient, { sendEmail = true } = {}) {
  const password = tempPassword();
  await db.run('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?', await bcrypt.hash(password, 10), patient.id);
  let emailed = false;
  if (sendEmail && patient.email) emailed = (await mail.welcome(patient, password)).sent;
  return { password, emailed };
}

router.post(
  '/patients',
  wrap(async (req, res) => {
    const f = patientFields({ name: '', phone: '', ...req.body });
    if (await db.get('SELECT 1 FROM users WHERE phone = ?', f.phone)) {
      throw new HttpError(409, 'A patient with this number already exists', { phone: 'Already registered' });
    }
    const { lastInsertRowid } = await db.run(
      'INSERT INTO users (name, phone, email, gender, dob, notes) VALUES (?, ?, ?, ?, ?, ?)',
      f.name, f.phone, f.email, f.gender, f.dob, f.notes
    );
    const patient = await db.get('SELECT * FROM users WHERE id = ?', lastInsertRowid);
    const account = req.body?.create_account ? await issueTempPassword(patient) : null;
    res.status(201).json({ patient: publicUser(patient), account });
  })
);

async function loadPatient(id) {
  const p = await db.get("SELECT * FROM users WHERE id = ? AND role = 'patient'", id);
  if (!p) throw new HttpError(404, 'Patient not found');
  return p;
}

router.get(
  '/patients/:id',
  wrap(async (req, res) => {
    const p = await loadPatient(req.params.id);
    const appointments = await db.all('SELECT * FROM appointments WHERE patient_id = ? ORDER BY date DESC, start_time DESC', p.id);
    const visits = await db.all('SELECT * FROM visits WHERE patient_id = ? ORDER BY date DESC, id DESC', p.id);
    const showPrivate = canSeePrivate(req.user);
    const photos = await db.all(
      'SELECT id, visit_id, mime, size, caption, visible_to_patient, created_at FROM attachments WHERE patient_id = ? ORDER BY created_at DESC',
      p.id
    );
    res.json({
      patient: { ...publicUser(p), notes: showPrivate ? p.notes : undefined },
      appointments,
      visits: await Promise.all(visits.map((v) => visitDetails(v, { showPrivate }))),
      photos,
    });
  })
);

router.patch(
  '/patients/:id',
  wrap(async (req, res) => {
    const p = await loadPatient(req.params.id);
    const f = patientFields(req.body || {});
    if (f.phone && f.phone !== p.phone && (await db.get('SELECT 1 FROM users WHERE phone = ?', f.phone))) {
      throw new HttpError(409, 'Another person already uses this number', { phone: 'Already registered' });
    }
    if (f.notes !== undefined && !canSeePrivate(req.user)) delete f.notes;
    const keys = Object.keys(f);
    if (keys.length) await db.run(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => f[k]), p.id);
    res.json({ patient: publicUser(await db.get('SELECT * FROM users WHERE id = ?', p.id)) });
  })
);

router.post(
  '/patients/:id/account',
  wrap(async (req, res) => {
    const p = await loadPatient(req.params.id);
    const account = await issueTempPassword(p, { sendEmail: req.body?.send_email !== false });
    res.json({ account, patient: publicUser(await db.get('SELECT * FROM users WHERE id = ?', p.id)) });
  })
);

// ---------- Visits & prescriptions ----------

function cleanItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((i, position) => ({
      position,
      medicine: str(i?.medicine, 200),
      kind: str(i?.kind, 40),
      dosage: str(i?.dosage, 100),
      frequency: str(i?.frequency, 100),
      duration: str(i?.duration, 100),
      instructions: str(i?.instructions, 500),
      quantity: str(i?.quantity, 50),
      id: Number(i?.id) || null,
    }))
    .filter((i) => i.medicine);
}

function visitFields(body) {
  const follow = str(body.follow_up_date, 10);
  if (follow && !isISODate(follow)) throw new HttpError(422, 'Follow-up date is not valid', { follow_up_date: 'Pick a valid date' });
  const date = str(body.date, 10) || today();
  if (!isISODate(date)) throw new HttpError(422, 'Visit date is not valid');
  return {
    date,
    concern: CONCERNS.includes(body.concern) ? body.concern : null,
    complaint: str(body.complaint, 4000),
    diagnosis: str(body.diagnosis, 2000),
    procedure_done: str(body.procedure_done, 2000),
    advice: str(body.advice, 4000),
    private_notes: str(body.private_notes, 8000),
    follow_up_date: follow,
  };
}

async function respondWithVisit(res, id, status = 200) {
  const v = await db.get('SELECT * FROM visits WHERE id = ?', id);
  res.status(status).json({ visit: await visitDetails(v, { showPrivate: true }) });
}

router.post(
  '/visits',
  clinician,
  wrap(async (req, res) => {
    const b = req.body || {};
    const patient = await loadPatient(b.patient_id);
    const f = visitFields(b);
    const items = cleanItems(b.items);
    let appointmentId = null;
    if (b.appointment_id) {
      const a = await db.get('SELECT * FROM appointments WHERE id = ? AND patient_id = ?', b.appointment_id, patient.id);
      if (!a) throw new HttpError(404, 'Appointment not found');
      appointmentId = a.id;
      f.concern = f.concern || a.concern;
      f.complaint = f.complaint || a.description;
    }
    const id = await db.tx(async (conn) => {
      const { lastInsertRowid } = await conn.run(
        `INSERT INTO visits (patient_id, appointment_id, doctor_id, date, concern, complaint, diagnosis, procedure_done, advice, private_notes, follow_up_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        patient.id, appointmentId, req.user.id, f.date, f.concern, f.complaint, f.diagnosis, f.procedure_done, f.advice, f.private_notes, f.follow_up_date
      );
      for (const i of items) {
        await conn.run(
          `INSERT INTO prescription_items (visit_id, position, medicine, kind, dosage, frequency, duration, instructions, quantity)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          lastInsertRowid, i.position, i.medicine, i.kind, i.dosage, i.frequency, i.duration, i.instructions, i.quantity
        );
      }
      if (appointmentId) await conn.run("UPDATE appointments SET status = 'completed' WHERE id = ?", appointmentId);
      return lastInsertRowid;
    });
    if (b.send_email && patient.email) {
      const v = await db.get('SELECT * FROM visits WHERE id = ?', id);
      await mail.visitSummary(patient, v, await db.all('SELECT * FROM prescription_items WHERE visit_id = ? ORDER BY position', id));
    }
    await respondWithVisit(res, id, 201);
  })
);

router.get(
  '/visits/:id',
  wrap(async (req, res) => {
    const v = await db.get('SELECT * FROM visits WHERE id = ?', req.params.id);
    if (!v) throw new HttpError(404, 'Visit not found');
    const patient = await db.get('SELECT * FROM users WHERE id = ?', v.patient_id);
    res.json({ visit: await visitDetails(v, { showPrivate: canSeePrivate(req.user) }), patient: publicUser(patient) });
  })
);

/** Edit a visit. Medicines already handed over stay as they are; the rest are replaced. */
router.put(
  '/visits/:id',
  clinician,
  wrap(async (req, res) => {
    const v = await db.get('SELECT * FROM visits WHERE id = ?', req.params.id);
    if (!v) throw new HttpError(404, 'Visit not found');
    const f = visitFields({ ...v, ...req.body });
    const items = cleanItems(req.body?.items);
    await db.tx(async (conn) => {
      await conn.run(
        `UPDATE visits SET date = ?, concern = ?, complaint = ?, diagnosis = ?, procedure_done = ?, advice = ?, private_notes = ?,
           follow_up_date = ?, follow_up_reminded = CASE WHEN follow_up_date IS ? THEN follow_up_reminded ELSE 0 END, updated_at = datetime('now')
         WHERE id = ?`,
        f.date, f.concern, f.complaint, f.diagnosis, f.procedure_done, f.advice, f.private_notes, f.follow_up_date, f.follow_up_date, v.id
      );
      if (req.body?.items !== undefined) {
        const keep = items.filter((i) => i.id).map((i) => i.id);
        const existing = await conn.all('SELECT id, dispensed FROM prescription_items WHERE visit_id = ?', v.id);
        for (const e of existing) {
          if (!keep.includes(e.id) && !e.dispensed) await conn.run('DELETE FROM prescription_items WHERE id = ?', e.id);
        }
        for (const i of items) {
          const own = i.id && existing.find((e) => e.id === i.id);
          if (own) {
            await conn.run(
              `UPDATE prescription_items SET position = ?, medicine = ?, kind = ?, dosage = ?, frequency = ?, duration = ?, instructions = ?, quantity = ?
               WHERE id = ?`,
              i.position, i.medicine, i.kind, i.dosage, i.frequency, i.duration, i.instructions, i.quantity, i.id
            );
          } else {
            await conn.run(
              `INSERT INTO prescription_items (visit_id, position, medicine, kind, dosage, frequency, duration, instructions, quantity)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              v.id, i.position, i.medicine, i.kind, i.dosage, i.frequency, i.duration, i.instructions, i.quantity
            );
          }
        }
      }
    });
    await respondWithVisit(res, v.id);
  })
);

router.delete(
  '/visits/:id',
  clinician,
  wrap(async (req, res) => {
    const { changes } = await db.run('DELETE FROM visits WHERE id = ?', req.params.id);
    if (!changes) throw new HttpError(404, 'Visit not found');
    res.json({ ok: true });
  })
);

router.post(
  '/visits/:id/email',
  wrap(async (req, res) => {
    const v = await db.get('SELECT * FROM visits WHERE id = ?', req.params.id);
    if (!v) throw new HttpError(404, 'Visit not found');
    const patient = await db.get('SELECT * FROM users WHERE id = ?', v.patient_id);
    if (!patient.email) throw new HttpError(422, 'Add the patient’s email first');
    const result = await mail.visitSummary(patient, v, await db.all('SELECT * FROM prescription_items WHERE visit_id = ? ORDER BY position', v.id));
    if (!result.sent) throw new HttpError(503, result.reason === 'smtp not configured' ? 'Email isn’t set up on the server yet (SMTP settings)' : 'The email could not be sent');
    res.json({ ok: true });
  })
);

/** Medicines the doctor has prescribed before, for quick-add while writing a prescription. */
router.get(
  '/medicines',
  wrap(async (req, res) => {
    const q = str(req.query.q, 100) || '';
    const rows = await db.all(
      `SELECT medicine, kind, dosage, frequency, duration, instructions, COUNT(*) AS uses FROM prescription_items
       WHERE medicine LIKE ? GROUP BY lower(medicine) ORDER BY uses DESC LIMIT 12`,
      `%${q}%`
    );
    res.json({ medicines: rows });
  })
);

// ---------- Photos & reports ----------

const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

router.post(
  '/attachments',
  clinician,
  wrap(async (req, res) => {
    const b = req.body || {};
    const patient = await loadPatient(b.patient_id);
    const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data || ''));
    if (!m) throw new HttpError(422, 'Upload a photo or PDF');
    const [, mime, data] = m;
    if (!ALLOWED.includes(mime)) throw new HttpError(422, 'Use a JPG, PNG, WebP or PDF file');
    const size = Math.floor((data.length * 3) / 4);
    if (size > MAX_BYTES) throw new HttpError(413, 'That file is larger than 6 MB');
    let visitId = null;
    if (b.visit_id) {
      const v = await db.get('SELECT id FROM visits WHERE id = ? AND patient_id = ?', b.visit_id, patient.id);
      if (!v) throw new HttpError(404, 'Visit not found');
      visitId = v.id;
    }
    const { lastInsertRowid } = await db.run(
      'INSERT INTO attachments (patient_id, visit_id, mime, data, size, caption, visible_to_patient, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      patient.id, visitId, mime, data, size, str(b.caption, 200), b.visible_to_patient === false ? 0 : 1, req.user.id
    );
    const row = await db.get('SELECT id, visit_id, mime, size, caption, visible_to_patient, created_at FROM attachments WHERE id = ?', lastInsertRowid);
    res.status(201).json({ attachment: row });
  })
);

router.patch(
  '/attachments/:id',
  clinician,
  wrap(async (req, res) => {
    const a = await db.get('SELECT id FROM attachments WHERE id = ?', req.params.id);
    if (!a) throw new HttpError(404, 'File not found');
    if (req.body?.caption !== undefined) await db.run('UPDATE attachments SET caption = ? WHERE id = ?', str(req.body.caption, 200), a.id);
    if (req.body?.visible_to_patient !== undefined) await db.run('UPDATE attachments SET visible_to_patient = ? WHERE id = ?', req.body.visible_to_patient ? 1 : 0, a.id);
    res.json({ attachment: await db.get('SELECT id, visit_id, mime, size, caption, visible_to_patient, created_at FROM attachments WHERE id = ?', a.id) });
  })
);

router.delete(
  '/attachments/:id',
  clinician,
  wrap(async (req, res) => {
    const { changes } = await db.run('DELETE FROM attachments WHERE id = ?', req.params.id);
    if (!changes) throw new HttpError(404, 'File not found');
    res.json({ ok: true });
  })
);

// ---------- Pharmacy ----------

async function pharmacyRows(where, args) {
  const visits = await db.all(
    `SELECT v.*, u.name, u.phone FROM visits v JOIN users u ON u.id = v.patient_id
     WHERE ${where} AND EXISTS (SELECT 1 FROM prescription_items WHERE visit_id = v.id)
     ORDER BY v.date DESC, v.id DESC LIMIT 60`,
    ...args
  );
  return Promise.all(
    visits.map(async (v) => {
      const d = await visitDetails(v);
      return {
        visit_id: v.id, date: v.date, patient_id: v.patient_id, name: v.name, phone: v.phone, doctor_name: d.doctor_name,
        diagnosis: v.diagnosis, items: d.items, follow_up_date: v.follow_up_date,
      };
    })
  );
}

/** Prescriptions still waiting to be handed over, newest first. */
router.get(
  '/pharmacy/queue',
  wrap(async (req, res) => {
    const rows = await pharmacyRows(
      'v.date >= ? AND EXISTS (SELECT 1 FROM prescription_items WHERE visit_id = v.id AND dispensed = 0)',
      [addDays(today(), -30)]
    );
    res.json({ prescriptions: rows });
  })
);

router.get(
  '/pharmacy/search',
  wrap(async (req, res) => {
    const q = str(req.query.q, 100);
    if (!q) return res.json({ prescriptions: [] });
    const digits = q.replace(/\D/g, '');
    const rows = await pharmacyRows(
      digits.length >= 3 ? '(u.name LIKE ? OR u.phone LIKE ?)' : 'u.name LIKE ?',
      digits.length >= 3 ? [`%${q}%`, `%${digits}%`] : [`%${q}%`]
    );
    res.json({ prescriptions: rows });
  })
);

router.post(
  '/prescription-items/:id/dispense',
  wrap(async (req, res) => {
    const item = await db.get('SELECT * FROM prescription_items WHERE id = ?', req.params.id);
    if (!item) throw new HttpError(404, 'Medicine not found');
    const done = req.body?.dispensed !== false;
    await db.run(
      "UPDATE prescription_items SET dispensed = ?, dispensed_at = CASE WHEN ? THEN datetime('now') ELSE NULL END, dispensed_by = ? WHERE id = ?",
      done ? 1 : 0, done ? 1 : 0, done ? req.user.id : null, item.id
    );
    res.json({ item: await db.get('SELECT * FROM prescription_items WHERE id = ?', item.id) });
  })
);

router.post(
  '/visits/:id/dispense-all',
  wrap(async (req, res) => {
    await db.run(
      "UPDATE prescription_items SET dispensed = 1, dispensed_at = datetime('now'), dispensed_by = ? WHERE visit_id = ? AND dispensed = 0",
      req.user.id, req.params.id
    );
    res.json({ items: await db.all('SELECT * FROM prescription_items WHERE visit_id = ? ORDER BY position', req.params.id) });
  })
);

module.exports = router;
