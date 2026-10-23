import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Copy, Save, CalendarOff, KeyRound, UserPlus, Pencil, Eye, Newspaper, CalendarClock, UserCog, Settings, LogOut } from 'lucide-react';
import { api } from '../lib/api';
import { useApp, useLoad } from '../lib/store';
import { WEEKDAYS, fmtDate, fmtTime, displayPhone, ARTICLE_CATS, catLabel, todayISO } from '../lib/format';
import { Avatar, Badge, Button, Empty, ErrorBox, Field, Modal, PageSkeleton, Markdown, fieldErrors } from '../components/ui';
import { TempPasswordModal } from './StaffPatients';

const ORDER = [1, 2, 3, 4, 5, 6, 0];
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const slotCount = (w) => (w.start_time && w.end_time && w.slot_minutes ? Math.max(0, Math.floor((toMin(w.end_time) - toMin(w.start_time)) / Number(w.slot_minutes))) : 0);

// ---------- Schedule ----------

export function Schedule() {
  const { toast } = useApp();
  const { data, error, loading, reload } = useLoad(() => Promise.all([api('/admin/availability'), api('/admin/closures')]), []);
  const [windows, setWindows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copyFrom, setCopyFrom] = useState(null);
  useEffect(() => { if (data) setWindows(data[0].windows.map((w) => ({ ...w, key: Math.random() }))); }, [data]);

  if (error) return <div className="page"><ErrorBox error={error} onRetry={reload} /></div>;
  if (loading || !windows) return <div className="page"><PageSkeleton /></div>;

  const forDay = (d) => windows.filter((w) => w.weekday === d);
  const update = (key, patch) => setWindows((ws) => ws.map((w) => (w.key === key ? { ...w, ...patch } : w)));
  const add = (d) => {
    const last = forDay(d).slice(-1)[0];
    const start = last ? last.end_time : '10:00';
    const endMin = Math.min(toMin(start) + 180, 23 * 60 + 59);
    const end = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
    setWindows((ws) => [...ws, { key: Math.random(), weekday: d, start_time: start, end_time: end, slot_minutes: last?.slot_minutes || 30, capacity: last?.capacity || 1 }]);
  };
  const copy = (from, targets) => {
    const src = forDay(from);
    setWindows((ws) => [...ws.filter((w) => !targets.includes(w.weekday)), ...targets.flatMap((d) => src.map((w) => ({ ...w, weekday: d, key: Math.random(), id: undefined })))]);
    setCopyFrom(null);
  };
  const save = async () => {
    setBusy(true);
    try {
      const r = await api('/admin/availability', { method: 'PUT', body: { windows: windows.map(({ weekday, start_time, end_time, slot_minutes, capacity }) => ({ weekday, start_time, end_time, slot_minutes: Number(slot_minutes), capacity: Number(capacity) })) } });
      setWindows(r.windows.map((w) => ({ ...w, key: Math.random() })));
      toast('Schedule saved — patients see the new slots now');
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  };

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div><div className="eyebrow">Admin</div><h1 className="mt-4">Schedule & slots</h1><p className="muted mt-4 small">Set the hours you see patients each day. Split a day into several windows (e.g. morning and evening), each with its own slot length.</p></div>
        <Button className="primary" loading={busy} onClick={save}><Save size={17} />Save schedule</Button>
      </div>
      <div className="grid g-2">
        {ORDER.map((d) => {
          const ws = forDay(d);
          const total = ws.reduce((n, w) => n + slotCount(w) * (Number(w.capacity) || 1), 0);
          return (
            <div key={d} className="day-card">
              <div className="row between">
                <div>
                  <div className="strong">{WEEKDAYS[d]}</div>
                  <div className="tiny muted">{ws.length ? `${total} booking${total === 1 ? '' : 's'} available` : 'Closed'}</div>
                </div>
                <div className="row gap-4">
                  {ws.length > 0 && <Button className="sm ghost" onClick={() => setCopyFrom(d)}><Copy size={14} />Copy to…</Button>}
                  <Button className="sm" onClick={() => add(d)}><Plus size={14} />Window</Button>
                </div>
              </div>
              {ws.map((w) => (
                <div key={w.key}>
                  <div className="window-row">
                    <Field label="From"><input className="input sm" type="time" value={w.start_time} onChange={(e) => update(w.key, { start_time: e.target.value })} /></Field>
                    <Field label="To"><input className="input sm" type="time" value={w.end_time} onChange={(e) => update(w.key, { end_time: e.target.value })} /></Field>
                    <Field label="Slot length">
                      <select className="input sm" value={w.slot_minutes} onChange={(e) => update(w.key, { slot_minutes: Number(e.target.value) })}>
                        {[10, 15, 20, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} hr${m > 60 ? 's' : ''}`}</option>)}
                      </select>
                    </Field>
                    <Field label="Per slot">
                      <select className="input sm" value={w.capacity} onChange={(e) => update(w.key, { capacity: Number(e.target.value) })} title="How many patients can book the same slot">
                        {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </Field>
                    <button className="btn sm icon ghost" onClick={() => setWindows((all) => all.filter((x) => x.key !== w.key))} aria-label="Remove window"><Trash2 size={16} /></button>
                  </div>
                  <div className="tiny muted mt-4">{slotCount(w)} slot{slotCount(w) === 1 ? '' : 's'}: {fmtTime(w.start_time)} – {fmtTime(w.end_time)}</div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <Closures initial={data[1].closures} />
      {copyFrom !== null && (
        <Modal title={`Copy ${WEEKDAYS[copyFrom]}’s hours`} onClose={() => setCopyFrom(null)}>
          <div className="stack">
            <Button onClick={() => copy(copyFrom, [1, 2, 3, 4, 5].filter((d) => d !== copyFrom))}>To all weekdays (Mon – Fri)</Button>
            <Button onClick={() => copy(copyFrom, [0, 6].filter((d) => d !== copyFrom))}>To the weekend (Sat & Sun)</Button>
            <Button onClick={() => copy(copyFrom, ORDER.filter((d) => d !== copyFrom))}>To every other day</Button>
            <div className="chips mt-8">
              {ORDER.filter((d) => d !== copyFrom).map((d) => <button key={d} className="chip" onClick={() => copy(copyFrom, [d])}>{WEEKDAYS[d]}</button>)}
            </div>
            <p className="tiny muted">Replaces the hours on the days you pick. Don’t forget to save.</p>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Closures({ initial }) {
  const { toast } = useApp();
  const [list, setList] = useState(initial);
  const [f, setF] = useState({ from: todayISO(), to: '', reason: '' });
  const [affected, setAffected] = useState(null);
  const [busy, setBusy] = useState(false);
  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api('/admin/closures', { method: 'POST', body: { from: f.from, to: f.to || f.from, reason: f.reason } });
      setList(r.closures);
      setF({ from: todayISO(), to: '', reason: '' });
      if (r.affected.length) setAffected(r.affected);
      else toast('Days closed');
    } catch (ex) { toast(ex.message, 'err'); } finally { setBusy(false); }
  };
  const remove = async (c) => {
    await api(`/admin/closures/${c.id}`, { method: 'DELETE' }).catch(() => {});
    setList((l) => l.filter((x) => x.id !== c.id));
  };
  return (
    <div className="card mt-24">
      <div className="card-title row gap-6"><CalendarOff size={18} />Holidays & days off</div>
      <p className="small muted mt-4">No slots are offered on these days.</p>
      <form className="row wrap top mt-16" onSubmit={add}>
        <Field label="From"><input className="input sm" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} required /></Field>
        <Field label="To (optional)"><input className="input sm" type="date" value={f.to} min={f.from} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        <Field label="Reason" className="grow"><input className="input sm" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. Diwali, conference" /></Field>
        <Button className="sm" loading={busy} style={{ marginTop: 25 }}>Close days</Button>
      </form>
      {list.length > 0 && (
        <div className="chips mt-16">
          {list.map((c) => (
            <span key={c.id} className="chip" style={{ cursor: 'default' }}>
              {fmtDate(c.date)}{c.reason ? ` · ${c.reason}` : ''}
              <button className="link" style={{ color: 'var(--muted)' }} onClick={() => remove(c)} aria-label="Reopen">×</button>
            </span>
          ))}
        </div>
      )}
      {affected && (
        <Modal title="These patients are already booked" onClose={() => setAffected(null)}>
          <p className="muted small">The days are closed for new bookings. Call these patients to move their appointments:</p>
          <div className="list mt-12">
            {affected.map((a) => (
              <div key={a.id} className="list-item">
                <div className="grow"><div className="strong small">{a.name}</div><div className="tiny muted">{fmtDate(a.date)} · {fmtTime(a.start_time)}</div></div>
                <a className="btn sm" href={`tel:${a.phone}`}>{displayPhone(a.phone)}</a>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------- Staff accounts ----------

const ROLES = { doctor: 'Doctor', reception: 'Reception & pharmacy', admin: 'Admin (full access)' };

export function StaffAccounts() {
  const { user, toast } = useApp();
  const { data, error, loading, reload } = useLoad(() => api('/admin/staff'), []);
  const [adding, setAdding] = useState(false);
  const [issued, setIssued] = useState(null);
  if (error) return <div className="page"><ErrorBox error={error} onRetry={reload} /></div>;
  if (loading) return <div className="page"><PageSkeleton /></div>;
  const patch = async (u, body) => {
    try { await api(`/admin/staff/${u.id}`, { method: 'PATCH', body }); reload(); } catch (e) { toast(e.message, 'err'); }
  };
  const reset = async (u) => {
    try { const r = await api(`/admin/staff/${u.id}/reset`, { method: 'POST' }); setIssued({ user: u, password: r.password }); } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <div className="page fade-in">
      <div className="page-head">
        <div><div className="eyebrow">Admin</div><h1 className="mt-4">Staff accounts</h1><p className="muted small mt-4">Doctors write prescriptions. Reception books appointments and hands over medicines. Admins can do everything, including this page.</p></div>
        <Button className="primary" onClick={() => setAdding(true)}><UserPlus size={17} />Add staff</Button>
      </div>
      <div className="card" style={{ padding: 8 }}>
        <div className="list">
          {data.staff.map((u) => (
            <div key={u.id} className="list-item" style={{ padding: '14px 10px', opacity: u.active ? 1 : 0.5 }}>
              <Avatar name={u.name} />
              <div className="grow">
                <div className="strong">{u.name}{u.id === user.id && <span className="muted"> (you)</span>}</div>
                <div className="small muted">{displayPhone(u.phone)}{u.must_change_password ? ' · hasn’t logged in yet' : ''}</div>
              </div>
              <select className="input sm hide-sm" style={{ width: 200 }} value={u.role} disabled={u.id === user.id} onChange={(e) => patch(u, { role: e.target.value })}>
                {Object.entries(ROLES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <Button className="sm" onClick={() => reset(u)} title="Reset password"><KeyRound size={15} /><span className="hide-sm">Reset</span></Button>
              {u.id !== user.id && <Button className="sm ghost" onClick={() => patch(u, { active: !u.active })}>{u.active ? 'Disable' : 'Enable'}</Button>}
            </div>
          ))}
        </div>
      </div>
      {adding && <StaffForm onClose={() => setAdding(false)} onDone={(u, password) => { setAdding(false); setIssued({ user: u, password }); reload(); }} />}
      {issued && <TempPasswordModal staff name={issued.user.name} phone={issued.user.phone} account={{ password: issued.password }} onClose={() => setIssued(null)} />}
    </div>
  );
}

function StaffForm({ onClose, onDone }) {
  const [f, setF] = useState({ name: '', phone: '', email: '', role: 'doctor' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setError('');
    try {
      const r = await api('/admin/staff', { method: 'POST', body: f });
      onDone(r.user, r.password);
    } catch (ex) { setErrors(fieldErrors(ex)); setError(ex.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Add a staff member" onClose={onClose}>
      <form className="stack gap-16" onSubmit={submit}>
        <Field label="Name" error={errors.name}><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Dr. Anjali Mehta" required autoFocus /></Field>
        <Field label="Phone number" hint="They log in with this number" error={errors.phone}><input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required /></Field>
        <Field label="Email (optional)" error={errors.email}><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Role" error={errors.role}>
          <div className="chips">{Object.entries(ROLES).map(([k, l]) => <button type="button" key={k} className={`chip ${f.role === k ? 'on' : ''}`} onClick={() => setF({ ...f, role: k })}>{l}</button>)}</div>
        </Field>
        {error && !Object.keys(errors).length && <div className="notice red small">{error}</div>}
        <p className="small muted">They’ll get a temporary password to log in with, and choose their own on first login.</p>
        <div className="row" style={{ justifyContent: 'flex-end' }}><Button type="button" className="ghost" onClick={onClose}>Cancel</Button><Button className="primary" loading={busy}>Create account</Button></div>
      </form>
    </Modal>
  );
}

// ---------- Articles ----------

export function ArticlesAdmin() {
  const { data, error, loading, reload } = useLoad(() => api('/admin/articles'), []);
  const [editing, setEditing] = useState(null);
  if (error) return <div className="page"><ErrorBox error={error} onRetry={reload} /></div>;
  if (loading) return <div className="page"><PageSkeleton /></div>;
  return (
    <div className="page fade-in">
      <div className="page-head">
        <div><div className="eyebrow">Admin</div><h1 className="mt-4">Learn articles</h1><p className="muted small mt-4">Guides on procedures, hair and skin care, and myths — shown on the website and in the patient portal.</p></div>
        <Button className="primary" onClick={() => setEditing({})}><Plus size={17} />New article</Button>
      </div>
      <div className="card" style={{ padding: 8 }}>
        {!data.articles.length ? <Empty icon={Newspaper} title="No articles" /> : (
          <div className="list">
            {data.articles.map((a) => (
              <div key={a.id} className="list-item click" onClick={() => setEditing(a)}>
                <div className="grow">
                  <div className="strong">{a.title}</div>
                  <div className="small muted">{catLabel(a.category)} · {a.read_minutes} min</div>
                </div>
                {!a.published && <Badge tone="amber">Draft</Badge>}
                <Pencil size={16} color="var(--muted)" />
              </div>
            ))}
          </div>
        )}
      </div>
      {editing && <ArticleEditor id={editing.id} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

function ArticleEditor({ id, onClose, onSaved }) {
  const { toast } = useApp();
  const [f, setF] = useState(id ? null : { title: '', category: 'skin', summary: '', body: '', published: true });
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (id) api(`/admin/articles/${id}`).then(({ article }) => setF({ ...article, published: !!article.published })); }, [id]);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(id ? `/admin/articles/${id}` : '/admin/articles', { method: id ? 'PUT' : 'POST', body: { ...f, read_minutes: undefined } });
      toast('Article saved');
      onSaved();
    } catch (ex) { toast(ex.message, 'err'); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm('Delete this article?')) return;
    await api(`/admin/articles/${id}`, { method: 'DELETE' });
    onSaved();
  };
  return (
    <Modal title={id ? 'Edit article' : 'New article'} onClose={onClose} wide>
      {!f ? <PageSkeleton /> : (
        <form className="stack gap-16" onSubmit={save}>
          <Field label="Title"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></Field>
          <div className="grid g-2">
            <Field label="Category"><select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{ARTICLE_CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
            <Field label="Status"><label className="check" style={{ height: 46 }}><input type="checkbox" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} />Published</label></Field>
          </div>
          <Field label="Summary" hint="One or two sentences for the card"><textarea className="input" rows={2} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></Field>
          <div className="row between"><span className="strong small">Article</span><button type="button" className="link small row gap-4" onClick={() => setPreview(!preview)}><Eye size={14} />{preview ? 'Edit' : 'Preview'}</button></div>
          {preview ? <div className="card flat" style={{ maxHeight: 420, overflow: 'auto' }}><Markdown text={f.body} /></div> : (
            <Field hint="## Heading · ### Smaller heading · - bullet · 1. numbered · **bold** · *italic* · > highlighted tip">
              <textarea className="input" rows={14} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13.5 }} />
            </Field>
          )}
          <div className="row between">
            {id ? <Button type="button" className="danger ghost" onClick={remove}><Trash2 size={15} />Delete</Button> : <span />}
            <div className="row"><Button type="button" className="ghost" onClick={onClose}>Cancel</Button><Button className="primary" loading={busy}>Save</Button></div>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ---------- Clinic details ----------

const SETTINGS_FIELDS = [
  ['clinic_name', 'Clinic name'],
  ['tagline', 'Tagline', 'Shown on the home page'],
  ['doctor_name', 'Lead doctor’s name'],
  ['doctor_credentials', 'Doctor’s qualifications', 'Printed on prescriptions'],
  ['phone', 'Clinic phone'],
  ['whatsapp', 'WhatsApp number', 'With country code, e.g. +91 98765 43210'],
  ['email', 'Clinic email'],
  ['address', 'Address'],
  ['maps_url', 'Google Maps link'],
  ['booking_days_ahead', 'How many days ahead patients can book'],
  ['min_notice_minutes', 'Minimum notice for online booking (minutes)', 'Slots starting sooner than this aren’t offered online'],
];

export function ClinicSettings() {
  const { toast, setClinic, clinic } = useApp();
  const { data, error, loading, reload } = useLoad(() => api('/admin/settings'), []);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setF(data.settings); }, [data]);
  if (error) return <div className="page"><ErrorBox error={error} onRetry={reload} /></div>;
  if (loading || !f) return <div className="page"><PageSkeleton /></div>;
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api('/admin/settings', { method: 'PUT', body: f });
      setClinic({ ...clinic, settings: r.settings });
      document.title = r.settings.clinic_name;
      toast('Saved');
    } catch (ex) { toast(ex.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <div className="page narrow fade-in">
      <div className="page-head"><div><div className="eyebrow">Admin</div><h1 className="mt-4">Clinic details</h1></div></div>
      <form className="card stack gap-16" onSubmit={save}>
        {SETTINGS_FIELDS.map(([k, label, hint]) => (
          <Field key={k} label={label} hint={hint}>
            {k === 'address' ? <textarea className="input" rows={2} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
              : <input className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} inputMode={['booking_days_ahead', 'min_notice_minutes'].includes(k) ? 'numeric' : undefined} />}
          </Field>
        ))}
        <div><Button className="primary" loading={busy}>Save</Button></div>
      </form>
    </div>
  );
}

/** Mobile: admin pages that don't fit in the tab bar. */
export function More() {
  const { logout } = useApp();
  const links = [
    ['/staff/schedule', CalendarClock, 'Schedule & slots'],
    ['/staff/staff', UserCog, 'Staff accounts'],
    ['/staff/articles', Newspaper, 'Learn articles'],
    ['/staff/settings', Settings, 'Clinic details'],
  ];
  return (
    <div className="page narrow">
      <div className="page-head"><h1>More</h1></div>
      <div className="card" style={{ padding: 8 }}>
        <div className="list">
          {links.map(([to, Icon, label]) => <Link key={to} to={to} className="list-item click"><Icon size={19} color="var(--brand)" /><span className="strong grow">{label}</span></Link>)}
          <button className="list-item click" style={{ border: 0, background: 'none', width: '100%', cursor: 'pointer' }} onClick={logout}><LogOut size={19} color="var(--red)" /><span className="strong">Log out</span></button>
        </div>
      </div>
    </div>
  );
}
