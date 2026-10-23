import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, Save, Printer, Mail, History, Pill, CalendarDays, EyeOff, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { useApp, useLoad } from '../lib/store';
import { todayISO, addDays, fmtDate, fmtDateLong, relDay, concernLabel, displayPhone, age, CONCERNS } from '../lib/format';
import { Avatar, Badge, Button, ErrorBox, Field, PageSkeleton } from '../components/ui';
import { PatientPhotos } from './StaffPatients';
import { Medicines } from './Portal';

const FREQUENCIES = ['Once daily', 'Twice daily', 'Three times daily', 'At night', 'In the morning', 'Alternate days', 'Twice a week', 'As needed'];
const DURATIONS = ['5 days', '7 days', '10 days', '2 weeks', '1 month', '2 months', '3 months'];
const KINDS = ['Tablet', 'Capsule', 'Cream', 'Gel', 'Lotion', 'Ointment', 'Serum', 'Solution', 'Shampoo', 'Face wash', 'Sunscreen', 'Soap', 'Syrup', 'Injection'];
const FOLLOW_UPS = [['1 week', 7], ['2 weeks', 14], ['3 weeks', 21], ['1 month', 30], ['6 weeks', 42], ['2 months', 60], ['3 months', 90]];

const blankItem = () => ({ key: Math.random(), medicine: '', kind: '', dosage: '', frequency: '', duration: '', instructions: '' });

export default function VisitEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const isNew = !id;
  const patientId = params.get('patient');
  const appointmentId = params.get('appointment');
  const { data, error, loading, reload } = useLoad(async () => {
    if (isNew) {
      const p = await api(`/staff/patients/${patientId}`);
      return { ...p, visit: null };
    }
    const { visit } = await api(`/staff/visits/${id}`);
    const p = await api(`/staff/patients/${visit.patient_id}`);
    return { ...p, visit };
  }, [id, patientId]);

  if (error) return <div className="page"><ErrorBox error={error} onRetry={reload} /></div>;
  if (loading) return <div className="page"><PageSkeleton /></div>;
  return <Editor key={data.visit?.id || 'new'} data={data} appointmentId={appointmentId} reload={reload} />;
}

