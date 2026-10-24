import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Package, Phone, Truck, Store, ImagePlus, Trash2, ShoppingBag } from 'lucide-react';
import { api } from '../lib/api';
import { useApp, useLoad } from '../lib/store';
import { inr } from '../lib/cart';
import { fmtDate, displayPhone, compressImage } from '../lib/format';
import { Badge, Button, Empty, ErrorBox, Field, Modal, PageSkeleton, Skeleton, fieldErrors } from '../components/ui';
import ProductImage from '../components/ProductImage';
import { SHOP_CATS } from './Shop';

const ORDER_STATUS = {
  awaiting_payment: { label: 'Awaiting payment', tone: 'grey' },
  placed: { label: 'New', tone: 'clay' },
  confirmed: { label: 'Confirmed', tone: 'blue' },
  ready: { label: 'Ready', tone: 'amber' },
  completed: { label: 'Completed', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'grey' },
};
/** How the order is being paid for, as a badge. */
function PaymentBadge({ o }) {
  if (o.payment === 'online') {
    if (o.payment_status === 'paid') return <Badge tone="green">Paid online</Badge>;
    if (o.payment_status === 'refunded') return <Badge tone="grey">Refunded</Badge>;
    return <Badge tone="grey">Not paid</Badge>;
  }
  return <Badge tone="blue">{o.payment === 'cod' ? 'Cash on delivery' : 'Pay at clinic'}</Badge>;
}

/** The one next step for an open order. */
const NEXT = { placed: ['confirmed', 'Confirm'], confirmed: ['ready', 'Mark ready'], ready: ['completed', 'Mark completed'] };

// ---------- Staff: orders ----------

