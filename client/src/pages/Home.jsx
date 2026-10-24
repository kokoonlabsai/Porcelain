import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, MapPin, Phone, MessageCircle, Droplets, Leaf, Syringe, Zap, Sun, HelpCircle } from 'lucide-react';
import { useApp, useLoad } from '../lib/store';
import { api } from '../lib/api';
import { useReveal } from '../lib/reveal';
import { catLabel, WEEKDAYS, fmtTime } from '../lib/format';
import { CAT_COLORS } from '../components/ui';
import Facade from '../components/Facade';
import CountUp from '../components/CountUp';

const TREATMENTS = [
  { concern: 'skin', icon: Droplets, title: 'Skin', text: 'Acne, pigmentation, allergies' },
  { concern: 'hair', icon: Leaf, title: 'Hair', text: 'Hair fall, thinning, scalp' },
  { concern: 'procedure', icon: Syringe, title: 'Aesthetics', text: 'Boosters, anti-ageing' },
  { concern: 'procedure', icon: Zap, title: 'Lasers & peels', text: 'Hair reduction, scars' },
  { concern: 'wellness', icon: Sun, title: 'Skin wellness', text: 'Your routine, done right' },
  { concern: 'other', icon: HelpCircle, title: 'Not sure?', text: 'Just tell the doctor' },
];

const STEPS = [
  { t: 'Consult', d: 'Unhurried time with your doctor.' },
  { t: 'Prescription', d: 'On your phone, instantly.' },
  { t: 'Collect', d: 'Downstairs. Just give your name.' },
  { t: 'Return', d: 'We remind you when it’s time.' },
];

const STATS = [
  { to: 2, suffix: '', label: 'Specialist doctors' },
  { to: 1, suffix: ' min', label: 'To book online' },
  { to: 24, suffix: '/7', label: 'Your records, online' },
  { to: 0, suffix: '', label: 'Lost prescriptions' },
];

const MARQUEE = ['Clinical dermatology', 'Acne & scars', 'Hair restoration', 'Pigmentation', 'Laser', 'Chemical peels', 'Skin boosters', 'PRP', 'Medi-facials'];

/** Stagger for children revealed together. */
const delay = (i, step = 80) => ({ transitionDelay: `${i * step}ms` });

