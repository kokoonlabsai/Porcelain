import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CalendarPlus, BellRing, Pill, CheckCircle2, ClipboardList, ArrowRight, Printer, CalendarDays, Stethoscope, Images, MapPin, Clock, Mail,
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp, useLoad } from '../lib/store';
import {
  greeting, firstName, fmtDate, fmtDateLong, fmtTime, relDay, concernLabel, parseISO, daysBetween, todayISO, downloadIcs, displayPhone,
} from '../lib/format';
import { Button, ConcernIcon, Empty, ErrorBox, PageSkeleton, StatusBadge, PhotoGrid, Field, Badge, Modal } from '../components/ui';
import { ArticleCard } from './Home';

function CalTile({ date }) {
  const d = parseISO(date);
  return (
    <div className="cal-tile">
      <div className="m">{d.toLocaleDateString('en-IN', { month: 'short' })}</div>
      <div className="d">{d.getDate()}</div>
    </div>
  );
}

export function Medicines({ items, showStatus = true }) {
  return (
    <div>
      {items.map((i) => (
        <div key={i.id} className={`rx-item ${i.dispensed ? 'done' : ''}`}>
          <span className="rx-ico">{i.dispensed ? <CheckCircle2 size={19} /> : <Pill size={19} />}</span>
          <div className="grow">
            <div className="row between top">
              <div className="strong">{i.medicine}{i.kind && <span className="muted" style={{ fontWeight: 500 }}> · {i.kind}</span>}</div>
              {showStatus && (i.dispensed ? <Badge tone="green">Collected</Badge> : <Badge tone="clay">To collect</Badge>)}
            </div>
            <div className="small" style={{ color: 'var(--ink-2)' }}>{[i.dosage, i.frequency, i.duration].filter(Boolean).join(' · ')}</div>
            {i.instructions && <div className="small muted mt-4">{i.instructions}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function FollowUpBanner({ f }) {
  if (!f || f.booked) return null;
  const n = daysBetween(todayISO(), f.date);
  const soon = n <= 7;
  return (
    <div className={`notice ${f.overdue ? 'clay' : soon ? 'sun' : ''} mt-16`} style={{ alignItems: 'center' }}>
      <BellRing size={20} />
      <div className="grow">
        <div className="strong">{f.overdue ? 'Your follow-up is overdue' : `Follow-up ${relDay(f.date).toLowerCase()}`}</div>
        <div className="small" style={{ fontWeight: 500 }}>The doctor asked to see you again around {fmtDateLong(f.date)}.</div>
      </div>
      <Link className="btn primary sm" to="/portal/book">Book now</Link>
    </div>
  );
}

export function PortalHome() {
  const { user, settings } = useApp();
  const { data, error, loading, reload } = useLoad(() => api('/me/overview'), []);
  if (error) return <div className="page"><ErrorBox error={error} onRetry={reload} /></div>;
  if (loading) return <div className="page"><PageSkeleton /></div>;
  const next = data.upcoming[0];
  const v = data.latest_visit;
  const firstTime = !next && !v;

  return (
    <div className="page fade-in">
      <div className="hello">
        <div className="small" style={{ opacity: 0.85, fontWeight: 600 }}>{greeting()}</div>
        <h1 className="mt-4">{firstName(user.name)}</h1>
        <p className="mt-8" style={{ opacity: 0.85, maxWidth: 520 }}>
          {firstTime ? `Welcome to ${settings.clinic_name}. Book your first visit and your prescriptions will appear here.`
            : next ? `Your next visit is ${relDay(next.date).toLowerCase()} at ${fmtTime(next.start_time)}.`
            : data.pending_medicines ? `You have ${data.pending_medicines} medicine${data.pending_medicines > 1 ? 's' : ''} to collect from the pharmacy desk.`
            : 'Everything from your visits lives here.'}
        </p>
        <div className="row wrap mt-16" style={{ position: 'relative', zIndex: 1 }}>
          <Link className="btn" to="/portal/book" style={{ border: 0 }}><CalendarPlus size={17} />Book a visit</Link>
          {v && <Link className="btn ghost" to={`/portal/visits/${v.id}`} style={{ color: '#fff' }}>Latest prescription <ArrowRight size={16} /></Link>}
        </div>
      </div>

      <FollowUpBanner f={data.follow_up} />

      <div className="grid g-side mt-24">
        <div className="stack gap-16">
          {v ? (
            <div className="card">
              <div className="row between">
                <div>
                  <div className="eyebrow">Latest prescription</div>
                  <div className="card-title mt-4">{v.diagnosis || concernLabel(v.concern) || 'Consultation'}</div>
                  <div className="small muted">{fmtDateLong(v.date)}{v.doctor_name ? ` · ${v.doctor_name}` : ''}</div>
                </div>
                <Link className="btn sm" to={`/portal/visits/${v.id}`}>Open</Link>
              </div>
              {v.items.length > 0 ? <div className="mt-8"><Medicines items={v.items} /></div> : <p className="small muted mt-16">No medicines were prescribed at this visit.</p>}
              {v.advice && <div className="notice mt-16"><Stethoscope size={18} /><div className="pre small" style={{ fontWeight: 500 }}>{v.advice}</div></div>}
              {v.items.some((i) => !i.dispensed) && (
                <p className="small muted mt-16">Show this screen or tell your name at the pharmacy desk — they already have your prescription.</p>
              )}
            </div>
          ) : (
            <div className="card">
              <Empty icon={ClipboardList} title="No prescriptions yet">After your visit, the doctor’s prescription and advice will appear here.</Empty>
            </div>
          )}

          {data.reads.length > 0 && (
            <div>
              <div className="row between"><div className="card-title">Worth a read</div><Link className="link small" to="/portal/learn">More</Link></div>
              <div className="grid g-2 mt-12">{data.reads.map((a) => <ArticleCard key={a.slug} a={a} base="/portal/learn" />)}</div>
            </div>
          )}
        </div>

        <div className="stack gap-16">
          <div className="card">
            <div className="card-title">Upcoming</div>
            {data.upcoming.length ? (
              <div className="stack gap-16 mt-16">
                {data.upcoming.map((a) => <UpcomingAppt key={a.id} a={a} onChange={reload} />)}
              </div>
            ) : (
              <div className="mt-12">
                <p className="small muted">Nothing booked.</p>
                <Link className="btn primary block mt-12" to="/portal/book"><CalendarPlus size={17} />Book a visit</Link>
              </div>
            )}
          </div>
          <div className="grid g-2 keep-2">
            <div className="card stat"><div className="l">Visits</div><div className="v">{data.visit_count}</div></div>
            <div className="card stat"><div className="l">To collect</div><div className="v">{data.pending_medicines}</div></div>
          </div>
          {settings.address && (
            <div className="card tight">
              <div className="row top"><MapPin size={18} color="var(--brand)" style={{ marginTop: 2 }} /><div className="small">{settings.address}{settings.maps_url && <div><a className="link" href={settings.maps_url} target="_blank" rel="noreferrer">Get directions</a></div>}</div></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UpcomingAppt({ a, onChange }) {
  const { toast, settings } = useApp();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const cancel = async () => {
    setBusy(true);
    try {
      await api(`/me/appointments/${a.id}/cancel`, { method: 'POST' });
      toast('Appointment cancelled');
      onChange();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };
  return (
    <div className="appt-card">
      <CalTile date={a.date} />
      <div className="grow">
        <div className="strong">{relDay(a.date)} · {fmtTime(a.start_time)}</div>
        <div className="small muted">{concernLabel(a.concern)}</div>
        <div className="row gap-16 mt-4">
          <button className="link small" onClick={() => downloadIcs({ title: `Appointment at ${settings.clinic_name}`, date: a.date, start: a.start_time, end: a.end_time, location: settings.address })}>Add to calendar</button>
          {a.status === 'booked' && <button className="link small" style={{ color: 'var(--red)' }} onClick={() => setConfirm(true)}>Cancel</button>}
        </div>
      </div>
      {confirm && (
        <Modal title="Cancel this appointment?" onClose={() => setConfirm(false)}>
          <p className="muted">{fmtDateLong(a.date)} at {fmtTime(a.start_time)}. The slot will be given to someone else.</p>
          <div className="row mt-24" style={{ justifyContent: 'flex-end' }}>
            <Button className="ghost" onClick={() => setConfirm(false)}>Keep it</Button>
            <Button className="primary" style={{ background: 'var(--red)', borderColor: 'var(--red)' }} loading={busy} onClick={cancel}>Cancel appointment</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function PortalVisits() {
  const { data, error, loading, reload } = useLoad(() => Promise.all([api('/me/visits'), api('/me/photos')]), []);
  if (error) return <div className="page"><ErrorBox error={error} onRetry={reload} /></div>;
  if (loading) return <div className="page"><PageSkeleton /></div>;
  const [{ visits }, { photos }] = data;
  return (
    <div className="page fade-in">
      <div className="page-head"><div><div className="eyebrow">Your record</div><h1 className="mt-4">Prescriptions & visits</h1></div></div>
      {!visits.length ? (
        <div className="card"><Empty icon={ClipboardList} title="No visits yet" action={<Link className="btn primary" to="/portal/book">Book your first visit</Link>}>Your prescriptions and the doctor’s advice will show up here after each visit.</Empty></div>
      ) : (
        <div className="timeline">
          {visits.map((v) => (
            <div key={v.id} className="tl-item">
              <Link to={`/portal/visits/${v.id}`} className="card hover" style={{ display: 'block' }}>
                <div className="row between top">
                  <div className="row">
                    <ConcernIcon concern={v.concern} size={18} box={38} />
                    <div>
                      <div className="strong">{v.diagnosis || concernLabel(v.concern) || 'Consultation'}</div>
                      <div className="small muted">{fmtDateLong(v.date)}{v.doctor_name ? ` · ${v.doctor_name}` : ''}</div>
                    </div>
                  </div>
                  <ArrowRight size={18} color="var(--muted)" />
                </div>
                <div className="row wrap mt-12 gap-6">
                  {v.items.length > 0 && <Badge tone="clay"><Pill size={13} />{v.items.length} medicine{v.items.length > 1 ? 's' : ''}</Badge>}
                  {v.procedure_done && <Badge tone="blue">{v.procedure_done}</Badge>}
                  {v.attachments.length > 0 && <Badge tone="grey"><Images size={13} />{v.attachments.length}</Badge>}
                  {v.follow_up_date && <Badge tone="brand"><CalendarDays size={13} />Follow-up {fmtDate(v.follow_up_date)}</Badge>}
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
      {photos.length > 0 && (
        <div className="card mt-24">
          <div className="card-title">Your photos</div>
          <p className="small muted">Progress photos and reports the doctor has shared with you.</p>
          <div className="mt-16"><PhotoGrid photos={photos} /></div>
        </div>
      )}
    </div>
  );
}

export function PortalVisit() {
  const { id } = useParams();
  const { data, error, loading, reload } = useLoad(() => api(`/me/visits/${id}`), [id]);
  if (error) return <div className="page narrow"><ErrorBox error={error} onRetry={reload} /></div>;
  if (loading) return <div className="page narrow"><PageSkeleton /></div>;
  return <div className="page narrow fade-in"><VisitView v={data.visit} back="/portal/visits" print={`/print/visit/${id}`} /></div>;
}

/** Read-only visit summary (patient view). */
export function VisitView({ v, back, print }) {
  return (
    <>
      <div className="row between">
        <Link to={back} className="link small">← All visits</Link>
        <Link to={print} className="btn sm"><Printer size={16} />Print / save PDF</Link>
      </div>
      <div className="card mt-16">
        <div className="row top">
          <ConcernIcon concern={v.concern} />
          <div className="grow">
            <h1 className="serif" style={{ fontSize: 28 }}>{v.diagnosis || concernLabel(v.concern) || 'Consultation'}</h1>
            <div className="muted small mt-4">{fmtDateLong(v.date)}{v.doctor_name ? ` · ${v.doctor_name}` : ''}</div>
          </div>
        </div>
        {v.complaint && <><div className="divider" /><div className="eyebrow">What you told us</div><p className="mt-8 pre">{v.complaint}</p></>}
        {v.procedure_done && <><div className="divider" /><div className="eyebrow">Procedure done</div><p className="mt-8 pre">{v.procedure_done}</p></>}
      </div>
      {v.items.length > 0 && (
        <div className="card mt-16">
          <div className="row between"><div className="card-title">Medicines</div><Pill size={20} color="var(--clay)" /></div>
          <div className="mt-8"><Medicines items={v.items} /></div>
        </div>
      )}
      {v.advice && (
        <div className="card mt-16" style={{ background: 'var(--brand-soft)', border: 0 }}>
          <div className="card-title" style={{ color: 'var(--brand)' }}>Doctor’s advice</div>
          <p className="mt-8 pre">{v.advice}</p>
        </div>
      )}
      {v.follow_up_date && (
        <div className="card mt-16">
          <div className="row">
            <CalTile date={v.follow_up_date} />
            <div className="grow">
              <div className="card-title">Next visit</div>
              <div className="small muted">Around {fmtDateLong(v.follow_up_date)} ({relDay(v.follow_up_date).toLowerCase()})</div>
            </div>
            <Link to="/portal/book" className="btn primary sm">Book</Link>
          </div>
        </div>
      )}
      {v.attachments.length > 0 && (
        <div className="card mt-16">
          <div className="card-title">Photos & reports</div>
          <div className="mt-12"><PhotoGrid photos={v.attachments} /></div>
        </div>
      )}
    </>
  );
}

export function PortalAppointments() {
  const { data, error, loading, reload } = useLoad(() => api('/me/appointments'), []);
  if (error) return <div className="page"><ErrorBox error={error} onRetry={reload} /></div>;
  if (loading) return <div className="page"><PageSkeleton /></div>;
  const t = todayISO();
  const upcoming = data.appointments.filter((a) => a.date >= t && ['booked', 'checked_in'].includes(a.status)).reverse();
  const past = data.appointments.filter((a) => !upcoming.includes(a));
  return (
    <div className="page narrow fade-in">
      <div className="page-head"><h1>Appointments</h1><Link className="btn primary" to="/portal/book"><CalendarPlus size={17} />Book</Link></div>
      <div className="card">
        <div className="card-title">Upcoming</div>
        {upcoming.length ? <div className="stack gap-16 mt-16">{upcoming.map((a) => <UpcomingAppt key={a.id} a={a} onChange={reload} />)}</div> : <p className="small muted mt-8">Nothing booked.</p>}
      </div>
      {past.length > 0 && (
        <div className="card mt-16">
          <div className="card-title">Past</div>
          <div className="list mt-8">
            {past.map((a) => (
              <div key={a.id} className="list-item">
                <Clock size={18} color="var(--muted)" />
                <div className="grow"><div className="strong small">{fmtDate(a.date)} · {fmtTime(a.start_time)}</div><div className="tiny muted">{concernLabel(a.concern)}</div></div>
                <StatusBadge status={a.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function PortalProfile() {
  const { user, setUser, toast } = useApp();
  const [f, setF] = useState({ name: user.name, email: user.email || '', gender: user.gender || '', dob: user.dob || '' });
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [busy, setBusy] = useState('');
  const save = async (e) => {
    e.preventDefault();
    setBusy('p');
    try {
      const { user: u } = await api('/auth/me', { method: 'PATCH', body: f });
      setUser(u);
      toast('Profile saved');
    } catch (ex) { toast(ex.message, 'err'); } finally { setBusy(''); }
  };
  const changePw = async (e) => {
    e.preventDefault();
    setBusy('w');
    try {
      await api('/auth/me', { method: 'PATCH', body: pw });
      setPw({ current_password: '', new_password: '' });
      toast('Password changed');
    } catch (ex) { toast(ex.message, 'err'); } finally { setBusy(''); }
  };
  return (
    <div className="page narrow fade-in">
      <div className="page-head"><h1>Profile</h1></div>
      <form className="card stack gap-16" onSubmit={save}>
        <Field label="Phone number" hint="This is how you log in. To change it, ask the clinic."><input className="input" value={displayPhone(user.phone)} disabled /></Field>
        <Field label="Full name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        <Field label="Email" hint="Prescriptions and reminders are sent here."><div className="input-icon"><Mail size={18} /><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div></Field>
        <div className="grid g-2">
          <Field label="Gender"><select className="input" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}><option value="">Prefer not to say</option><option>Female</option><option>Male</option><option>Other</option></select></Field>
          <Field label="Date of birth"><input className="input" type="date" value={f.dob} onChange={(e) => setF({ ...f, dob: e.target.value })} /></Field>
        </div>
        <div><Button className="primary" loading={busy === 'p'}>Save</Button></div>
      </form>
      <form className="card stack gap-16 mt-16" onSubmit={changePw}>
        <div className="card-title">Change password</div>
        <Field label="Current password"><input className="input" type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} autoComplete="current-password" required /></Field>
        <Field label="New password"><input className="input" type="password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} autoComplete="new-password" minLength={6} required /></Field>
        <div><Button loading={busy === 'w'}>Change password</Button></div>
      </form>
    </div>
  );
}

