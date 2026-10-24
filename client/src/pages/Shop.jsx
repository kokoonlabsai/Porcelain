import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Minus, Plus, ShoppingBag, X, Truck, Store, Check, Stethoscope, Search, CreditCard, Wallet, Lock } from 'lucide-react';
import { api } from '../lib/api';
import { useApp, useLoad } from '../lib/store';
import { useCart, inr } from '../lib/cart';
import { useReveal } from '../lib/reveal';
import { Button, Field, Empty, ErrorBox, Skeleton, fieldErrors } from '../components/ui';
import ProductImage from '../components/ProductImage';

export const SHOP_CATS = {
  cleansers: 'Cleansers',
  serums: 'Serums',
  moisturisers: 'Moisturisers',
  sunscreen: 'Sunscreen',
  treatments: 'Treatments',
  hair: 'Hair care',
  body: 'Body',
};

/** Delivery terms from the clinic settings (the server applies the same ones). */
export function shopDelivery(settings) {
  return {
    enabled: settings.shop_delivery !== '0',
    fee: Number(settings.shop_delivery_fee) || 0,
    freeOver: Number(settings.shop_free_delivery_over) || 0,
    areas: settings.shop_delivery_areas,
  };
}

function Price({ p, big }) {
  const off = p.mrp && p.mrp > p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0;
  return (
    <span className={`price ${big ? 'big' : ''}`}>
      <b>{inr(p.price)}</b>
      {off > 0 && <><s>{inr(p.mrp)}</s><em>{off}% off</em></>}
    </span>
  );
}

function ProductCard({ p, i }) {
  const { add } = useCart();
  const out = p.stock <= 0;
  return (
    <div className="product-card sr" style={{ transitionDelay: `${(i % 4) * 70}ms` }}>
      <Link to={`/shop/${p.slug}`} className="product-media">
        <ProductImage product={p} />
        {p.featured && <span className="product-flag">Doctor’s pick</span>}
      </Link>
      <div className="product-body">
        <div className="product-kicker">{SHOP_CATS[p.category]}{p.size ? ` · ${p.size}` : ''}</div>
        <Link to={`/shop/${p.slug}`} className="product-name">{p.name}</Link>
        <div className="row between mt-12">
          <Price p={p} />
          <button className="add-btn" disabled={out} onClick={() => add(p)} aria-label={`Add ${p.name} to bag`}>
            {out ? 'Sold out' : <><Plus size={16} />Add</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ShopList() {
  const [params, setParams] = useSearchParams();
  const c = params.get('c') || '';
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const { data, error, loading, reload } = useLoad(() => api('/shop/products', { query: { category: c, q: debounced } }), [c, debounced]);
  useReveal();
  const delivery = data?.delivery;
  return (
    <>
      <section className="shop-hero">
        <div className="contain">
          <div className="eyebrow reveal">The Porcelain edit</div>
          <h1 className="big-statement mt-16 reveal d1">Skincare, <em>prescribed.</em></h1>
          <p className="sub reveal d2">Products our dermatologists actually recommend — from everyday essentials to targeted treatments.</p>
          <div className="shop-perks reveal d3">
            <span><Stethoscope size={18} />Chosen by doctors</span>
            <span><Store size={18} />Pick up at the clinic</span>
            {delivery?.enabled && <span><Truck size={18} />Delivery in {delivery.areas || 'town'}{delivery.freeOver ? ` · free over ${inr(delivery.freeOver)}` : ''}</span>}
          </div>
        </div>
      </section>
      <section className="contain shop-wrap">
        <div className="shop-bar">
          <div className="chips">
            <button className={`chip ${!c ? 'on' : ''}`} onClick={() => setParams({})}>All</button>
            {Object.entries(SHOP_CATS).map(([k, l]) => (
              <button key={k} className={`chip ${c === k ? 'on' : ''}`} onClick={() => setParams({ c: k })}>{l}</button>
            ))}
          </div>
          <div className="input-icon shop-search"><Search size={17} /><input className="input sm" placeholder="Search products" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
        {error ? <ErrorBox error={error} onRetry={reload} /> : loading && !data ? (
          <div className="product-grid">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} h={380} />)}</div>
        ) : !data.products.length ? (
          <Empty icon={ShoppingBag} title="Nothing here yet">{debounced ? 'Try another search.' : 'New products are on their way.'}</Empty>
        ) : (
          <div className="product-grid">{data.products.map((p, i) => <ProductCard key={p.id} p={p} i={i} />)}</div>
        )}
        <div className="shop-note">
          <Stethoscope size={20} />
          <div><b>Not sure what suits your skin?</b> A consultation gets you a routine made for you — and you can pick it up downstairs.</div>
          <Link to="/book" className="btn sm">Book a visit</Link>
        </div>
      </section>
    </>
  );
}

