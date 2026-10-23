import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Search, UserPlus, KeyRound, Stethoscope, CalendarPlus, Pencil, Copy, MessageCircle, Pill, Images, Phone, Mail, Printer, EyeOff, Upload } from 'lucide-react';
import { api } from '../lib/api';
import { useApp, useLoad } from '../lib/store';
import { fmtDate, fmtDateLong, fmtTime, displayPhone, age, concernLabel, whatsappLink, firstName, compressImage } from '../lib/format';
import { Avatar, Badge, Button, Empty, ErrorBox, Field, Modal, PageSkeleton, Skeleton, StatusBadge, PhotoGrid, ConcernIcon, fieldErrors } from '../components/ui';
import { BookingModal } from './StaffToday';
import { Medicines } from './Portal';

export function StaffPatients() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [adding, setAdding] = useState(false);
  const nav = useNavigate();
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);
  const { data, error, loading, reload } = useLoad(() => api('/staff/patients', { query: { q: debounced } }), [debounced]);
  return (
    <div className="page fade-in">
      <div className="page-head">
        <h1>Patients</h1>
        <Button className="primary" onClick={() => setAdding(true)}><UserPlus size={17} />New patient</Button>
      </div>
      <div className="input-icon"><Search size={18} /><input className="input" placeholder="Search by name or phone number" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
      <div className="card mt-16" style={{ padding: 8 }}>
        {error ? <ErrorBox error={error} onRetry={reload} /> : loading && !data ? (
          <div className="stack" style={{ padding: 12 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={50} />)}</div>
        ) : !data.patients.length ? (
          <Empty icon={Search} title={debounced ? 'No one matches that' : 'No patients yet'}>{debounced ? 'Check the spelling or try the phone number.' : 'Patients appear here when they book or you add them.'}</Empty>
        ) : (
          <div className="list">
            {data.patients.map((p) => (
              <div key={p.id} className="list-item click" onClick={() => nav(`/staff/patients/${p.id}`)}>
                <Avatar name={p.name} />
                <div className="grow">
                  <div className="row gap-6 wrap"><span className="strong">{p.name}</span>{p.pending_items > 0 && <Badge tone="clay"><Pill size={12} />{p.pending_items} to hand over</Badge>}</div>
                  <div className="small muted">{displayPhone(p.phone)}{p.dob ? ` · ${age(p.dob)} yrs` : ''}{p.gender ? ` · ${p.gender}` : ''}</div>
                </div>
                <div className="hide-sm" style={{ textAlign: 'right' }}>
                  <div className="small">{p.visit_count} visit{p.visit_count === 1 ? '' : 's'}</div>
                  <div className="tiny muted">{p.last_visit ? `Last ${fmtDate(p.last_visit)}` : 'Not seen yet'}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {adding && <PatientForm onClose={() => setAdding(false)} onSaved={(p, account) => { setAdding(false); nav(`/staff/patients/${p.id}`, { state: { account } }); }} />}
    </div>
  );
}

function PatientForm({ patient, onClose, onSaved }) {
  const { toast } = useApp();
  const [f, setF] = useState({ name: patient?.name || '', phone: patient?.phone || '', email: patient?.email || '', gender: patient?.gender || '', dob: patient?.dob || '', notes: patient?.notes || '', create_account: true });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setError('');
    try {
      if (patient) {
        const { name, phone, email, gender, dob, notes } = f;
        const r = await api(`/staff/patients/${patient.id}`, { method: 'PATCH', body: { name, phone, email, gender, dob, notes } });
        toast('Saved');
        onSaved(r.patient);
      } else {
        const r = await api('/staff/patients', { method: 'POST', body: f });
        onSaved(r.patient, r.account);
      }
    } catch (ex) {
      setErrors(fieldErrors(ex));
      setError(ex.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={patient ? 'Edit patient' : 'New patient'} onClose={onClose}>
      <form className="stack gap-16" onSubmit={submit}>
        <Field label="Full name" error={errors.name}><input className="input" value={f.name} onChange={set('name')} required autoFocus /></Field>
        <Field label="Phone number" error={errors.phone}><input className="input" type="tel" value={f.phone} onChange={set('phone')} required /></Field>
        <Field label="Email (optional)" hint="Prescriptions and their login details are emailed here" error={errors.email}><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
        <div className="grid g-2">
          <Field label="Gender"><select className="input" value={f.gender} onChange={set('gender')}><option value="">—</option><option>Female</option><option>Male</option><option>Other</option></select></Field>
          <Field label="Date of birth" error={errors.dob}><input className="input" type="date" value={f.dob} onChange={set('dob')} /></Field>
        </div>
        {patient && <Field label="Medical notes (allergies, history)" hint="Only doctors see this"><textarea className="input" value={f.notes} onChange={set('notes')} /></Field>}
        {!patient && <label className="check"><input type="checkbox" checked={f.create_account} onChange={(e) => setF({ ...f, create_account: e.target.checked })} />Create a portal login with a temporary password</label>}
        {error && !Object.keys(errors).length && <div className="notice red small">{error}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button type="button" className="ghost" onClick={onClose}>Cancel</Button>
          <Button className="primary" loading={busy}>{patient ? 'Save' : 'Add patient'}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Shows a temporary password once, with copy and WhatsApp share. */
export function TempPasswordModal({ name, phone, account, onClose, staff = false }) {
  const { settings, toast } = useApp();
  const text = `Hi ${firstName(name)}, your ${settings.clinic_name} ${staff ? 'staff login' : 'patient portal'} is ready.\n\nLog in at ${window.location.origin}/login\nPhone: ${displayPhone(phone)}\nTemporary password: ${account.password}\n\nYou'll choose your own password after logging in.`;
  return (
    <Modal title="Portal login ready" onClose={onClose}>
      <p className="muted">Share this with {firstName(name)}. It’s shown only once — they’ll set their own password when they log in.</p>
      <div className="mt-16 small muted">Phone</div>
      <div className="strong">{displayPhone(phone)}</div>
      <div className="mt-12 small muted">Temporary password</div>
      <div className="temp-pass mt-4">{account.password}</div>
      {account.emailed && <div className="notice mt-16 small"><Mail size={16} />Also emailed to the patient.</div>}
      <div className="row wrap mt-24">
        <Button onClick={() => { navigator.clipboard?.writeText(text); toast('Copied'); }}><Copy size={16} />Copy message</Button>
        <a className="btn primary" href={whatsappLink(phone, text)} target="_blank" rel="noreferrer"><MessageCircle size={16} />Send on WhatsApp</a>
      </div>
    </Modal>
  );
}

export function StaffPatient() {
  const { id } = useParams();
  const { user, toast } = useApp();
  const nav = useNavigate();
  const location = useLocation();
  const { data, error, loading, reload } = useLoad(() => api(`/staff/patients/${id}`), [id]);
  const [editing, setEditing] = useState(false);
  const [booking, setBooking] = useState(false);
  const [account, setAccount] = useState(() => location.state?.account || null);
  const [issuing, setIssuing] = useState(false);
  const clinician = user.role === 'doctor' || user.role === 'admin';

  if (error) return <div className="page"><ErrorBox error={error} onRetry={reload} /></div>;
  if (loading) return <div className="page"><PageSkeleton /></div>;
  const { patient: p, visits, appointments, photos } = data;

  const issue = async () => {
    setIssuing(true);
    try {
      const r = await api(`/staff/patients/${p.id}/account`, { method: 'POST', body: {} });
      setAccount(r.account);
      reload();
    } catch (e) { toast(e.message, 'err'); } finally { setIssuing(false); }
  };
  const upcoming = appointments.filter((a) => ['booked', 'checked_in'].includes(a.status));

  return (
    <div className="page fade-in">
      <Link to="/staff/patients" className="link small">← Patients</Link>
      <div className="card mt-16">
        <div className="row top wrap gap-16">
          <Avatar name={p.name} lg />
          <div className="grow">
            <h1 className="serif" style={{ fontSize: 30 }}>{p.name}</h1>
            <div className="row wrap gap-16 small muted mt-4">
              <a href={`tel:${p.phone}`} className="row gap-4"><Phone size={14} />{displayPhone(p.phone)}</a>
              {p.email && <span className="row gap-4"><Mail size={14} />{p.email}</span>}
              {p.dob && <span>{age(p.dob)} yrs</span>}
              {p.gender && <span>{p.gender}</span>}
              <span>{p.has_account ? <Badge tone="green">Has portal login</Badge> : <Badge tone="grey">No login yet</Badge>}</span>
            </div>
            {p.notes && <div className="notice sun small mt-12"><EyeOff size={16} /><div><b>Notes:</b> {p.notes}</div></div>}
          </div>
          <div className="row wrap gap-6">
            <Button className="sm" onClick={() => setEditing(true)}><Pencil size={15} />Edit</Button>
            <Button className="sm" loading={issuing} onClick={issue}><KeyRound size={15} />{p.has_account ? 'Reset password' : 'Create login'}</Button>
            <Button className="sm" onClick={() => setBooking(true)}><CalendarPlus size={15} />Book</Button>
            {clinician && <Button className="primary sm" onClick={() => nav(`/staff/visits/new?patient=${p.id}${upcoming[0] ? `&appointment=${upcoming[0].id}` : ''}`)}><Stethoscope size={15} />New visit</Button>}
          </div>
        </div>
      </div>

      <div className="grid g-side mt-16">
        <div className="stack gap-16">
          <div className="card-title">Visits</div>
          {!visits.length ? <div className="card"><Empty icon={Stethoscope} title="No visits yet" /></div> : (
            <div className="timeline">
              {visits.map((v) => (
                <div key={v.id} className="tl-item">
                  <div className="card">
                    <div className="row between top">
                      <div className="row">
                        <ConcernIcon concern={v.concern} size={18} box={38} />
                        <div>
                          <div className="strong">{v.diagnosis || concernLabel(v.concern) || 'Consultation'}</div>
                          <div className="small muted">{fmtDateLong(v.date)}{v.doctor_name ? ` · ${v.doctor_name}` : ''}</div>
                        </div>
                      </div>
                      <div className="row gap-6">
                        <Link className="btn sm icon" to={`/print/visit/${v.id}`} title="Print"><Printer size={15} /></Link>
                        <Link className="btn sm" to={`/staff/visits/${v.id}`}>{clinician ? 'Open' : 'View'}</Link>
                      </div>
                    </div>
                    {v.complaint && <p className="small mt-12"><span className="muted">Complaint:</span> {v.complaint}</p>}
                    {v.procedure_done && <p className="small mt-4"><span className="muted">Procedure:</span> {v.procedure_done}</p>}
                    {v.private_notes && <p className="small mt-4" style={{ color: '#87590f' }}><EyeOff size={13} /> {v.private_notes}</p>}
                    {v.items.length > 0 && <div className="mt-8"><Medicines items={v.items} /></div>}
                    {v.follow_up_date && <div className="mt-8"><Badge tone="brand">Follow-up {fmtDate(v.follow_up_date)}</Badge></div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="stack gap-16">
          <div className="card">
            <div className="card-title">Appointments</div>
            {!appointments.length ? <p className="small muted mt-8">None.</p> : (
              <div className="list mt-8">
                {appointments.slice(0, 8).map((a) => (
                  <div key={a.id} className="list-item">
                    <div className="grow"><div className="small strong">{fmtDate(a.date)} · {fmtTime(a.start_time)}</div><div className="tiny muted">{concernLabel(a.concern)}</div></div>
                    <StatusBadge status={a.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
          <PatientPhotos patientId={p.id} photos={photos} onChange={reload} canEdit={clinician} />
        </div>
      </div>

      {editing && <PatientForm patient={p} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />}
      {booking && <BookingModal patient={p} onClose={() => setBooking(false)} onDone={() => { setBooking(false); reload(); }} />}
      {account && <TempPasswordModal name={p.name} phone={p.phone} account={account} onClose={() => { setAccount(null); nav('.', { replace: true, state: null }); }} />}
    </div>
  );
}

/** Photo gallery with upload (camera on phones). */
export function PatientPhotos({ patientId, visitId, photos, onChange, canEdit, title = 'Photos & reports' }) {
  const { toast } = useApp();
  const input = useRef();
  const [busy, setBusy] = useState(false);
  const [shared, setShared] = useState(true);
  const upload = async (files) => {
    setBusy(true);
    try {
      for (const file of files) {
        const data = await compressImage(file);
        await api('/staff/attachments', { method: 'POST', body: { patient_id: patientId, visit_id: visitId, data, caption: '', visible_to_patient: shared } });
      }
      toast(files.length > 1 ? `${files.length} files uploaded` : 'Uploaded');
      onChange();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const remove = async (p) => {
    if (!window.confirm('Delete this file?')) return;
    try { await api(`/staff/attachments/${p.id}`, { method: 'DELETE' }); onChange(); } catch (e) { toast(e.message, 'err'); }
  };
  return (
    <div className="card">
      <div className="row between">
        <div className="card-title row gap-6"><Images size={18} />{title}</div>
        {canEdit && <Button className="sm" loading={busy} onClick={() => input.current?.click()}><Upload size={15} />Add</Button>}
      </div>
      {canEdit && (
        <>
          <input ref={input} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => e.target.files.length && upload([...e.target.files])} />
          <label className="check small mt-8"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />Show new uploads to the patient</label>
        </>
      )}
      <div className="mt-12">
        {photos.length ? (
          <PhotoGrid photos={photos} onDelete={canEdit ? remove : undefined} renderTag={(p) => (!p.visible_to_patient ? <Badge tone="amber"><EyeOff size={11} />Private</Badge> : null)} />
        ) : <p className="small muted">No photos yet.{canEdit ? ' On a phone, “Add” opens the camera.' : ''}</p>}
      </div>
    </div>
  );
}