export function ShopOrders() {
  const { toast } = useApp();
  const [status, setStatus] = useState('open');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const { data, error, loading, reload, setData } = useLoad(() => api('/staff/orders', { query: { status, q: debounced } }), [status, debounced]);
  const update = async (o, next) => {
    const refundNote = o.payment === 'online' && o.payment_status === 'paid' ? ` ${inr(o.total)} will be refunded to the customer through Razorpay.` : '';
    if (next === 'cancelled' && !window.confirm(`Cancel order ${o.number}? The stock goes back on the shelf.${refundNote}`)) return;
    try {
      const r = await api(`/staff/orders/${o.id}`, { method: 'PATCH', body: { status: next } });
      setData((d) => ({ ...d, orders: d.orders.map((x) => (x.id === o.id ? r.order : x)) }));
      toast(`${o.number}: ${ORDER_STATUS[next].label.toLowerCase()}`);
    } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <div className="page fade-in">
      <div className="page-head">
        <div><div className="eyebrow">Shop</div><h1 className="mt-4">Orders</h1></div>
        {data && <div className="day-summary"><span><b>{data.open}</b> open</span></div>}
      </div>
      <div className="row wrap between" style={{ gap: 12 }}>
        <div className="chips">
          {[['open', 'Open'], ['completed', 'Completed'], ['awaiting_payment', 'Unpaid'], ['cancelled', 'Cancelled'], ['', 'All']].map(([k, l]) => (
            <button key={k} className={`chip ${status === k ? 'on' : ''}`} onClick={() => setStatus(k)}>{l}</button>
          ))}
        </div>
        <div className="input-icon" style={{ minWidth: 260 }}><Search size={17} /><input className="input sm" placeholder="Order number, name or phone" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <div className="stack gap-16 mt-16">
        {error ? <ErrorBox error={error} onRetry={reload} /> : loading && !data ? [0, 1].map((i) => <Skeleton key={i} h={150} />)
          : !data.orders.length ? <div className="card"><Empty icon={ShoppingBag} title="No orders here" /></div>
          : data.orders.map((o) => {
            const st = ORDER_STATUS[o.status];
            const next = NEXT[o.status];
            return (
              <div key={o.id} className="card order-card">
                <div className="row between wrap" style={{ gap: 12 }}>
                  <div>
                    <div className="row gap-6 wrap"><span className="strong">{o.number}</span><Badge tone={st.tone}>{st.label}</Badge><PaymentBadge o={o} /></div>
                    <div className="small muted mt-4">{fmtDate(o.created_at)} · {o.customer.name} · {displayPhone(o.customer.phone)}</div>
                  </div>
                  <div className="row gap-6">
                    <a className="btn sm icon ghost" href={`tel:${o.customer.phone}`} title="Call"><Phone size={16} /></a>
                    {!['completed', 'cancelled', 'awaiting_payment'].includes(o.status) && <Button className="sm ghost danger" onClick={() => update(o, 'cancelled')}>{o.payment_status === 'paid' ? 'Cancel & refund' : 'Cancel'}</Button>}
                    {next && <Button className="primary sm" onClick={() => update(o, next[0])}>{next[1]}</Button>}
                  </div>
                </div>
                <div className="order-lines mt-12">
                  {o.items.map((i) => <div key={i.product_id} className="row between small"><span>{i.name}{i.size ? ` · ${i.size}` : ''} × {i.qty}</span><span>{inr(i.price * i.qty)}</span></div>)}
                </div>
                <div className="row between wrap mt-12" style={{ gap: 8 }}>
                  <span className="small muted row gap-6">
                    {o.fulfilment === 'delivery' ? <><Truck size={15} />{[o.address.line, o.address.city, o.address.pincode].join(', ')}</> : <><Store size={15} />Pick up at the clinic</>}
                  </span>
                  <b>{inr(o.total)}</b>
                </div>
                {o.notes && <div className="notice sun small mt-12">“{o.notes}”</div>}
                {o.staff_note && <div className="notice red small mt-12">{o.staff_note}</div>}
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ---------- Admin: products ----------

export function ProductsAdmin() {
  const { data, error, loading, reload } = useLoad(() => api('/admin/products'), []);
  const [editing, setEditing] = useState(null);
  if (error) return <div className="page"><ErrorBox error={error} onRetry={reload} /></div>;
  if (loading) return <div className="page"><PageSkeleton /></div>;
  return (
    <div className="page fade-in">
      <div className="page-head">
        <div><div className="eyebrow">Admin</div><h1 className="mt-4">Products</h1><p className="muted small mt-4">What’s for sale in the shop. Prices in rupees.</p></div>
        <div className="row gap-6">
          <Link to="/shop" className="btn" target="_blank">View shop</Link>
          <Button className="primary" onClick={() => setEditing({})}><Plus size={17} />Add product</Button>
        </div>
      </div>
      <div className="card" style={{ padding: 8 }}>
        {!data.products.length ? <Empty icon={Package} title="No products yet" action={<Button className="primary" onClick={() => setEditing({})}>Add your first product</Button>} /> : (
          <div className="list">
            {data.products.map((p) => (
              <div key={p.id} className="list-item click" onClick={() => setEditing(p)} style={{ opacity: p.active ? 1 : 0.5 }}>
                <ProductImage product={p} className="thumb sm" />
                <div className="grow">
                  <div className="strong">{p.name}</div>
                  <div className="small muted">{SHOP_CATS[p.category]}{p.size ? ` · ${p.size}` : ''}</div>
                </div>
                {!p.active && <Badge tone="grey">Hidden</Badge>}
                {p.active && p.stock <= 0 && <Badge tone="red">Sold out</Badge>}
                {p.active && p.stock > 0 && p.stock <= 5 && <Badge tone="amber">{p.stock} left</Badge>}
                <span className="strong" style={{ minWidth: 80, textAlign: 'right' }}>{inr(p.price)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {editing && <ProductEditor product={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

function ProductEditor({ product, onClose, onSaved }) {
  const { toast } = useApp();
  const fileRef = useRef();
  const [f, setF] = useState(() => ({
    name: product?.name || '', brand: product?.brand || '', category: product?.category || 'serums', size: product?.size || '',
    price: product?.price ?? '', mrp: product?.mrp ?? '', stock: product?.stock ?? 10, summary: product?.summary || '',
    description: product?.description || '', how_to_use: product?.how_to_use || '', ingredients: product?.ingredients || '',
    skin_types: product?.skin_types || '', active: product?.active ?? true, featured: product?.featured ?? false,
  }));
  const [image, setImage] = useState(undefined); // undefined = unchanged, null = remove, string = new
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const preview = image ? { ...f, image_url: null, _local: image } : image === null ? { ...f, image_url: null } : { ...f, image_url: product?.image_url };

  const pick = async (file) => {
    try { setImage(await compressImage(file, 1200, 0.85)); } catch (e) { toast(e.message, 'err'); }
  };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const body = { ...f, ...(image !== undefined ? { image } : {}) };
      await api(product ? `/admin/products/${product.id}` : '/admin/products', { method: product ? 'PUT' : 'POST', body });
      toast('Product saved');
      onSaved();
    } catch (ex) { setErrors(fieldErrors(ex)); toast(ex.message, 'err'); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm('Remove this product from the shop?')) return;
    const r = await api(`/admin/products/${product.id}`, { method: 'DELETE' });
    toast(r.archived ? 'Hidden from the shop (it has past orders)' : 'Product deleted');
    onSaved();
  };
  return (
    <Modal title={product ? 'Edit product' : 'New product'} onClose={onClose} wide>
      <form className="stack gap-16" onSubmit={save}>
        <div className="row top gap-16 wrap">
          <div style={{ width: 160 }}>
            {preview._local ? <div className="product-img thumb lg"><img src={preview._local} alt="" /></div> : <ProductImage product={preview} className="thumb lg" />}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => e.target.files[0] && pick(e.target.files[0])} />
            <div className="row gap-6 mt-8">
              <Button type="button" className="sm" onClick={() => fileRef.current?.click()}><ImagePlus size={15} />Photo</Button>
              {(preview._local || preview.image_url) && <Button type="button" className="sm ghost icon" onClick={() => setImage(null)} aria-label="Remove photo"><Trash2 size={15} /></Button>}
            </div>
          </div>
          <div className="grow stack gap-16" style={{ minWidth: 260 }}>
            <Field label="Name" error={errors.name}><input className="input" value={f.name} onChange={set('name')} required /></Field>
            <div className="grid g-2">
              <Field label="Brand"><input className="input" value={f.brand} onChange={set('brand')} /></Field>
              <Field label="Category" error={errors.category}>
                <select className="input" value={f.category} onChange={set('category')}>{Object.entries(SHOP_CATS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              </Field>
            </div>
          </div>
        </div>
        <div className="grid g-4 keep-2">
          <Field label="Price (₹)" error={errors.price}><input className="input" inputMode="numeric" value={f.price} onChange={set('price')} required /></Field>
          <Field label="MRP (₹, optional)" error={errors.mrp}><input className="input" inputMode="numeric" value={f.mrp} onChange={set('mrp')} /></Field>
          <Field label="Size"><input className="input" value={f.size} onChange={set('size')} placeholder="50 ml" /></Field>
          <Field label="In stock"><input className="input" inputMode="numeric" value={f.stock} onChange={set('stock')} /></Field>
        </div>
        <Field label="One-line summary" hint="Shown under the name"><input className="input" value={f.summary} onChange={set('summary')} /></Field>
        <Field label="Suits" hint="e.g. Oily · Acne-prone"><input className="input" value={f.skin_types} onChange={set('skin_types')} /></Field>
        <Field label="About"><textarea className="input" rows={3} value={f.description} onChange={set('description')} /></Field>
        <div className="grid g-2">
          <Field label="How to use"><textarea className="input" rows={3} value={f.how_to_use} onChange={set('how_to_use')} /></Field>
          <Field label="Key ingredients"><textarea className="input" rows={3} value={f.ingredients} onChange={set('ingredients')} /></Field>
        </div>
        <div className="row wrap gap-24">
          <label className="check"><input type="checkbox" checked={f.active} onChange={set('active')} />Show in the shop</label>
          <label className="check"><input type="checkbox" checked={f.featured} onChange={set('featured')} />Doctor’s pick</label>
        </div>
        <div className="row between">
          {product ? <Button type="button" className="ghost danger" onClick={remove}><Trash2 size={15} />Remove</Button> : <span />}
          <div className="row"><Button type="button" className="ghost" onClick={onClose}>Cancel</Button><Button className="primary" loading={busy}>Save</Button></div>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Patient: my orders ----------

export function PortalOrders() {
  const { data, error, loading, reload } = useLoad(() => api('/me/orders'), []);
  if (error) return <div className="page narrow"><ErrorBox error={error} onRetry={reload} /></div>;
  if (loading) return <div className="page narrow"><PageSkeleton /></div>;
  return (
    <div className="page narrow fade-in">
      <div className="page-head"><h1>My orders</h1><Link to="/shop" className="btn primary"><ShoppingBag size={17} />Shop</Link></div>
      {!data.orders.length ? <div className="card"><Empty icon={ShoppingBag} title="No orders yet" action={<Link to="/shop" className="btn primary">Browse the shop</Link>} /></div> : (
        <div className="stack gap-16">
          {data.orders.filter((o) => !(o.status === 'cancelled' && ['payment_abandoned', 'payment_timeout'].includes(o.cancel_reason))).map((o) => (
            <div key={o.id} className="card">
              <div className="row between"><span className="strong">{o.number}</span><Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge></div>
              <div className="small muted mt-4">{fmtDate(o.created_at)} · {o.fulfilment === 'delivery' ? 'Delivery' : 'Pick up at the clinic'}</div>
              <div className="order-lines mt-12">{o.items.map((i) => <div key={i.product_id} className="row between small"><span>{i.name} × {i.qty}</span><span>{inr(i.price * i.qty)}</span></div>)}</div>
              <div className="row between mt-12"><PaymentBadge o={o} /><b>{inr(o.total)}</b></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