export function ProductPage() {
  const { slug } = useParams();
  const { add } = useCart();
  const [qty, setQty] = useState(1);
  const { data, error, loading, reload } = useLoad(() => api(`/shop/products/${slug}`), [slug]);
  useEffect(() => setQty(1), [slug]);
  if (error) return <div className="contain" style={{ padding: '40px 16px' }}><ErrorBox error={error} onRetry={reload} /></div>;
  if (loading) return <div className="contain" style={{ padding: '40px 16px' }}><Skeleton h={480} /></div>;
  const p = data.product;
  const out = p.stock <= 0;
  const sections = [
    ['About', p.description],
    ['How to use', p.how_to_use],
    ['Key ingredients', p.ingredients],
  ].filter(([, v]) => v);
  return (
    <div className="contain product-page fade-in">
      <Link to={`/shop?c=${p.category}`} className="caps-link"><ArrowLeft size={14} />{SHOP_CATS[p.category]}</Link>
      <div className="product-layout mt-24">
        <div className="product-hero-img"><ProductImage product={p} /></div>
        <div>
          {p.brand && <div className="eyebrow">{p.brand}</div>}
          <h1 className="product-title mt-12">{p.name}</h1>
          <div className="muted mt-8">{[p.size, p.skin_types].filter(Boolean).join(' · ')}</div>
          <div className="mt-24"><Price p={p} big /></div>
          {p.summary && <p className="lux-lead mt-24">{p.summary}</p>}
          <div className="row wrap mt-32" style={{ gap: 12 }}>
            <div className="qty">
              <button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Less"><Minus size={16} /></button>
              <span>{qty}</span>
              <button onClick={() => setQty(Math.min(10, p.stock, qty + 1))} aria-label="More"><Plus size={16} /></button>
            </div>
            <Button className="primary lg" disabled={out} onClick={() => add(p, qty)}>{out ? 'Sold out' : <><ShoppingBag size={18} />Add to bag</>}</Button>
          </div>
          {!out && p.stock <= 5 && <p className="small mt-12" style={{ color: 'var(--brass-text)', fontWeight: 600 }}>Only {p.stock} left</p>}
          <div className="faq mt-48">
            {sections.map(([t, v], i) => (
              <details key={t} className="faq-item" open={i === 0}>
                <summary>{t}<Plus className="faq-plus" size={22} /></summary>
                <p className="pre">{v}</p>
              </details>
            ))}
          </div>
          <p className="small muted mt-24">Using a prescription treatment? Check with your doctor before adding new actives.</p>
        </div>
      </div>
      {data.related.length > 0 && (
        <section className="mt-64">
          <h2 className="big-statement" style={{ fontSize: 'clamp(32px, 4vw, 48px)' }}>Pairs <em>well</em> with</h2>
          <div className="product-grid mt-32">{data.related.map((r, i) => <ProductCard key={r.id} p={r} i={i} />)}</div>
        </section>
      )}
    </div>
  );
}