function Editor({ data, appointmentId, reload }) {
  const { user, toast } = useApp();
  const nav = useNavigate();
  const { patient: p, visit, visits, appointments } = data;
  const clinician = user.role === 'doctor' || user.role === 'admin';
  const appt = appointments.find((a) => String(a.id) === String(appointmentId));
  const previous = visits.filter((v) => v.id !== visit?.id);

  const [f, setF] = useState(() => ({
    date: visit?.date || todayISO(),
    concern: visit?.concern || appt?.concern || '',
    complaint: visit?.complaint ?? appt?.description ?? '',
    diagnosis: visit?.diagnosis || '',
    procedure_done: visit?.procedure_done || '',
    advice: visit?.advice || '',
    private_notes: visit?.private_notes || '',
    follow_up_date: visit?.follow_up_date || '',
  }));
  const [items, setItems] = useState(() => (visit?.items?.length ? visit.items.map((i) => ({ ...i, key: i.id })) : [blankItem()]));
  const [sendEmail, setSendEmail] = useState(!!p.email);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setDirty(true); };

  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const setItem = (key, patch) => { setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i))); setDirty(true); };
  const removeItem = (key) => { setItems((list) => list.filter((i) => i.key !== key)); setDirty(true); };
  const addItem = (preset) => { setItems((list) => [...list.filter((i) => i.medicine || i.dispensed), { ...blankItem(), ...preset }]); setDirty(true); };
  const repeatLast = () => {
    const last = previous.find((v) => v.items.length);
    if (!last) return;
    setItems((list) => [...list.filter((i) => i.medicine), ...last.items.map(({ medicine, kind, dosage, frequency, duration, instructions }) => ({ ...blankItem(), medicine, kind, dosage, frequency, duration, instructions }))]);
    setDirty(true);
    toast(`Copied ${last.items.length} medicines from ${fmtDate(last.date)}`);
  };

  const save = async () => {
    setBusy(true);
    try {
      const body = { ...f, items: items.filter((i) => i.medicine.trim()).map((i) => ({ id: i.id, medicine: i.medicine, kind: i.kind, dosage: i.dosage, frequency: i.frequency, duration: i.duration, instructions: i.instructions, quantity: i.quantity })) };
      let saved;
      if (visit) {
        saved = (await api(`/staff/visits/${visit.id}`, { method: 'PUT', body })).visit;
        if (sendEmail && p.email) await api(`/staff/visits/${visit.id}/email`, { method: 'POST' }).catch((e) => toast(e.message, 'err'));
      } else {
        saved = (await api('/staff/visits', { method: 'POST', body: { ...body, patient_id: p.id, appointment_id: appt?.id, send_email: sendEmail } })).visit;
      }
      setDirty(false);
      toast(visit ? 'Visit updated' : 'Prescription saved — the patient can see it now');
      if (!visit) nav(`/staff/visits/${saved.id}`, { replace: true });
      else reload();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  if (!clinician) {
    return (
      <div className="page narrow">
        <Link to={`/staff/patients/${p.id}`} className="link small">← {p.name}</Link>
        <div className="card mt-16">
          <div className="card-title">{visit.diagnosis || 'Visit'} · {fmtDate(visit.date)}</div>
          <div className="mt-8"><Medicines items={visit.items} /></div>
          {visit.advice && <p className="pre small mt-12">{visit.advice}</p>}
          <div className="mt-16"><Link className="btn sm" to={`/print/visit/${visit.id}`}><Printer size={15} />Print</Link></div>
        </div>
      </div>
    );
  }

  return (
    <div className="page fade-in">
      <div className="row between wrap">
        <Link to={`/staff/patients/${p.id}`} className="link small">← {p.name}</Link>
        {visit && <Link to={`/print/visit/${visit.id}`} className="btn sm"><Printer size={15} />Print prescription</Link>}
      </div>

      <div className="card mt-16 tight">
        <div className="row wrap">
          <Avatar name={p.name} />
          <div className="grow">
            <div className="strong">{p.name}</div>
            <div className="small muted">{displayPhone(p.phone)}{p.dob ? ` · ${age(p.dob)} yrs` : ''}{p.gender ? ` · ${p.gender}` : ''} · {previous.length ? `${previous.length} previous visit${previous.length > 1 ? 's' : ''}` : 'First visit'}</div>
          </div>
          {appt && <Badge tone="blue">Appointment {fmtDate(appt.date)}</Badge>}
          {visit && <Badge tone="green"><CheckCircle2 size={13} />Saved {fmtDate(visit.updated_at)}</Badge>}
        </div>
        {p.notes && <div className="notice sun small mt-12"><EyeOff size={16} /><div><b>Notes:</b> {p.notes}</div></div>}
      </div>

      <div className="grid g-side mt-16">
        <div className="stack gap-16">
          <div className="card stack gap-16">
            <div className="grid g-2">
              <Field label="Visit date"><input className="input" type="date" value={f.date} onChange={set('date')} /></Field>
              <Field label="Concern">
                <select className="input" value={f.concern} onChange={set('concern')}>
                  <option value="">—</option>
                  {CONCERNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Complaint / history"><textarea className="input" value={f.complaint} onChange={set('complaint')} placeholder="What the patient reports" /></Field>
            <Field label="Diagnosis" hint="Shown to the patient as the title of this visit"><input className="input" value={f.diagnosis} onChange={set('diagnosis')} placeholder="e.g. Acne vulgaris (grade 2)" /></Field>
            <Field label="Procedure done (optional)"><input className="input" value={f.procedure_done} onChange={set('procedure_done')} placeholder="e.g. Salicylic peel 20%, session 2 of 6" /></Field>
          </div>

          <div className="card">
            <div className="row between wrap">
              <div className="card-title row gap-6"><Pill size={18} color="var(--clay)" />Prescription</div>
              <div className="row gap-6">
                {previous.some((v) => v.items.length) && <Button className="sm ghost" onClick={repeatLast}><History size={15} />Repeat last</Button>}
                <Button className="sm" onClick={() => addItem()}><Plus size={15} />Add medicine</Button>
              </div>
            </div>
            <div className="mt-16">
              {items.map((i) => <ItemRow key={i.key} item={i} onChange={(patch) => setItem(i.key, patch)} onRemove={() => removeItem(i.key)} />)}
              {!items.length && <p className="small muted">No medicines. <button className="link" onClick={() => addItem()}>Add one</button></p>}
            </div>
            <datalist id="kinds">{KINDS.map((k) => <option key={k} value={k} />)}</datalist>
            <datalist id="freqs">{FREQUENCIES.map((k) => <option key={k} value={k} />)}</datalist>
            <datalist id="durs">{DURATIONS.map((k) => <option key={k} value={k} />)}</datalist>
          </div>

          <div className="card stack gap-16">
            <Field label="Advice for the patient" hint="Diet, routine, how to apply, what to avoid — the patient sees this">
              <textarea className="input" rows={4} value={f.advice} onChange={set('advice')} placeholder={'e.g. Apply sunscreen every 3 hours outdoors.\nDon’t pick at spots.'} />
            </Field>
            <Field label="Private notes" hint="Only doctors see these"><textarea className="input" value={f.private_notes} onChange={set('private_notes')} /></Field>
          </div>
        </div>

        <div className="stack gap-16" style={{ position: 'sticky', top: 16 }}>
          <div className="card">
            <div className="card-title row gap-6"><CalendarDays size={18} />Next visit</div>
            <div className="chips mt-12">
              {FOLLOW_UPS.map(([label, days]) => {
                const d = addDays(f.date, days);
                return <button key={label} type="button" className={`chip ${f.follow_up_date === d ? 'on' : ''}`} onClick={() => { setF({ ...f, follow_up_date: d }); setDirty(true); }}>{label}</button>;
              })}
            </div>
            <div className="row mt-12">
              <input className="input" type="date" value={f.follow_up_date} onChange={set('follow_up_date')} />
              {f.follow_up_date && <button className="link small" onClick={() => { setF({ ...f, follow_up_date: '' }); setDirty(true); }}>Clear</button>}
            </div>
            {f.follow_up_date && <p className="small muted mt-8">{fmtDateLong(f.follow_up_date)} · {relDay(f.follow_up_date)}. The patient gets a reminder 3 days before.</p>}
          </div>

          <div className="card">
            {p.email ? (
              <label className="check small"><input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} /><Mail size={15} />Email the prescription to {p.email}</label>
            ) : <p className="small muted">Add the patient’s email to send prescriptions by email.</p>}
            <Button className="primary block lg mt-16" loading={busy} onClick={save}><Save size={18} />{visit ? 'Save changes' : 'Save prescription'}</Button>
            <p className="tiny muted mt-8 center">It appears in the patient’s portal and at the pharmacy desk right away.</p>
          </div>

          {visit && <PatientPhotos patientId={p.id} visitId={visit.id} photos={visit.attachments} onChange={reload} canEdit title="Photos for this visit" />}
          {!visit && <div className="card small muted">Save first, then add photos to this visit.</div>}

          {previous.length > 0 && (
            <div className="card">
              <div className="card-title">Previous visits</div>
              <div className="list mt-8">
                {previous.slice(0, 5).map((v) => (
                  <Link key={v.id} to={`/staff/visits/${v.id}`} className="list-item click">
                    <div className="grow">
                      <div className="small strong">{v.diagnosis || concernLabel(v.concern) || 'Visit'}</div>
                      <div className="tiny muted">{fmtDate(v.date)} · {v.items.length} medicine{v.items.length === 1 ? '' : 's'}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ItemRow({ item, onChange, onRemove }) {
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus || q.length < 2) { setSuggestions([]); return; }
    const t = setTimeout(() => api('/staff/medicines', { query: { q } }).then((r) => setSuggestions(r.medicines.filter((m) => m.medicine.toLowerCase() !== q.toLowerCase()))).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [q, focus]);
  const locked = !!item.dispensed;
  const field = (k, placeholder, list) => (
    <input className="input sm" placeholder={placeholder} list={list} value={item[k] || ''} disabled={locked} onChange={(e) => onChange({ [k]: e.target.value })} />
  );
  const sug = useMemo(() => suggestions.slice(0, 6), [suggestions]);
  return (
    <div className="rx-row">
      <div className="med" style={{ position: 'relative' }}>
        <input
          className="input sm" placeholder="Medicine name & strength" value={item.medicine} disabled={locked}
          onChange={(e) => { onChange({ medicine: e.target.value }); setQ(e.target.value); }}
          onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)}
        />
        {sug.length > 0 && focus && (
          <div className="suggest">
            {sug.map((m) => (
              <button key={m.medicine} type="button" onMouseDown={() => { onChange({ medicine: m.medicine, kind: m.kind || '', dosage: m.dosage || '', frequency: m.frequency || '', duration: m.duration || '', instructions: m.instructions || '' }); setSuggestions([]); }}>
                <div className="small strong">{m.medicine}</div>
                <div className="tiny muted">{[m.kind, m.frequency, m.duration].filter(Boolean).join(' · ')}</div>
              </button>
            ))}
          </div>
        )}
      </div>
      {field('kind', 'Type', 'kinds')}
      {field('frequency', 'When', 'freqs')}
      {field('duration', 'For how long', 'durs')}
      <button className="btn sm icon ghost del" onClick={onRemove} disabled={locked} title={locked ? 'Already handed over' : 'Remove'} aria-label="Remove"><Trash2 size={16} /></button>
      <div className="full grid g-2" style={{ gap: 8 }}>
        {field('dosage', 'Dose (e.g. 1 tab, pea-sized)')}
        {field('instructions', 'Instructions (e.g. after food, avoid eyes)')}
      </div>
      {locked && <div className="full tiny" style={{ color: 'var(--green)', fontWeight: 700 }}>✓ Handed over — can’t be edited</div>}
    </div>
  );
}
