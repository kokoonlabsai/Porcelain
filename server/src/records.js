const { db, out } = require('./db');

const ATTACHMENT_FIELDS = { data: 0 };

/** A visit with its prescription, photos and doctor, in API shape. Private notes are for doctors only. */
async function visitDetails(v, { forPatient = false, showPrivate = false } = {}) {
  const attachments = await db.attachments
    .find({ visit_id: v._id, ...(forPatient ? { visible_to_patient: true } : {}) }, { projection: ATTACHMENT_FIELDS })
    .sort({ _id: 1 })
    .toArray();
  const doctor = v.doctor_id ? await db.users.findOne({ _id: v.doctor_id }, { projection: { name: 1 } }) : null;
  const res = out({ ...v, items: v.items || [], attachments, doctor_name: doctor?.name || null });
  if (!showPrivate) delete res.private_notes;
  delete res.follow_up_reminded;
  return res;
}

module.exports = { visitDetails, ATTACHMENT_FIELDS };
