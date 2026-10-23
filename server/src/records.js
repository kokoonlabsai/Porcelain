const { db } = require('./db');

/** A visit with its prescription, photos and doctor. Private notes are for doctors only. */
async function visitDetails(v, { forPatient = false, showPrivate = false } = {}) {
  const items = await db.all('SELECT * FROM prescription_items WHERE visit_id = ? ORDER BY position, id', v.id);
  const attachments = await db.all(
    `SELECT id, mime, size, caption, visible_to_patient, created_at FROM attachments
     WHERE visit_id = ? ${forPatient ? 'AND visible_to_patient = 1' : ''} ORDER BY id`,
    v.id
  );
  const doctor = v.doctor_id ? await db.get('SELECT name FROM users WHERE id = ?', v.doctor_id) : null;
  const out = { ...v, items, attachments, doctor_name: doctor?.name || null };
  if (!showPrivate) delete out.private_notes;
  delete out.follow_up_reminded;
  return out;
}

module.exports = { visitDetails };
