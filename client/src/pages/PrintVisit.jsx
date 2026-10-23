import { useParams, useNavigate } from 'react-router-dom';
import { Printer, ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';
import { useApp, useLoad } from '../lib/store';
import { fmtDateLong, displayPhone, age } from '../lib/format';
import { ErrorBox, PageSkeleton } from '../components/ui';

/** A printable prescription sheet. "Print → Save as PDF" makes a PDF on any phone or computer. */
export default function PrintVisit() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user, isStaff, settings } = useApp();
  const { data, error, loading, reload } = useLoad(async () => {
    if (isStaff) return api(`/staff/visits/${id}`);
    const { visit } = await api(`/me/visits/${id}`);
    return { visit, patient: user };
  }, [id]);
  if (error) return <div className="page"><ErrorBox error={error} onRetry={reload} /></div>;
  if (loading) return <div className="page"><PageSkeleton /></div>;
  const { visit: v, patient: p } = data;
  return (
    <div style={{ padding: '0 12px' }}>
      <div className="row no-print" style={{ maxWidth: 800, margin: '16px auto 0', justifyContent: 'space-between' }}>
        <button className="btn sm ghost" onClick={() => nav(-1)}><ArrowLeft size={16} />Back</button>
        <button className="btn primary sm" onClick={() => window.print()}><Printer size={16} />Print or save as PDF</button>
      </div>
      <div className="rx-sheet">
        <div className="head">
          <div>
            <div className="serif" style={{ fontSize: 26, color: 'var(--brand)' }}>{settings.clinic_name}</div>
            <div className="small">{v.doctor_name || settings.doctor_name}{settings.doctor_credentials ? `, ${settings.doctor_credentials}` : ''}</div>
          </div>
          <div className="small" style={{ textAlign: 'right', maxWidth: 280 }}>
            {settings.address && <div>{settings.address}</div>}
            {settings.phone && <div>{settings.phone}</div>}
            {settings.email && <div>{settings.email}</div>}
          </div>
        </div>
        <div className="row between wrap mt-16 small">
          <div><b>{p.name}</b>{p.dob ? ` · ${age(p.dob)} yrs` : ''}{p.gender ? ` · ${p.gender}` : ''} · {displayPhone(p.phone)}</div>
          <div>{fmtDateLong(v.date)}</div>
        </div>
        {v.complaint && <p className="small mt-16"><b>Complaint:</b> {v.complaint}</p>}
        {v.diagnosis && <p className="small mt-8"><b>Diagnosis:</b> {v.diagnosis}</p>}
        {v.procedure_done && <p className="small mt-8"><b>Procedure:</b> {v.procedure_done}</p>}
        <div className="rx-symbol mt-24">℞</div>
        {v.items.length ? (
          <table>
            <thead><tr><th>#</th><th>Medicine</th><th>Dose</th><th>When</th><th>Duration</th></tr></thead>
            <tbody>
              {v.items.map((i, n) => (
                <tr key={i.id}>
                  <td>{n + 1}</td>
                  <td><b>{i.medicine}</b>{i.kind ? ` (${i.kind})` : ''}{i.instructions && <div style={{ color: '#555' }}>{i.instructions}</div>}</td>
                  <td>{i.dosage}</td><td>{i.frequency}</td><td>{i.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="small muted">No medicines prescribed.</p>}
        {v.advice && <div className="mt-24 small"><b>Advice</b><div className="pre mt-4">{v.advice}</div></div>}
        {v.follow_up_date && <p className="mt-24 small"><b>Next visit:</b> {fmtDateLong(v.follow_up_date)}</p>}
        <div style={{ marginTop: 60, textAlign: 'right' }} className="small">
          <div style={{ borderTop: '1px solid #999', display: 'inline-block', paddingTop: 6, minWidth: 200 }}>{v.doctor_name || settings.doctor_name}</div>
        </div>
      </div>
    </div>
  );
}