/** Slide-in bag, opened from the header or after adding something. */
export function CartDrawer() {
  const { items, open, setOpen, setQty, remove, subtotal, count } = useCart();
  const nav = useNavigate();
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);
  return (
    <>
      <div className={`drawer-back ${open ? 'on' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`drawer ${open ? 'on' : ''}`} aria-hidden={!open} aria-label="Your bag">
        <div className="drawer-head">
          <div className="card-title">Your bag {count > 0 && <span className="muted">({count})</span>}</div>
          <button className="btn ghost icon" onClick={() => setOpen(false)} aria-label="Close"><X size={20} /></button>
        </div>
        {!items.length ? (
          <Empty icon={ShoppingBag} title="Your bag is empty" action={<Link to="/shop" className="btn primary" onClick={() => setOpen(false)}>Browse the shop</Link>} />
        ) : (
          <>
            <div className="drawer-items">
              {items.map((i) => (
                <div key={i.id} className="bag-item">
                  <Link to={`/shop/${i.slug}`} onClick={() => setOpen(false)}><ProductImage product={i} className="thumb" /></Link>
                  <div className="grow">
                    <div className="strong">{i.name}</div>
                    {i.size && <div className="tiny muted">{i.size}</div>}
                    <div className="row between mt-8">
                      <div className="qty sm">
                        <button onClick={() => setQty(i.id, i.qty - 1)} aria-label="Less"><Minus size={14} /></button>
                        <span>{i.qty}</span>
                        <button onClick={() => setQty(i.id, i.qty + 1)} aria-label="More"><Plus size={14} /></button>
                      </div>
                      <b>{inr(i.price * i.qty)}</b>
                    </div>
                  </div>
                  <button className="btn ghost icon sm" onClick={() => remove(i.id)} aria-label={`Remove ${i.name}`}><X size={16} /></button>
                </div>
              ))}
            </div>
            <div className="drawer-foot">
              <div className="row between"><span>Subtotal</span><b className="serif-num">{inr(subtotal)}</b></div>
              <p className="tiny muted mt-4">Delivery, if you choose it, is added at checkout. Pay at the clinic or on delivery.</p>
              <Button className="primary lg block mt-16" onClick={() => { setOpen(false); nav('/shop/checkout'); }}>Checkout <ArrowRight size={18} /></Button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

/** Loads Razorpay's checkout script once, on demand. */
let razorpayScript;
function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  razorpayScript ||= new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = 'https://checkout.razorpay.com/v1/checkout.js';
    el.onload = () => resolve();
    el.onerror = () => { razorpayScript = null; reject(new Error('Couldn’t load the payment window. Check your connection and try again.')); };
    document.body.appendChild(el);
  });
  return razorpayScript;
}

/** Opens Razorpay's window; resolves with the signed result, or null if the customer closed it. */
function payWithRazorpay(rzp) {
  return new Promise((resolve, reject) => {
    const checkout = new window.Razorpay({
      key: rzp.key,
      order_id: rzp.order_id,
      amount: rzp.amount,
      currency: rzp.currency,
      name: rzp.name,
      description: rzp.description,
      prefill: rzp.prefill,
      theme: { color: '#1F3264' },
      handler: (result) => resolve(result),
      modal: { ondismiss: () => resolve(null), confirm_close: true },
    });
    checkout.on('payment.failed', () => { /* Razorpay shows the error and lets them retry inside the window. */ });
    try { checkout.open(); } catch (e) { reject(e); }
  });
}

export function Checkout() {
  const { user, isStaff, settings } = useApp();
  const patient = user && !isStaff ? user : null;
  const { items, subtotal, clear, setOpen } = useCart();
  const delivery = shopDelivery(settings);
  const config = useLoad(() => api('/shop/config'), []);
  const online = !!config.data?.online_payment;
  const [f, setF] = useState({ name: patient?.name || '', phone: patient?.phone || '', email: patient?.email || '', fulfilment: 'pickup', payment: 'online', address: '', city: 'Bhopal', pincode: '', notes: '' });
  const payment = online ? f.payment : 'offline';
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const fee = f.fulfilment === 'delivery' && !(delivery.freeOver && subtotal >= delivery.freeOver) ? delivery.fee : 0;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setError('');
    try {
      if (payment === 'online') await loadRazorpay();
      const r = await api('/shop/orders', { method: 'POST', body: { ...f, payment, items: items.map((i) => ({ product_id: i.id, qty: i.qty })) } });
      let order = r.order;
      if (r.razorpay) {
        const result = await payWithRazorpay(r.razorpay);
        if (!result) {
          // Closed without paying: release the stock and let them try again or switch method.
          api(`/shop/orders/${order.id}/abandon`, { method: 'POST', body: { razorpay_order_id: r.razorpay.order_id } }).catch(() => {});
          setError('Payment wasn’t completed. You can try again, or choose to pay at the clinic or on delivery.');
          return;
        }
        order = (await api(`/shop/orders/${order.id}/verify`, { method: 'POST', body: result })).order;
      }
      setDone(order);
      clear();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (ex) {
      setErrors(fieldErrors(ex));
      setError(ex.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="contain narrow center fade-in" style={{ padding: '72px 16px' }}>
        <div className="success-ring"><Check size={38} /></div>
        <h1 className="big-statement mt-24" style={{ fontSize: 'clamp(36px, 5vw, 56px)' }}>Thank <em>you.</em></h1>
        <p className="sub">Order <b>{done.number}</b> is placed.</p>
        <div className="card mt-32" style={{ textAlign: 'left' }}>
          {done.items.map((i) => <div key={i.product_id} className="row between summary-line"><span>{i.name} × {i.qty}</span><b>{inr(i.price * i.qty)}</b></div>)}
          {done.delivery_fee > 0 && <div className="row between summary-line"><span>Delivery</span><b>{inr(done.delivery_fee)}</b></div>}
          <div className="row between summary-line"><span className="strong">Total</span><b className="serif-num">{inr(done.total)}</b></div>
        </div>
        {done.payment_status === 'paid' && <div className="paid-note mt-24"><Lock size={16} />Paid online · {inr(done.total)}</div>}
        <p className="muted mt-16">
          {done.fulfilment === 'delivery'
            ? `We’ll call you to confirm, then deliver.${done.payment_status === 'paid' ? '' : ' Pay on delivery.'}`
            : `We’ll let you know when it’s ready to collect.${done.payment_status === 'paid' ? '' : ' Pay at the clinic.'}`}
        </p>
        <div className="row wrap mt-24" style={{ justifyContent: 'center', gap: 12 }}>
          <Link to="/shop" className="btn">Keep shopping</Link>
          {patient && <Link to="/portal/orders" className="btn primary">My orders</Link>}
        </div>
      </div>
    );
  }

  if (!items.length) {
    return <div className="contain narrow" style={{ padding: '72px 16px' }}><Empty icon={ShoppingBag} title="Your bag is empty" action={<Link to="/shop" className="btn primary">Browse the shop</Link>} /></div>;
  }

  return (
    <div className="contain checkout fade-in">
      <button className="caps-link" onClick={() => setOpen(true)}><ArrowLeft size={14} />Back to bag</button>
      <h1 className="big-statement mt-16" style={{ fontSize: 'clamp(36px, 5vw, 60px)' }}>Checkout</h1>
      <form className="checkout-grid mt-32" onSubmit={submit}>
        <div className="stack gap-24">
          <div className="card stack gap-16">
            <div className="card-title">How would you like it?</div>
            <div className="grid g-2" style={{ gap: 12 }}>
              <button type="button" className={`concern-card ${f.fulfilment === 'pickup' ? 'on' : ''}`} onClick={() => setF({ ...f, fulfilment: 'pickup' })}>
                <Store size={22} color="var(--brand)" /><b>Pick up at the clinic</b><span className="small muted">Free</span>
              </button>
              <button type="button" disabled={!delivery.enabled} className={`concern-card ${f.fulfilment === 'delivery' ? 'on' : ''}`} onClick={() => setF({ ...f, fulfilment: 'delivery' })}>
                <Truck size={22} color="var(--brand)" /><b>Deliver to me</b>
                <span className="small muted">{delivery.enabled ? `${delivery.fee ? inr(delivery.fee) : 'Free'}${delivery.freeOver ? ` · free over ${inr(delivery.freeOver)}` : ''}` : 'Not available right now'}</span>
              </button>
            </div>
          </div>
          {online && (
            <div className="card stack gap-16">
              <div className="card-title">Payment</div>
              <div className="grid g-2" style={{ gap: 12 }}>
                <button type="button" className={`concern-card ${f.payment === 'online' ? 'on' : ''}`} onClick={() => setF({ ...f, payment: 'online' })}>
                  <CreditCard size={22} color="var(--brand)" /><b>Pay online</b><span className="small muted">UPI, cards, netbanking · secured by Razorpay</span>
                </button>
                <button type="button" className={`concern-card ${f.payment === 'offline' ? 'on' : ''}`} onClick={() => setF({ ...f, payment: 'offline' })}>
                  <Wallet size={22} color="var(--brand)" /><b>{f.fulfilment === 'delivery' ? 'Cash on delivery' : 'Pay at the clinic'}</b><span className="small muted">{f.fulfilment === 'delivery' ? 'Cash or UPI to the delivery person' : 'When you collect'}</span>
                </button>
              </div>
            </div>
          )}
          <div className="card stack gap-16">
            <div className="card-title">Your details</div>
            <div className="grid g-2">
              <Field label="Name" error={errors.name}><input className="input" value={f.name} onChange={set('name')} autoComplete="name" required /></Field>
              <Field label="Phone" error={errors.phone}><input className="input" type="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" required /></Field>
            </div>
            <Field label="Email (optional)" hint="For your order confirmation" error={errors.email}><input className="input" type="email" value={f.email} onChange={set('email')} autoComplete="email" /></Field>
            {f.fulfilment === 'delivery' && (
              <>
                <Field label="Address" error={errors.address}><textarea className="input" rows={2} value={f.address} onChange={set('address')} autoComplete="street-address" /></Field>
                <div className="grid g-2">
                  <Field label="City" error={errors.city}><input className="input" value={f.city} onChange={set('city')} autoComplete="address-level2" /></Field>
                  <Field label="PIN code" error={errors.pincode}><input className="input" inputMode="numeric" maxLength={6} value={f.pincode} onChange={set('pincode')} autoComplete="postal-code" /></Field>
                </div>
              </>
            )}
            <Field label="Note (optional)"><input className="input" value={f.notes} onChange={set('notes')} placeholder="Anything we should know" /></Field>
          </div>
        </div>
        <div className="card order-summary">
          <div className="card-title">Order summary</div>
          <div className="mt-12">
            {items.map((i) => (
              <div key={i.id} className="row summary-line" style={{ alignItems: 'center' }}>
                <ProductImage product={i} className="thumb sm" />
                <div className="grow"><div className="small strong">{i.name}</div><div className="tiny muted">Qty {i.qty}</div></div>
                <b className="small">{inr(i.price * i.qty)}</b>
              </div>
            ))}
          </div>
          <div className="divider" />
          <div className="row between small"><span>Subtotal</span><span>{inr(subtotal)}</span></div>
          <div className="row between small mt-8"><span>Delivery</span><span>{f.fulfilment === 'pickup' ? 'Pick up' : fee ? inr(fee) : 'Free'}</span></div>
          <div className="row between mt-16"><span className="strong">Total</span><b className="serif-num" style={{ fontSize: 26 }}>{inr(subtotal + fee)}</b></div>
          {error && !Object.keys(errors).length && <div className="notice red small mt-16">{error}</div>}
          <Button className="primary lg block mt-24" loading={busy}>{payment === 'online' ? <><Lock size={16} />Pay {inr(subtotal + fee)}</> : 'Place order'}</Button>
          <p className="tiny muted mt-12 center">
            {payment === 'online' ? 'You’ll pay on Razorpay’s secure window. We never see your card or UPI details.'
              : f.fulfilment === 'delivery' ? 'Pay in cash or UPI on delivery.' : 'Pay at the clinic when you collect.'}
          </p>
        </div>
      </form>
    </div>
  );
}
