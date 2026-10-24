import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, MapPin, Phone, MessageCircle } from 'lucide-react';
import { useApp, useLoad } from '../lib/store';
import { api } from '../lib/api';
import { useReveal } from '../lib/reveal';
import { catLabel, WEEKDAYS, fmtTime } from '../lib/format';
import { CAT_COLORS } from '../components/ui';
import Facade from '../components/Facade';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

const TREATMENTS = [
  { concern: 'skin', title: 'Clinical dermatology', text: 'Acne, pigmentation, eczema, allergies' },
  { concern: 'hair', title: 'Hair & scalp', text: 'Hair fall, thinning, dandruff, PRP' },
  { concern: 'procedure', title: 'Aesthetic medicine', text: 'Skin boosters, anti-ageing, refinements' },
  { concern: 'procedure', title: 'Lasers & peels', text: 'Laser hair reduction, peels, scars' },
  { concern: 'wellness', title: 'Skin wellness', text: 'A routine made for your skin' },
];

const RITUAL = [
  { t: 'Consult', d: 'Unhurried time with your doctor.' },
  { t: 'Prescription', d: 'Saved to your phone, instantly.' },
  { t: 'Collect', d: 'Downstairs. Just give your name.' },
  { t: 'Return', d: 'We remind you when it’s time.' },
];

const MARQUEE = ['Clinical dermatology', 'Acne & scars', 'Hair restoration', 'Pigmentation', 'Laser', 'Chemical peels', 'Skin boosters', 'PRP', 'Medi-facials'];

/** Stagger for children revealed together. */
const delay = (i) => ({ transitionDelay: `${i * 90}ms` });

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
            <p className="lead reveal d3">Dermatology and aesthetic medicine, by doctors who explain.</p>
            <div className="row wrap reveal d3" style={{ gap: 14, marginTop: 44 }}>
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

      {/* ---------- La maison ---------- */}
      <section className="lux-section">
        <div className="contain center">
          <div className="eyebrow sr">La maison</div>
          <h2 className="lux-title mt-16 sr">Medicine first.<br /><em>Beauty,</em> naturally.</h2>
          <div className="stats-row mt-48">
            {[['MD', 'Dermatologist-led'], ['1 : 1', 'Time with your doctor'], ['24/7', 'Your records, online']].map(([v, l], i) => (
              <div key={l} className="sr" style={delay(i)}>
                <div className="stat-v">{v}</div>
                <div className="stat-l">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Doctors ---------- */}
      {doctors.length > 0 && (
        <section className="lux-section" style={{ paddingTop: 0 }}>
          <div className="contain">
            <div className="eyebrow sr">Your doctors</div>
            <h2 className="lux-title mt-16 sr">In <em>expert</em> hands</h2>
            <div className="doctor-grid mt-48">
              {doctors.map((d, i) => {
                const initial = d.name.replace(/^dr\.?\s+/i, '').trim()[0] || 'P';
                return (
                  <div key={d.name} className="doctor-card sr" style={delay(i)}>
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

      {/* ---------- Treatments ---------- */}
      <section className="lux-section tinted" id="treatments">
        <div className="contain treat-grid">
          <div className="treat-intro sr">
            <div className="eyebrow">Treatments</div>
            <h2 className="lux-title mt-16">What brings you <em>in?</em></h2>
            <p className="lux-lead mt-24">Pick one. We’ll take it from there.</p>
          </div>
          <div className="treatments">
            {TREATMENTS.map((t, i) => (
              <button key={t.title} className="treatment sr" style={delay(i)} onClick={() => nav(`/book?concern=${t.concern}`)}>
                <span className="no">{ROMAN[i]}</span>
                <span>
                  <h3>{t.title}</h3>
                  <p>{t.text}</p>
                </span>
                <ArrowUpRight className="go" size={22} />
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- The Porcelain way ---------- */}
      <section className="lux-section">
        <div className="contain">
          <div className="center">
            <div className="eyebrow sr">The {brandWord.charAt(0) + brandWord.slice(1).toLowerCase()} way</div>
            <h2 className="lux-title mt-16 sr">Nothing is <em>lost.</em></h2>
          </div>
          <div className="ritual-row mt-64">
            {RITUAL.map((r, i) => (
              <div key={r.t} className="ritual sr" style={delay(i)}>
                <div className="n">{ROMAN[i]}</div>
                <h3>{r.t}</h3>
                <p>{r.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Journal ---------- */}
      {journal.length > 0 && (
        <section className="lux-section" style={{ paddingTop: 0 }}>
          <div className="contain">
            <div className="row between wrap" style={{ alignItems: 'flex-end' }}>
              <div>
                <div className="eyebrow sr">Le journal</div>
                <h2 className="lux-title mt-16 sr">No <em>myths.</em></h2>
              </div>
              <Link to="/learn" className="caps-link sr">Read the journal <ArrowRight size={14} /></Link>
            </div>
            <div className="grid g-3 mt-48" style={{ gap: 40 }}>
              {journal.map((a, i) => (
                <Link key={a.slug} to={`/learn/${a.slug}`} className="journal-card sr" style={delay(i)}>
                  <div className="k">{catLabel(a.category)} · {a.read_minutes} min</div>
                  <h3>{a.title}</h3>
                  <span className="caps-link mt-16">Read <ArrowRight size={14} /></span>
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
            <div className="eyebrow">Visit</div>
            <h2 className="lux-title mt-16">Behind the <em>navy door.</em></h2>
            <p className="lux-lead mt-24">Book in under a minute. No account needed.</p>
            <div className="row wrap mt-32" style={{ gap: 12 }}>
              <Link to="/book" className="btn light lg">Book a consultation</Link>
              {settings.maps_url && <a className="btn lg" href={settings.maps_url} target="_blank" rel="noreferrer">Directions</a>}
            </div>
            <div className="stack gap-10 mt-32 visit-contact">
              {settings.address && <div className="row top gap-6"><MapPin size={16} style={{ marginTop: 4 }} /><span>{settings.address}</span></div>}
              {settings.phone && <a className="row gap-6" href={`tel:${settings.phone}`}><Phone size={16} />{settings.phone}</a>}
              {settings.whatsapp && <a className="row gap-6" href={`https://wa.me/${settings.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"><MessageCircle size={16} />WhatsApp</a>}
            </div>
          </div>
          <div className="sr" style={delay(1)}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Hours</div>
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
          <span className="serif" style={{ fontSize: 24, color: '#fff' }}>
            {WEEKDAYS[g.days[0]]}{g.days.length > 1 ? ` – ${WEEKDAYS[g.days[g.days.length - 1]]}` : ''}
          </span>
          <span className="pre" style={{ textAlign: 'right', color: g.text ? '#fff' : 'rgba(255,255,255,0.55)', lineHeight: 1.8 }}>{g.text || 'Closed'}</span>
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