export default function Home() {
  const { settings, clinic } = useApp();
  const nav = useNavigate();
  const { data } = useLoad(() => api('/articles'), []);
  const articles = data?.articles || [];
  const journal = [
    ...articles.filter((a) => a.category === 'procedures').slice(0, 2),
    ...articles.filter((a) => a.category === 'myths').slice(0, 1),
  ];
  useReveal();
  const brandWord = (settings.clinic_name || 'Porcelain').split(/\s+/)[0].toUpperCase();
  const doctors = [
    { name: settings.doctor_name, cred: settings.doctor_credentials, bio: settings.doctor_bio },
    { name: settings.doctor2_name, cred: settings.doctor2_credentials, bio: settings.doctor2_bio },
  ].filter((d) => d.name);
  const stats = STATS.map((s) => (s.label === 'Specialist doctors' ? { ...s, to: doctors.length || 1, label: doctors.length === 1 ? 'Specialist doctor' : s.label } : s));

  return (
    <>
      {/* ---------- Hero ---------- */}
      <section className="lux-hero">
        <div className="contain grid g-2 hero-grid">
          <div className="hero-copy">
            <div className="eyebrow reveal">{settings.clinic_name}{settings.city ? ` · ${settings.city}` : ''}</div>
            <h1 className="mt-24">
              <span className="word reveal d1">The art of</span>{' '}
              <span className="word reveal d2"><em>healthy</em> skin.</span>
            </h1>
            <p className="lead reveal d3">Dermatology and aesthetics, by doctors who explain.</p>
            <div className="row wrap reveal d3" style={{ gap: 14, marginTop: 40 }}>
              <Link to="/book" className="btn primary lg">Book a consultation</Link>
              <a href="#treatments" className="btn ghost lg">Treatments <ArrowRight size={16} /></a>
            </div>
          </div>
          <div className="facade-wrap"><Facade name={brandWord} /></div>
        </div>
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="track">{[...MARQUEE, ...MARQUEE].map((t, i) => <span key={i}>{t}</span>)}</div>
      </div>

      {/* ---------- Statement + big numbers ---------- */}
      <section className="lux-section">
        <div className="contain">
          <h2 className="big-statement sr">Medicine first.<br /><em>Beauty,</em> naturally.</h2>
          <div className="numbers mt-64">
            {stats.map((s, i) => (
              <div key={s.label} className="number sr" style={delay(i)}>
                <div className="v"><CountUp to={s.to} suffix={s.suffix} /></div>
                <div className="l">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Treatments: icon grid ---------- */}
      <section className="lux-section tinted" id="treatments">
        <div className="contain">
          <div className="section-intro">
            <h2 className="big-statement sr">What brings you <em>in?</em></h2>
            <p className="sub sr">Tap one to book.</p>
          </div>
          <div className="tile-grid mt-48">
            {TREATMENTS.map((t, i) => (
              <button key={t.title} className="tile sr" style={delay(i, 70)} onClick={() => nav(`/book?concern=${t.concern}`)}>
                <span className="tile-ico"><t.icon size={30} strokeWidth={1.6} /></span>
                <span className="tile-title">{t.title}</span>
                <span className="tile-text">{t.text}</span>
                <ArrowUpRight className="tile-go" size={20} />
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Doctors ---------- */}
      {doctors.length > 0 && (
        <section className="lux-section">
          <div className="contain">
            <div className="section-intro">
              <h2 className="big-statement sr">In <em>expert</em> hands.</h2>
            </div>
            <div className="doctor-grid mt-48">
              {doctors.map((d, i) => {
                const initial = d.name.replace(/^dr\.?\s+/i, '').trim()[0] || 'P';
                return (
                  <div key={d.name} className="doctor-card sr" style={delay(i, 120)}>
                    <div className="arch">{initial}</div>
                    <h3>{d.name}</h3>
                    <div className="cred">{d.cred}</div>
                    {d.bio && <p>{d.bio}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ---------- Steps ---------- */}
      <section className="lux-section tinted">
        <div className="contain">
          <div className="section-intro">
            <h2 className="big-statement sr">Nothing is <em>lost.</em></h2>
            <p className="sub sr">From your first visit to your next.</p>
          </div>
          <div className="steps-row mt-64 sr">
            <div className="steps-line" />
            {STEPS.map((s, i) => (
              <div key={s.t} className="step-big" style={delay(i, 160)}>
                <div className="n">0{i + 1}</div>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Journal ---------- */}
      {journal.length > 0 && (
        <section className="lux-section">
          <div className="contain">
            <div className="row between wrap" style={{ alignItems: 'flex-end', gap: 24 }}>
              <h2 className="big-statement sr" style={{ margin: 0 }}>No <em>myths.</em></h2>
              <Link to="/learn" className="caps-link sr">All articles <ArrowRight size={14} /></Link>
            </div>
            <div className="grid g-3 mt-48" style={{ gap: 24 }}>
              {journal.map((a, i) => (
                <Link key={a.slug} to={`/learn/${a.slug}`} className="journal-tile sr" style={delay(i, 100)}>
                  <span className="k">{catLabel(a.category)} · {a.read_minutes} min</span>
                  <h3>{a.title}</h3>
                  <span className="caps-link">Read <ArrowRight size={14} /></span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---------- Visit ---------- */}
      <section className="navy-band">
        <div className="awning" />
        <div className="lux-section"><div className="contain grid g-2" style={{ gap: 72 }}>
          <div className="sr">
            <h2 className="big-statement">Behind the <em>navy door.</em></h2>
            <p className="sub">Book in a minute. No account needed.</p>
            <div className="row wrap mt-32" style={{ gap: 12 }}>
              <Link to="/book" className="btn light lg">Book a consultation</Link>
              {settings.maps_url && <a className="btn lg" href={settings.maps_url} target="_blank" rel="noreferrer">Directions</a>}
            </div>
            <div className="stack gap-10 mt-32 visit-contact">
              {settings.address && <div className="row top gap-6"><MapPin size={18} style={{ marginTop: 3 }} /><span>{settings.address}</span></div>}
              {settings.phone && <a className="row gap-6" href={`tel:${settings.phone}`}><Phone size={18} />{settings.phone}</a>}
              {settings.whatsapp && <a className="row gap-6" href={`https://wa.me/${settings.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"><MessageCircle size={18} />WhatsApp</a>}
            </div>
          </div>
          <div className="sr" style={delay(1)}>
            <div className="hours-label">Open</div>
            <HoursTable hours={clinic?.hours || []} />
          </div>
        </div></div>
      </section>
    </>
  );
}

/** Days with the same hours are grouped: "Monday – Saturday". */
function HoursTable({ hours }) {
  const text = (d) => hours.filter((h) => h.weekday === d).map((h) => `${fmtTime(h.start_time)} – ${fmtTime(h.end_time)}`).join('\n');
  const groups = [];
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    const last = groups[groups.length - 1];
    if (last && last.text === text(d)) last.days.push(d);
    else groups.push({ days: [d], text: text(d) });
  }
  return (
    <div className="hours-table">
      {groups.map((g) => (
        <div key={g.days[0]} className="row between top">
          <span className="day">
            {WEEKDAYS[g.days[0]].slice(0, 3)}{g.days.length > 1 ? ` – ${WEEKDAYS[g.days[g.days.length - 1]].slice(0, 3)}` : ''}
          </span>
          <span className="pre time" style={!g.text ? { opacity: 0.55 } : undefined}>{g.text || 'Closed'}</span>
        </div>
      ))}
    </div>
  );
}

export function ArticleCard({ a, base = '/learn' }) {
  return (
    <Link to={`${base}/${a.slug}`} className="article-card">
      <div className="row between">
        <span className="cover" style={{ background: CAT_COLORS[a.category] }} />
        <span className="tiny muted" style={{ letterSpacing: '0.18em', textTransform: 'uppercase' }}>{catLabel(a.category)} · {a.read_minutes} min</span>
      </div>
      <h3>{a.title}</h3>
      <p className="small muted">{a.summary}</p>
    </Link>
  );
}
