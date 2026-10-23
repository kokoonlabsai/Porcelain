import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarPlus, ChevronLeft, ChevronRight, Pill, Users, UserCheck, Stethoscope, BellRing, MessageCircle, Phone, CalendarDays, FileText, MoreHorizontal } from 'lucide-react';
import { api } from '../lib/api';
import { useApp, useLoad } from '../lib/store';
import {
  todayISO, addDays, fmtDateLong, fmtTime, fmtDate, concernLabel, relDay, displayPhone, whatsappLink, CONCERNS, firstName, greeting, parseISO,
} from '../lib/format';
import { Button, Field, Modal, StatusBadge, Empty, ErrorBox, Skeleton, ConcernIcon, fieldErrors } from '../components/ui';

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
      </div>
      {dash.error ? <ErrorBox error={dash.error} onRetry={dash.reload} /> : (
        <div className="grid g-4 keep-2">
          <Stat icon={CalendarDays} label="Today’s appointments" value={d?.today.total} />
          <Stat icon={Users} label="Waiting / checked in" value={d ? `${d.today.waiting} / ${d.today.checked_in}` : null} />
          <Stat icon={Stethoscope} label="Seen today" value={d?.today.completed} />
          <Link to="/staff/pharmacy"><Stat icon={Pill} label="Prescriptions to hand over" value={d?.pharmacy_pending} accent /></Link>
        </div>
      )}
      <div className="grid g-side mt-24">
        <div><DayAppointments onChange={dash.reload} /></div>
        <div className="card">
          <div className="row between">
            <div className="card-title row gap-6"><BellRing size={18} color="var(--clay)" />Follow-ups due</div>
            <span className="tiny muted">next 7 days & overdue</span>
          </div>
          <p className="small muted mt-4">Patients who haven’t booked their next visit yet.</p>
          {!d ? <Skeleton h={120} style={{ marginTop: 12 }} /> : !d.follow_ups.length ? (
            <Empty icon={BellRing} title="All caught up">No pending follow-ups this week.</Empty>
          ) : (
            <div className="list mt-8">
              {d.follow_ups.map((f) => (
                <div key={f.visit_id} className="list-item">
                  <div className="grow">
                    <Link to={`/staff/patients/${f.patient_id}`} className="strong small">{f.name}</Link>
                    <div className="tiny muted">{f.diagnosis ? `${f.diagnosis} · ` : ''}due {relDay(f.follow_up_date).toLowerCase()}</div>
                  </div>
                  <a className="btn sm icon" href={`tel:${f.phone}`} title="Call"><Phone size={15} /></a>
                  <a className="btn sm icon" target="_blank" rel="noreferrer" title="WhatsApp"
                    href={whatsappLink(f.phone, `Hi ${firstName(f.name)}, this is ${settings.clinic_name}. Your follow-up visit is due around ${fmtDate(f.follow_up_date)}. Would you like us to book a slot for you?`)}>
                    <MessageCircle size={15} />
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

function Stat({ icon: Icon, label, value, accent }) {
  return (
    <div className="card stat" style={accent ? { background: 'var(--clay-soft)', borderColor: 'transparent' } : undefined}>
      <div className="row between"><span className="l">{label}</span><Icon size={18} color={accent ? 'var(--clay)' : 'var(--brand)'} /></div>
      <div className="v">{value ?? <Skeleton h={30} w={60} />}</div>
    </div>
  );
}

/** One day's appointments with date navigation and status actions. */
export function DayAppointments({ onChange, initialDate }) {
  const [date, setDate] = useState(initialDate || todayISO());
  const [booking, setBooking] = useState(false);
  const { data, error, loading, reload } = useLoad(() => api('/staff/appointments', { query: { date } }), [date]);
  const changed = () => { reload(); onChange?.(); };
  const list = data?.appointments || [];
  const active = list.filter((a) => !['cancelled', 'no_show'].includes(a.status));
  const inactive = list.filter((a) => ['cancelled', 'no_show'].includes(a.status));
  return (
    <div className="card">
      <div className="row between wrap">
        <div className="row gap-6">
          <button className="btn sm icon" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day"><ChevronLeft size={17} /></button>
          <div style={{ minWidth: 150 }}>
            <div className="card-title">{relDay(date) === fmtDate(date) ? parseISO(date).toLocaleDateString('en-IN', { weekday: 'long' }) : relDay(date)}</div>
            <div className="tiny muted">{fmtDateLong(date)}</div>
          </div>
          <button className="btn sm icon" onClick={() => setDate(addDays(date, 1))} aria-label="Next day"><ChevronRight size={17} /></button>
          {date !== todayISO() && <button className="link small" onClick={() => setDate(todayISO())}>Today</button>}
          <input type="date" className="input sm hide-sm" style={{ width: 150 }} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </div>
        <Button className="primary sm" onClick={() => setBooking(true)}><CalendarPlus size={16} />Book / walk-in</Button>
      </div>
      <div className="mt-16">
        {error ? <ErrorBox error={error} onRetry={reload} /> : loading ? (
          <div className="stack">{[0, 1, 2].map((i) => <Skeleton key={i} h={70} />)}</div>
        ) : !list.length ? (
          <Empty icon={CalendarDays} title="No appointments">Nobody is booked for this day yet.</Empty>
        ) : (
          <>
            {active.map((a) => <AppointmentRow key={a.id} a={a} onChange={changed} />)}
            {inactive.length > 0 && <div className="tiny muted strong mt-16 mb-8" style={{ marginBottom: 8 }}>CANCELLED & NO-SHOWS</div>}
            {inactive.map((a) => <AppointmentRow key={a.id} a={a} onChange={changed} />)}
          </>
        )}
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
  const setStatus = async (status) => {
    setMenu(false);
    try {
      await api(`/staff/appointments/${a.id}`, { method: 'PATCH', body: { status } });
      onChange();
    } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <div className={`appt-row ${a.status}`}>
      <div>
        <div className="t">{fmtTime(a.start_time)}</div>
        <div className="tiny muted">{a.source === 'online' ? 'Online' : a.source === 'phone' ? 'Phone' : 'Walk-in'}</div>
      </div>
      <div className="row" style={{ minWidth: 0 }}>
        <ConcernIcon concern={a.concern} size={17} box={36} />
        <div className="grow">
          <div className="row gap-6 wrap">
            <Link to={`/staff/patients/${a.patient_id}`} className="strong">{a.name}</Link>
            <StatusBadge status={a.status} />
            {a.visit_count === 0 && <span className="badge brand">New</span>}
          </div>
          <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {concernLabel(a.concern)} · {displayPhone(a.phone)}{a.description ? ` · “${a.description}”` : ''}
          </div>
        </div>
      </div>
      <div className="row acts gap-6" style={{ justifyContent: 'flex-end', position: 'relative' }}>
        {a.status === 'booked' && <Button className="sm" onClick={() => setStatus('checked_in')}><UserCheck size={15} />Check in</Button>}
        {a.visit_id ? (
          <Button className="sm" onClick={() => nav(`/staff/visits/${a.visit_id}`)}><FileText size={15} />Prescription</Button>
        ) : clinician && ['booked', 'checked_in'].includes(a.status) ? (
          <Button className="primary sm" onClick={() => nav(`/staff/visits/new?patient=${a.patient_id}&appointment=${a.id}`)}><Stethoscope size={15} />Consult</Button>
        ) : null}
        <button className="btn sm icon ghost" onClick={() => setMenu(!menu)} aria-label="More"><MoreHorizontal size={17} /></button>
        {menu && (
          <div className="suggest" style={{ left: 'auto', width: 190 }} onMouseLeave={() => setMenu(false)}>
            {a.status !== 'booked' && <button onClick={() => setStatus('booked')}>Mark as booked</button>}
            {a.status !== 'completed' && <button onClick={() => setStatus('completed')}>Mark as seen</button>}
            {a.status !== 'no_show' && <button onClick={() => setStatus('no_show')}>No-show</button>}
            {a.status !== 'cancelled' && <button style={{ color: 'var(--red)' }} onClick={() => setStatus('cancelled')}>Cancel appointment</button>}
            <a href={`tel:${a.phone}`} style={{ display: 'block', padding: '9px 12px' }}>Call {firstName(a.name)}</a>
          </div>
        )}
      </div>
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
