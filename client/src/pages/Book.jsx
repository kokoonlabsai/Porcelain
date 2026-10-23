import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, CalendarPlus, MapPin, MessageCircle, Clock, UserRound, Phone, Mail, Sun, Sunset, Moon, CalendarX } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../lib/store';
import { CONCERNS, concernLabel, fmtDateLong, fmtTime, parseISO, downloadIcs, displayPhone } from '../lib/format';
import { Button, ConcernIcon, Field, Skeleton, Empty, fieldErrors } from '../components/ui';

const PERIODS = [
  { id: 'morning', label: 'Morning', icon: Sun, test: (t) => t < '12:00' },
  { id: 'afternoon', label: 'Afternoon', icon: Sunset, test: (t) => t >= '12:00' && t < '17:00' },
  { id: 'evening', label: 'Evening', icon: Moon, test: (t) => t >= '17:00' },
];

export default function Book({ inPortal = false }) {
  const { user, login, settings, isStaff } = useApp();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const patient = user && !isStaff ? user : null;

  const [step, setStep] = useState(params.get('concern') ? 1 : 0);
  const [concern, setConcern] = useState(params.get('concern') || '');
  const [description, setDescription] = useState('');
  const [days, setDays] = useState(null);
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState(null);
  const [time, setTime] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', email: patient?.email || '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  useEffect(() => {
    api('/slots/days').then(({ days }) => {
      setDays(days);
      const first = days.find((d) => d.free > 0);
      if (first) setDate(first.date);
    }).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!date) return;
    setSlots(null);
    setTime(null);
    api('/slots', { query: { date } }).then(({ slots }) => setSlots(slots)).catch((e) => setError(e.message));
  }, [date]);

  const grouped = useMemo(() => PERIODS.map((p) => ({ ...p, slots: (slots || []).filter((s) => p.test(s.start)) })).filter((p) => p.slots.length), [slots]);

  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setErrors({});
    setError('');
    try {
      const body = { concern, description, date, start_time: time.start, email: form.email };
      if (!patient) Object.assign(body, { name: form.name, phone: form.phone });
      const res = await api('/appointments', { method: 'POST', body });
      setDone(res);
      setStep(3);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (ex) {
      setErrors(fieldErrors(ex));
      setError(ex.message);
      if (ex.status === 409 && /slot|time/i.test(ex.message)) {
        setStep(1);
        api('/slots', { query: { date } }).then(({ slots }) => setSlots(slots)).catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  };

  const goDetails = () => {
    if (patient) submit();
    else setStep(2);
  };

  const Wrapper = inPortal ? PortalWrap : PublicWrap;

  if (done) {
    return (
      <Wrapper>
        <Success res={done} settings={settings} onLogin={login} inPortal={inPortal} nav={nav} />
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <div className="stepper">{[0, 1, 2].map((i) => <div key={i} className={`s ${step >= i ? 'on' : ''}`} />)}</div>

      {step === 0 && (
        <div className="fade-in">
          <h1 className="serif" style={{ fontSize: 32 }}>What brings you in?</h1>
          <p className="muted mt-8">Pick the closest one — the doctor will take it from there.</p>
          <div className="grid g-2 mt-24">
            {CONCERNS.map((c) => (
              <button key={c.id} type="button" className={`concern-card ${concern === c.id ? 'on' : ''}`} onClick={() => setConcern(c.id)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ConcernIcon concern={c.id} />
                <div className="grow">
                  <h3>{c.label}</h3>
                  <p className="small muted">{c.hint}</p>
                </div>
                {concern === c.id && <Check size={20} color="var(--brand)" />}
              </button>
            ))}
          </div>
          <Field className="mt-24" label="Want to tell us more? (optional)" hint="E.g. “Hair fall for 3 months, worse after a fever” — it helps the doctor prepare.">
            <textarea className="input" value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} placeholder="Describe what you’re facing, how long it’s been, anything you’ve tried…" />
          </Field>
          <div className="row between mt-24">
            <span />
            <Button className="primary lg" disabled={!concern} onClick={() => setStep(1)}>Choose a time <ArrowRight size={18} /></Button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="fade-in">
          <button className="link row gap-4 small" onClick={() => setStep(0)}><ArrowLeft size={15} />{concernLabel(concern)}</button>
          <h1 className="serif mt-12" style={{ fontSize: 32 }}>Pick a day and time</h1>
          {error && <div className="notice clay mt-16">{error}</div>}
          <div className="mt-24">
            {!days ? <Skeleton h={78} /> : (
              <div className="date-strip">
                {days.map((d) => {
                  const dt = parseISO(d.date);
                  const off = d.free === 0;
                  return (
                    <button key={d.date} type="button" disabled={off} className={`date-pill ${date === d.date ? 'on' : ''} ${off ? 'off' : ''}`} onClick={() => setDate(d.date)}>
                      <div className="w">{dt.toLocaleDateString('en-IN', { weekday: 'short' })}</div>
                      <div className="d">{dt.getDate()}</div>
                      <div className="f">{!d.open ? 'Closed' : off ? 'Full' : `${d.free} free`}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {date && <div className="strong mt-16">{fmtDateLong(date)}</div>}
          <div className="mt-16">
            {days && !days.some((d) => d.free > 0) ? (
              <Empty icon={CalendarX} title="No free slots right now">Please call us{settings.phone ? ` on ${settings.phone}` : ''} and we’ll fit you in.</Empty>
            ) : !slots ? (
              <div className="slot-grid">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} h={46} />)}</div>
            ) : !slots.length ? (
              <Empty icon={CalendarX} title="No slots this day">Try another date.</Empty>
            ) : (
              <div className="stack gap-20">
                {grouped.map((g) => (
                  <div key={g.id}>
                    <div className="row gap-6 small strong muted"><g.icon size={16} />{g.label}</div>
                    <div className="slot-grid mt-8">
                      {g.slots.map((s) => (
                        <button key={s.start} type="button" className={`slot ${time?.start === s.start ? 'on' : ''}`} disabled={!s.available} onClick={() => setTime(s)}>
                          {fmtTime(s.start)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="row between mt-32">
            <Button className="ghost" onClick={() => setStep(0)}><ArrowLeft size={18} />Back</Button>
            <Button className="primary lg" disabled={!time} loading={busy && !!patient} onClick={goDetails}>
              {patient ? 'Confirm booking' : 'Continue'} <ArrowRight size={18} />
            </Button>
          </div>
          {patient && (
            <p className="small muted mt-12" style={{ textAlign: 'right' }}>Booking as {patient.name} · {displayPhone(patient.phone)}</p>
          )}
        </div>
      )}

      {step === 2 && !patient && (
        <form className="fade-in" onSubmit={submit}>
          <button type="button" className="link row gap-4 small" onClick={() => setStep(1)}><ArrowLeft size={15} />{fmtDateLong(date)} · {fmtTime(time?.start)}</button>
          <h1 className="serif mt-12" style={{ fontSize: 32 }}>Your details</h1>
          <p className="muted mt-8">Already have an account? <Link className="link" to={`/login?next=${encodeURIComponent('/portal/book')}`}>Log in</Link> to keep everything in one place.</p>
          {error && !Object.keys(errors).length && <div className="notice clay mt-16">{error}</div>}
          <div className="stack gap-16 mt-24">
            <Field label="Full name" error={errors.name}>
              <div className="input-icon"><UserRound size={18} /><input className={`input ${errors.name ? 'bad' : ''}`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" required autoFocus /></div>
            </Field>
            <Field label="Phone number" hint="We’ll use this to find your records — no OTP, no spam." error={errors.phone}>
              <div className="input-icon"><Phone size={18} /><input className={`input ${errors.phone ? 'bad' : ''}`} type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" placeholder="98765 43210" required /></div>
            </Field>
            <Field label="Email (optional)" hint="So we can send your confirmation and prescription." error={errors.email}>
              <div className="input-icon"><Mail size={18} /><input className={`input ${errors.email ? 'bad' : ''}`} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" placeholder="you@example.com" /></div>
            </Field>
          </div>
          <div className="row between mt-32">
            <Button type="button" className="ghost" onClick={() => setStep(1)}><ArrowLeft size={18} />Back</Button>
            <Button className="primary lg" loading={busy}>Confirm booking <Check size={18} /></Button>
          </div>
        </form>
      )}
    </Wrapper>
  );
}

function PublicWrap({ children }) {
  return <div className="contain narrow" style={{ padding: '32px 16px 60px' }}><div className="card" style={{ padding: 'clamp(20px, 4vw, 36px)' }}>{children}</div></div>;
}
function PortalWrap({ children }) {
  return <div className="page narrow"><div className="card" style={{ padding: 'clamp(20px, 4vw, 36px)' }}>{children}</div></div>;
}

function Success({ res, settings, onLogin, inPortal, nav }) {
  const a = res.appointment;
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const claim = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const { token, user } = await api(`/appointments/${a.id}/claim`, { method: 'POST', body: { phone: res.patient.phone, password: pw } });
      onLogin(token, user);
      nav('/portal');
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fade-in center">
      <div className="success-ring"><Check size={38} /></div>
      <h1 className="serif mt-16" style={{ fontSize: 34 }}>You’re booked!</h1>
      <p className="muted mt-8">See you soon, {res.patient.name.split(' ')[0]}.{res.patient.email ? ' A confirmation is on its way to your inbox.' : ''}</p>

      <div className="card flat mt-24" style={{ textAlign: 'left', background: 'var(--surface-2)' }}>
        <div className="summary-line"><Clock size={18} color="var(--brand)" /><div><div className="strong">{fmtDateLong(a.date)}</div><div className="small muted">{fmtTime(a.start_time)} – {fmtTime(a.end_time)}</div></div></div>
        <div className="summary-line"><ConcernIcon concern={a.concern} size={16} box={30} /><div className="strong">{concernLabel(a.concern)}</div></div>
        {settings.address && <div className="summary-line"><MapPin size={18} color="var(--brand)" /><div className="small">{settings.address}{settings.maps_url && <> · <a className="link" href={settings.maps_url} target="_blank" rel="noreferrer">Directions</a></>}</div></div>}
      </div>

      <div className="row wrap mt-16" style={{ justifyContent: 'center' }}>
        <Button onClick={() => downloadIcs({ title: `Appointment at ${settings.clinic_name}`, date: a.date, start: a.start_time, end: a.end_time, location: settings.address })}>
          <CalendarPlus size={17} />Add to calendar
        </Button>
        {settings.whatsapp && (
          <a className="btn" target="_blank" rel="noreferrer" href={`https://wa.me/${settings.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi, I've booked an appointment on ${fmtDateLong(a.date)} at ${fmtTime(a.start_time)}.`)}`}>
            <MessageCircle size={17} />WhatsApp the clinic
          </a>
        )}
      </div>

      {res.can_create_account && (
        <form className="card mt-24" style={{ textAlign: 'left', border: '2px solid var(--brand)' }} onSubmit={claim}>
          <div className="eyebrow">Recommended</div>
          <h2 className="serif mt-8" style={{ fontSize: 24 }}>Save your details in one step</h2>
          <p className="small muted mt-8">Set a password and you’ll be able to see your prescriptions, photos and next visit date on your phone — and book faster next time.</p>
          <div className="stack mt-16">
            <Field error={err}><input className="input" type="password" placeholder="Choose a password (6+ characters)" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
            <Button className="primary" loading={busy} disabled={pw.length < 6}>Create my account</Button>
          </div>
        </form>
      )}
      {!res.can_create_account && !inPortal && !res.has_account && (
        <p className="small muted mt-24">The clinic already has your records — ask the reception for your portal login when you visit.</p>
      )}
      {res.has_account && !inPortal && <p className="small mt-24"><Link className="link" to="/login">Log in</Link> to see this booking in your portal.</p>}
      {inPortal && <div className="mt-24"><Link className="btn primary" to="/portal">Back to home</Link></div>}
    </div>
  );
}
