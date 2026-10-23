import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Pill, CheckCircle2, Circle, PackageCheck, Printer } from 'lucide-react';
import { api } from '../lib/api';
import { useApp, useLoad } from '../lib/store';
import { fmtDate, relDay, displayPhone } from '../lib/format';
import { Avatar, Badge, Button, Empty, ErrorBox, Skeleton } from '../components/ui';

export default function Pharmacy() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const { data, error, loading, reload, setData } = useLoad(
    () => (debounced ? api('/staff/pharmacy/search', { query: { q: debounced } }) : api('/staff/pharmacy/queue')),
    [debounced]
  );
  // Refresh the queue every 30 s so new prescriptions from the doctor show up.
  useEffect(() => {
    if (debounced) return;
    const t = setInterval(reload, 30_000);
    return () => clearInterval(t);
  }, [debounced, reload]);

  const update = (visitId, items) => setData((d) => ({ ...d, prescriptions: d.prescriptions.map((p) => (p.visit_id === visitId ? { ...p, items } : p)) }));

  return (
    <div className="page fade-in">
      <div className="page-head">
        <div><div className="eyebrow">Pharmacy desk</div><h1 className="mt-4">Prescriptions to hand over</h1></div>
      </div>
      <div className="input-icon"><Search size={18} /><input className="input" placeholder="Search a patient by name or phone to see all their prescriptions" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
      <p className="small muted mt-8">{debounced ? `Results for “${debounced}”` : 'Waiting from the last 30 days. Updates automatically.'}</p>
      <div className="stack gap-16 mt-16">
        {error ? <ErrorBox error={error} onRetry={reload} /> : loading && !data ? (
          [0, 1].map((i) => <Skeleton key={i} h={180} />)
        ) : !data.prescriptions.length ? (
          <div className="card"><Empty icon={PackageCheck} title={debounced ? 'No prescriptions found' : 'Nothing waiting'}>{debounced ? 'Check the name or phone number.' : 'New prescriptions appear here as soon as the doctor saves them.'}</Empty></div>
        ) : data.prescriptions.map((p) => <RxCard key={p.visit_id} p={p} onItems={(items) => update(p.visit_id, items)} />)}
      </div>
    </div>
  );
}

function RxCard({ p, onItems }) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(null);
  const pending = p.items.filter((i) => !i.dispensed).length;
  const toggle = async (item) => {
    setBusy(item.id);
    try {
      const r = await api(`/staff/prescription-items/${item.id}/dispense`, { method: 'POST', body: { dispensed: !item.dispensed } });
      onItems(p.items.map((i) => (i.id === item.id ? r.item : i)));
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(null); }
  };
  const all = async () => {
    setBusy('all');
    try {
      const r = await api(`/staff/visits/${p.visit_id}/dispense-all`, { method: 'POST' });
      onItems(r.items);
      toast(`Handed over to ${p.name}`);
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(null); }
  };
  return (
    <div className="card" style={!pending ? { opacity: 0.75 } : undefined}>
      <div className="row wrap">
        <Avatar name={p.name} />
        <div className="grow">
          <Link to={`/staff/patients/${p.patient_id}`} className="strong">{p.name}</Link>
          <div className="small muted">{displayPhone(p.phone)} · {relDay(p.date)}{p.doctor_name ? ` · ${p.doctor_name}` : ''}{p.diagnosis ? ` · ${p.diagnosis}` : ''}</div>
        </div>
        {pending ? <Badge tone="clay">{pending} to hand over</Badge> : <Badge tone="green"><CheckCircle2 size={13} />All handed over</Badge>}
      </div>
      <div className="list mt-8">
        {p.items.map((i) => (
          <button key={i.id} className="list-item click" style={{ border: 0, background: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', borderBottom: '1px solid var(--line)' }} onClick={() => toggle(i)} disabled={busy === i.id}>
            {i.dispensed ? <CheckCircle2 size={22} color="var(--green)" /> : <Circle size={22} color="var(--line-strong)" />}
            <div className="grow">
              <div className="strong" style={i.dispensed ? { textDecoration: 'line-through', color: 'var(--muted)' } : undefined}>{i.medicine}{i.kind ? <span className="muted" style={{ fontWeight: 500 }}> · {i.kind}</span> : ''}</div>
              <div className="small muted">{[i.dosage, i.frequency, i.duration, i.quantity && `Qty ${i.quantity}`].filter(Boolean).join(' · ')}</div>
            </div>
            {!!i.dispensed && <span className="tiny muted hide-sm">{fmtDate(i.dispensed_at)}</span>}
          </button>
        ))}
      </div>
      <div className="row between mt-16 wrap">
        <div className="row gap-6">
          <Link to={`/print/visit/${p.visit_id}`} className="btn sm"><Printer size={15} />Print</Link>
          {p.follow_up_date && <span className="small muted">Next visit {fmtDate(p.follow_up_date)} — remind them to book.</span>}
        </div>
        {pending > 0 && <Button className="primary" loading={busy === 'all'} onClick={all}><Pill size={16} />Mark all handed over</Button>}
      </div>
    </div>
  );
}
