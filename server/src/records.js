const { db, out } = require('./db');

const ATTACHMENT_FIELDS = { data: 0 };

/** A visit with its prescription, photos and doctor, in API shape. Private notes are for doctors only. */
async function visitDetails(v, { forPatient = false, showPrivate = false } = {}) {
  const attachments = await db.attachments
    .find({ visit_id: v._id, ...(forPatient ? { visible_to_patient: true } : {}) }, { projection: ATTACHMENT_FIELDS })
    .sort({ _id: 1 })
    .toArray();
  const doctor = v.doctor_id ? await db.users.findOne({ _id: v.doctor_id }, { projection: { name: 1 } }) : null;
  // Prescribed items the shop stocks carry the product, so patients can order them online.
  const items = v.items || [];
  const productIds = items.map((i) => i.product_id).filter(Boolean);
  const { productOut } = require('./routes/shop');
  const products = productIds.length ? await db.products.find({ _id: { $in: productIds }, active: true }, { projection: { 'image.data': 0 } }).toArray() : [];
  const byId = new Map(products.map((p) => [String(p._id), productOut(p)]));
  const withProducts = items.map((i) => {
    const p = i.product_id && byId.get(String(i.product_id));
    return p ? { ...i, product: { id: p.id, slug: p.slug, name: p.name, brand: p.brand, size: p.size, price: p.price, category: p.category, stock: p.stock, image_url: p.image_url } } : i;
  });
  const { sessionsForVisit } = require('./routes/packages');
  const res = out({ ...v, items: withProducts, attachments, doctor_name: doctor?.name || null, package_sessions: await sessionsForVisit(v._id) });
  if (!showPrivate) delete res.private_notes;
  delete res.follow_up_reminded;
  return res;
}

module.exports = { visitDetails, ATTACHMENT_FIELDS };
