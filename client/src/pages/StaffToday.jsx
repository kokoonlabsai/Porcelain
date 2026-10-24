import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ChevronDown, Plus, BellRing, MessageCircle, Phone, CalendarDays, MoreHorizontal } from 'lucide-react';
import { api } from '../lib/api';
import { useApp, useLoad } from '../lib/store';
import {
  todayISO, addDays, fmtDateLong, fmtTime, fmtDate, concernLabel, relDay, displayPhone, whatsappLink, CONCERNS, firstName, greeting, parseISO,
} from '../lib/format';
import { Button, Field, Modal, StatusBadge, Empty, ErrorBox, Skeleton, fieldErrors } from '../components/ui';

export function StaffToday() {
  const { user, settings } = useApp();
  const dash = useLoad(() => api('/staff/dashboard'), []);
  const d = dash.data;
  return (
    <div className="page fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow">{fmtDateLong(todayISO())}</div>
          <h1 className="mt-4">{greeting()}, {firstName(user.name)}</h1>
        </div>
        {d && (
          <div className="day-summary">
            <span><b>{d.today.checked_in}</b> waiting</span>
            <span><b>{d.today.waiting}</b> to come</span>
            <span><b>{d.today.completed}</b> seen</span>
            <Link to="/staff/pharmacy"><b>{d.pharmacy_pending}</b> at pharmacy</Link>
            {d.fees_today?.total > 0 && <span><b>₹{d.fees_today.total.toLocaleString('en-IN')}</b> fees today</span>}
          </div>
        )}
      </div>
      {dash.error && <ErrorBox error={dash.error} onRetry={dash.reload} />}
      <div className="grid g-side">
        <div><DayAppointments onChange={dash.reload} /></div>
        <div className="card">
          <div className="card-title row gap-6"><BellRing size={18} color="var(--clay)" />Follow-ups due</div>
          <p className="small muted mt-4">Not booked yet · next 7 days</p>
          {!d ? <Skeleton h={120} style={{ marginTop: 12 }} /> : !d.follow_ups.length ? (
            <Empty icon={BellRing} title="All caught up" />
          ) : (
            <div className="list mt-8">
              {d.follow_ups.map((f) => (
                <div key={f.visit_id} className="list-item">
                  <div className="grow">
                    <Link to={`/staff/patients/${f.patient_id}`} className="strong small">{f.name}</Link>
                    <div className="tiny muted">Due {relDay(f.follow_up_date).toLowerCase()}</div>
                  </div>
                  <a className="btn sm icon ghost" href={`tel:${f.phone}`} title="Call"><Phone size={16} /></a>
                  <a className="btn sm icon ghost" target="_blank" rel="noreferrer" title="WhatsApp"
                    href={whatsappLink(f.phone, `Hi ${firstName(f.name)}, this is ${settings.clinic_name}. Your follow-up visit is due around ${fmtDate(f.follow_up_date)}. Would you like us to book a slot for you?`)}>
                    <MessageCircle size={16} />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Waiting room first, then the rest of the day; seen and cancelled patients fold away. */
const GROUPS = [
  { id: 'waiting', label: 'Waiting', match: (a) => a.status === 'checked_in' },
  { id: 'upcoming', label: 'Upcoming', match: (a) => a.status === 'booked' },
  { id: 'seen', label: 'Seen', match: (a) => a.status === 'completed', folded: true },
  { id: 'deposit', label: 'Awaiting deposit', match: (a) => a.status === 'pending_payment', folded: true },
  { id: 'missed', label: 'Cancelled & no-shows', match: (a) => ['cancelled', 'no_show'].includes(a.status), folded: true },
];

/** One day's appointments with date navigation and status actions. */
export function DayAppointments({ onChange, initialDate }) {
  const [date, setDate] = useState(initialDate || todayISO());
  const [booking, setBooking] = useState(false);
  const [open, setOpen] = useState({});
  const { data, error, loading, reload } = useLoad(() => api('/staff/appointments', { query: { date } }), [date]);
  const changed = () => { reload(); onChange?.(); };
  const list = data?.appointments || [];
  const dayName = relDay(date) === fmtDate(date) ? parseISO(date).toLocaleDateString('en-IN', { weekday: 'long' }) : relDay(date);
  return (
    <div className="card">
      <div className="row between">
        <div className="day-nav">
          <button className="btn sm icon ghost" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day"><ChevronLeft size={18} /></button>
          <button type="button" className="day-label" title="Pick a date" onClick={(e) => { const i = e.currentTarget.querySelector('input'); try { i.showPicker(); } catch { i.focus(); } }}>
            <span className="card-title">{dayName}</span>
            <span className="tiny muted">{fmtDate(date, { weekday: 'short' })}</span>
            <input type="date" tabIndex={-1} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Pick a date" />
          </button>
          <button className="btn sm icon ghost" onClick={() => setDate(addDays(date, 1))} aria-label="Next day"><ChevronRight size={18} /></button>
          {date !== todayISO() && <button className="link small" onClick={() => setDate(todayISO())}>Today</button>}
        </div>
        <Button className="primary sm" onClick={() => setBooking(true)}><Plus size={16} />Walk-in</Button>
      </div>
      <div className="mt-16">
        {error ? <ErrorBox error={error} onRetry={reload} /> : loading ? (
          <div className="stack">{[0, 1, 2].map((i) => <Skeleton key={i} h={64} />)}</div>
        ) : !list.length ? (
          <Empty icon={CalendarDays} title="No appointments">Nobody is booked for this day yet.</Empty>
        ) : GROUPS.map((g) => {
          const rows = list.filter(g.match);
          if (!rows.length) return null;
          const shown = !g.folded || open[g.id];
          return (
            <div key={g.id} className="appt-group">
              <button className="appt-group-head" onClick={() => g.folded && setOpen({ ...open, [g.id]: !open[g.id] })} disabled={!g.folded}>
                <span>{g.label}</span><span className="count">{rows.length}</span>
                {g.folded && <ChevronDown size={16} style={{ transform: shown ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />}
              </button>
              {shown && rows.map((a) => <AppointmentRow key={a.id} a={a} onChange={changed} />)}
            </div>
          );
        })}
      </div>
      {booking && <BookingModal date={date} onClose={() => setBooking(false)} onDone={() => { setBooking(false); changed(); }} />}
    </div>
  );
}

export function AppointmentRow({ a, onChange }) {
  const { user, toast } = useApp();
  const nav = useNavigate();
  const [menu, setMenu] = useState(false);
  const clinician = user.role === 'doctor' || user.role === 'admin';
  const active = ['booked', 'checked_in'].includes(a.status);
  const paidDeposit = a.deposit?.status === 'paid' ? a.deposit.amount : 0;
  const setStatus = async (status) => {
    setMenu(false);
    let body = { status };
    if (paidDeposit && status === 'cancelled') {
      // Clinic-side cancel: refund by default; keep it if the patient cancelled late.
      const refund = window.confirm(`Refund the ₹${paidDeposit.toLocaleString('en-IN')} deposit to ${firstName(a.name)}?\n\nOK = cancel and refund · Cancel = cancel and keep the deposit`);
      body = { status, refund_deposit: refund };
    }
    if (paidDeposit && status === 'no_show' && !window.confirm(`Mark as no-show? The ₹${paidDeposit.toLocaleString('en-IN')} deposit is kept.`)) return;
    try {
      await api(`/staff/appointments/${a.id}`, { method: 'PATCH', body });
      onChange();
    } catch (e) { toast(e.message, 'err'); }
  };
  const fee = a.fee && a.fee.status !== 'none' && (a.fee.status === 'paid' || !['cancelled', 'no_show'].includes(a.status)) ? a.fee : null;
  const feeAction = async (action, method) => {
    setMenu(false);
    if (action === 'waive' && !window.confirm(`Waive the ₹${fee.amount.toLocaleString('en-IN')} consultation fee for ${firstName(a.name)}?`)) return;
    try {
      await api(`/staff/appointments/${a.id}/fee`, { method: 'POST', body: { action, method } });
      if (action === 'collect') toast(`₹${fee.amount.toLocaleString('en-IN')} fee recorded`);
      onChange();
    } catch (e) { toast(e.message, 'err'); }
  };
  const consult = () => nav(`/staff/visits/new?patient=${a.patient_id}&appointment=${a.id}`);

  // One clear action per row: doctors consult, reception checks people in.
  let action = null;
  if (a.status === 'pending_payment') action = <span className="tiny muted">Paying…</span>;
  else if (a.visit_id) action = <button className="link small" onClick={() => nav(`/staff/visits/${a.visit_id}`)}>View</button>;
  else if (clinician && active) action = <Button className="primary sm" onClick={consult}>Consult</Button>;
  else if (a.status === 'booked') action = <Button className="sm" onClick={() => setStatus('checked_in')}>Check in</Button>;

  const depositText = { paid: 'deposit paid', adjusted: 'deposit adjusted', refunded: 'deposit refunded', forfeited: 'deposit kept', pending: 'deposit pending' }[a.deposit?.status];
  const note = [concernLabel(a.concern), a.visit_count === 0 ? 'First visit' : null, a.description ? `“${a.description}”` : null].filter(Boolean).join(' · ');
  return (
    <div className={`appt-row ${a.status}`}>
      <div className="t">{fmtTime(a.start_time)}</div>
      <div style={{ minWidth: 0 }}>
        <Link to={`/staff/patients/${a.patient_id}`} className="appt-name">{a.name}</Link>
        <div className="appt-note">{note}</div>
        {fee && <FeeChip fee={fee} onCollect={(m) => feeAction('collect', m)} />}
        {depositText && <div className={`appt-deposit ${a.deposit.status}`}>₹{a.deposit.amount.toLocaleString('en-IN')} {depositText}{a.deposit.status === 'paid' && ['checked_in', 'booked'].includes(a.status) ? ' — adjust against the bill' : ''}</div>}
      </div>
      <div className="row acts gap-6" style={{ justifyContent: 'flex-end', position: 'relative' }}>
        {action}
        <button className="btn sm icon ghost" onClick={() => setMenu(!menu)} aria-label="More"><MoreHorizontal size={18} /></button>
        {menu && (
          <div className="suggest appt-menu" onMouseLeave={() => setMenu(false)}>
            <div className="appt-menu-info">
              <div className="strong small">{displayPhone(a.phone)}</div>
              <div className="tiny muted">{a.source === 'online' ? 'Booked online' : a.source === 'phone' ? 'Booked by phone' : 'Walk-in'} · <StatusBadge status={a.status} /></div>
            </div>
            <a href={`tel:${a.phone}`}>Call {firstName(a.name)}</a>
            {clinician && a.status === 'booked' && <button onClick={() => setStatus('checked_in')}>Check in</button>}
            {!clinician && active && !a.visit_id && <button onClick={consult}>Start consultation</button>}
            {clinician && fee && ['due', 'free_followup'].includes(fee.status) && <button onClick={() => feeAction('waive')}>Waive fee</button>}
            {fee && (fee.status === 'waived' || (fee.status === 'paid' && fee.method !== 'deposit')) && <button onClick={() => feeAction('undo')}>Undo fee {fee.status === 'paid' ? 'payment' : 'waiver'}</button>}
            {a.status !== 'booked' && <button onClick={() => setStatus('booked')}>Mark as booked</button>}
            {a.status !== 'completed' && <button onClick={() => setStatus('completed')}>Mark as seen</button>}
            {a.status !== 'no_show' && <button onClick={() => setStatus('no_show')}>No-show</button>}
            {a.status !== 'cancelled' && <button style={{ color: 'var(--red)' }} onClick={() => setStatus('cancelled')}>Cancel appointment</button>}
          </div>
        )}
      </div>
    </div>
  );
}

const METHOD_LABEL = { cash: 'cash', upi: 'UPI', card: 'card', deposit: 'deposit', online: 'online', other: 'other' };

/** The consultation fee on an appointment row; a due fee opens Cash / UPI / Card to record it. */
function FeeChip({ fee, onCollect }) {
  const [open, setOpen] = useState(false);
  const amount = `₹${(fee.amount || 0).toLocaleString('en-IN')}`;
  if (fee.status === 'paid') return <div className="appt-fee paid">{amount} fee paid · {METHOD_LABEL[fee.method] || fee.method}</div>;
  if (fee.status === 'waived') return <div className="appt-fee muted">Fee waived</div>;
  if (fee.status === 'free_followup') return <div className="appt-fee muted">Free follow-up · until {fmtDate(fee.free_until)}</div>;
  if (!open) return <button className="appt-fee due" onClick={() => setOpen(true)}>{amount} fee due · Collect</button>;
  return (
    <div className="appt-fee-pick">
      <span className="tiny muted strong">{amount} paid by</span>
      {['cash', 'upi', 'card'].map((m) => <button key={m} className="btn sm" onClick={() => { setOpen(false); onCollect(m); }}>{METHOD_LABEL[m][0].toUpperCase() + METHOD_LABEL[m].slice(1)}</button>)}
      <button className="link tiny" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}

/** Reception/doctor booking for a phone call or walk-in. Past and short-notice slots are allowed. */
export function BookingModal({ date: initialDate, patient, onClose, onDone }) {
  const { toast } = useApp();
  const [f, setF] = useState({ name: patient?.name || '', phone: patient?.phone || '', email: patient?.email || '', concern: 'skin', description: '', source: 'walk_in', check_in: true });
  const [date, setDate] = useState(initialDate || todayISO());
  const [slots, setSlots] = useState(null);
  const [time, setTime] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    setSlots(null);
    setTime('');
    api('/slots', { query: { date, staff: 1 } }).then(({ slots }) => {
      setSlots(slots);
      const next = slots.find((s) => s.available && !s.past) || slots.find((s) => s.available);
      if (next) setTime(next.start);
    }).catch(() => setSlots([]));
  }, [date]);

  // Existing patients as you type a name or number.
  useEffect(() => {
    if (patient) return;
    const q = f.phone.replace(/\D/g, '').length >= 4 ? f.phone : f.name.length >= 2 ? f.name : '';
    if (!q) { setMatches([]); return; }
    const t = setTimeout(() => api('/staff/patients', { query: { q } }).then((r) => setMatches(r.patients.slice(0, 4))).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [f.name, f.phone, patient]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setError('');
    try {
      await api('/staff/appointments', { method: 'POST', body: { ...f, date, start_time: time, check_in: f.source === 'walk_in' && date === todayISO() && f.check_in } });
      toast('Appointment booked');
      onDone();
    } catch (ex) {
      setErrors(fieldErrors(ex));
      setError(ex.message);
    } finally {
      setBusy(false);
    }
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <Modal title="Book an appointment" onClose={onClose} wide>
      <form className="stack gap-16" onSubmit={submit}>
        <div className="chips">
          {[['walk_in', 'Walk-in'], ['phone', 'Phone booking']].map(([k, l]) => (
            <button type="button" key={k} className={`chip ${f.source === k ? 'on' : ''}`} onClick={() => setF({ ...f, source: k })}>{l}</button>
          ))}
        </div>
        <div className="grid g-2">
          <Field label="Phone number" error={errors.phone}><input className="input" type="tel" value={f.phone} onChange={set('phone')} disabled={!!patient} required autoFocus={!patient} /></Field>
          <Field label="Name" error={errors.name}><input className="input" value={f.name} onChange={set('name')} disabled={!!patient} required /></Field>
        </div>
        {matches.length > 0 && !patient && (
          <div className="chips">
            <span className="tiny muted strong" style={{ alignSelf: 'center' }}>Existing:</span>
            {matches.map((m) => (
              <button type="button" key={m.id} className="chip" onClick={() => { setF({ ...f, name: m.name, phone: m.phone, email: m.email || f.email }); setMatches([]); }}>
                {m.name} · {displayPhone(m.phone)}
              </button>
            ))}
          </div>
        )}
        <div className="grid g-2">
          <Field label="Email (optional)" error={errors.email}><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
          <Field label="Coming in for">
            <select className="input" value={f.concern} onChange={set('concern')}>{CONCERNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
          </Field>
        </div>
        <Field label="Notes (optional)"><input className="input" value={f.description} onChange={set('description')} placeholder="What they mentioned" /></Field>
        <div className="grid g-2">
          <Field label="Date"><input className="input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field>
          <Field label="Time" error={errors.start_time}>
            <select className="input" value={time} onChange={(e) => setTime(e.target.value)} required>
              {!slots ? <option>Loading…</option> : !slots.length ? <option value="">Clinic closed this day</option> : slots.map((s) => (
                <option key={s.start} value={s.start} disabled={!s.available}>{fmtTime(s.start)}{!s.available ? ' — full' : s.capacity > 1 ? ` — ${s.remaining} left` : ''}{s.past ? ' (past)' : ''}</option>
              ))}
            </select>
          </Field>
        </div>
        {f.source === 'walk_in' && date === todayISO() && (
          <label className="check"><input type="checkbox" checked={f.check_in} onChange={(e) => setF({ ...f, check_in: e.target.checked })} />They’re here now — check them in</label>
        )}
        {error && !Object.keys(errors).length && <div className="notice red small">{error}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button type="button" className="ghost" onClick={onClose}>Cancel</Button>
          <Button className="primary" loading={busy} disabled={!time}>Book</Button>
        </div>
      </form>
    </Modal>
  );
}

export function StaffAppointments() {
  return (
    <div className="page fade-in">
      <div className="page-head"><h1>Appointments</h1></div>
      <DayAppointments />
    </div>
  );
}
