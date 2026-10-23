import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarCheck2, Stethoscope, Smartphone, BellRing, Pill, ShieldCheck, Star } from 'lucide-react';
import { useApp, useLoad } from '../lib/store';
import { api } from '../lib/api';
import { CONCERNS, catLabel } from '../lib/format';
import { ConcernIcon, CAT_COLORS } from '../components/ui';
import { Hours } from '../components/Layouts';

export default function Home() {
  const { settings, clinic } = useApp();
  const nav = useNavigate();
  const { data } = useLoad(() => api('/articles'), []);
  const articles = data?.articles || [];
  const myths = articles.filter((a) => a.category === 'myths').slice(0, 3);
  const procedures = articles.filter((a) => a.category === 'procedures').slice(0, 6);

  return (
    <>
      <section className="hero">
        <div className="contain grid g-2" style={{ gap: 40, alignItems: 'center' }}>
          <div className="fade-in">
            <div className="eyebrow">{settings.doctor_name} · {settings.doctor_credentials}</div>
            <h1 className="mt-12">Healthy skin and hair, <em>explained</em> and cared for.</h1>
            <p className="lead">{settings.tagline}. Book in under a minute, get your prescription on your phone, and we’ll remind you when it’s time to come back.</p>
            <div className="row wrap mt-24">
              <Link to="/book" className="btn primary lg">Book an appointment <ArrowRight size={18} /></Link>
              <Link to="/learn" className="btn lg">Read our guides</Link>
            </div>
            <div className="row wrap mt-24 small muted gap-16">
              <span className="row gap-6"><ShieldCheck size={16} color="var(--brand)" />Your records stay private</span>
              <span className="row gap-6"><Smartphone size={16} color="var(--brand)" />No app download needed</span>
            </div>
          </div>
          <div className="hero-art fade-in" aria-hidden="true">
            <svg viewBox="0 0 400 420" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid slice">
              <circle cx="210" cy="200" r="120" fill="#F7F1E8" />
              <path d="M210 110c-34 38-58 70-58 101a58 58 0 0 0 116 0c0-31-24-63-58-101Z" fill="#2F5D50" opacity=".9" />
              <path d="M210 160v100M210 200l-22-18M210 226l22-18" stroke="#F7F1E8" strokeWidth="7" strokeLinecap="round" fill="none" />
              <circle cx="96" cy="96" r="26" fill="#C9785D" opacity=".25" />
              <circle cx="330" cy="330" r="40" fill="#2F5D50" opacity=".12" />
            </svg>
            <div className="float" style={{ top: 28, left: 22 }}>
              <div className="row"><CalendarCheck2 size={20} color="var(--brand)" /><div><div className="tiny muted">Next visit</div><div className="strong small">Tomorrow · 11:30 AM</div></div></div>
            </div>
            <div className="float" style={{ bottom: 92, right: 18 }}>
              <div className="row"><Pill size={20} color="var(--clay)" /><div><div className="tiny muted">Prescription</div><div className="strong small">Ready to collect</div></div></div>
            </div>
            <div className="float" style={{ bottom: 22, left: 30 }}>
              <div className="row"><BellRing size={20} color="var(--sun)" /><div><div className="tiny muted">Reminder</div><div className="strong small">Follow-up due in 3 days</div></div></div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 24 }}>
        <div className="contain">
          <div className="section-head"><h2>What brings you in?</h2></div>
          <div className="grid g-4">
            {CONCERNS.filter((c) => c.id !== 'other').map((c) => (
              <button key={c.id} className="concern-card" onClick={() => nav(`/book?concern=${c.id}`)}>
                <ConcernIcon concern={c.id} />
                <h3>{c.label}</h3>
                <p className="small muted">{c.hint}</p>
                <span className="link small row gap-4">Book for {c.label.toLowerCase()} <ArrowRight size={14} /></span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ background: 'var(--surface-2)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="contain">
          <div className="section-head"><div><div className="eyebrow">How it works</div><h2 className="mt-8">From booking to follow-up, on your phone</h2></div></div>
          <div className="grid g-4 steps">
            {[
              { icon: CalendarCheck2, t: 'Book a slot', d: 'Pick a time that suits you. No account needed — just your name and number.' },
              { icon: Stethoscope, t: 'See the doctor', d: 'A proper consultation. Your prescription and any photos are saved to your record.' },
              { icon: Pill, t: 'Collect medicines', d: 'The pharmacy desk already has your prescription. Just tell them your name.' },
              { icon: BellRing, t: 'Come back on time', d: 'Your next visit date is in your portal, and we remind you before it’s due.' },
            ].map((s, i) => (
              <div key={s.t} className="step">
                <div className="row between"><span className="n">0{i + 1}</span><s.icon size={22} color="var(--brand)" /></div>
                <h3 className="mt-8" style={{ fontSize: 17 }}>{s.t}</h3>
                <p className="small muted mt-4">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {procedures.length > 0 && (
        <section className="section">
          <div className="contain">
            <div className="section-head">
              <div><div className="eyebrow">Procedures</div><h2 className="mt-8">Know what to expect</h2></div>
              <Link to="/learn?c=procedures" className="link row gap-4">All procedures <ArrowRight size={15} /></Link>
            </div>
            <div className="grid g-3">{procedures.map((a) => <ArticleCard key={a.slug} a={a} />)}</div>
          </div>
        </section>
      )}

      {myths.length > 0 && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="contain">
            <div className="card" style={{ background: 'var(--clay-soft)', border: 0, padding: 32 }}>
              <div className="section-head" style={{ marginBottom: 16 }}>
                <div><div className="eyebrow" style={{ color: '#9c4f36' }}>Myth or fact?</div><h2 className="mt-8">Let’s bust a few myths</h2></div>
                <Link to="/learn?c=myths" className="link row gap-4">See all <ArrowRight size={15} /></Link>
              </div>
              <div className="grid g-3">{myths.map((a) => <ArticleCard key={a.slug} a={a} />)}</div>
            </div>
          </div>
        </section>
      )}

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="contain grid g-2" style={{ alignItems: 'stretch' }}>
          <div className="card" style={{ padding: 30 }}>
            <div className="row gap-6" style={{ color: 'var(--sun)' }}>{[0, 1, 2, 3, 4].map((i) => <Star key={i} size={18} fill="currentColor" />)}</div>
            <h2 className="serif mt-12" style={{ fontSize: 30 }}>Care that explains itself</h2>
            <p className="muted mt-12">Every visit ends with a clear plan: what you have, what to use and how, and when to come back. It’s all saved in your portal, so you never lose a prescription slip again.</p>
            <div className="row wrap mt-24">
              <Link to="/book" className="btn primary">Book a visit</Link>
              <Link to="/signup" className="btn">Create your account</Link>
            </div>
          </div>
          <div className="card" style={{ padding: 30 }}>
            <div className="card-title">Opening hours</div>
            <div className="mt-16"><Hours hours={clinic?.hours || []} /></div>
            {settings.address && <p className="small muted mt-16">{settings.address}</p>}
          </div>
        </div>
      </section>
    </>
  );
}

export function ArticleCard({ a, base = '/learn' }) {
  return (
    <Link to={`${base}/${a.slug}`} className="article-card">
      <div className="row between">
        <span className="cover" style={{ background: CAT_COLORS[a.category] }} />
        <span className="tiny muted strong">{catLabel(a.category)} · {a.read_minutes} min</span>
      </div>
      <h3>{a.title}</h3>
      <p className="small muted">{a.summary}</p>
    </Link>
  );
}
