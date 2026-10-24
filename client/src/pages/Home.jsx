import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, MapPin, Phone, MessageCircle } from 'lucide-react';
import { useApp, useLoad } from '../lib/store';
import { api } from '../lib/api';
import { catLabel, WEEKDAYS, fmtTime } from '../lib/format';
import { CAT_COLORS } from '../components/ui';
import Facade from '../components/Facade';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

const TREATMENTS = [
  { concern: 'skin', title: 'Clinical dermatology', text: 'Acne, pigmentation, eczema, allergies, nails and moles — diagnosed properly, treated patiently.' },
  { concern: 'hair', title: 'Hair & scalp', text: 'Hair fall, thinning, dandruff and alopecia. Blood work when it matters, PRP when it helps.' },
  { concern: 'procedure', title: 'Aesthetic medicine', text: 'Skin boosters, anti-ageing and subtle refinements. You should look rested, never “done”.' },
  { concern: 'procedure', title: 'Lasers & peels', text: 'Laser hair reduction, chemical peels, microneedling and acne-scar programmes.' },
  { concern: 'wellness', title: 'Skin wellness', text: 'A routine built for your skin and your climate — and the reasons behind every step.' },
];

const RITUAL = [
  { t: 'Consultation', d: 'Unhurried time with your doctor. The cause first, then the plan.' },
  { t: 'Your prescription, on your phone', d: 'Medicines, doses and advice are saved to your private record the moment you’re seen.' },
  { t: 'Collected downstairs', d: 'The pharmacy already has your prescription. Simply give your name.' },
  { t: 'A gentle reminder', d: 'We tell you when your follow-up is due — and you book it in a tap.' },
];

const MARQUEE = ['Clinical dermatology', 'Acne & scars', 'Hair restoration', 'Pigmentation', 'Laser', 'Chemical peels', 'Skin boosters', 'PRP', 'Medi-facials'];

export default function Home() {
  const { settings, clinic } = useApp();
  const nav = useNavigate();
  const { data } = useLoad(() => api('/articles'), []);
  const articles = data?.articles || [];
  const journal = [
    ...articles.filter((a) => a.category === 'procedures').slice(0, 2),
    ...articles.filter((a) => a.category === 'myths').slice(0, 1),
  ];
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
            <div className="eyebrow reveal">Dermatology · Aesthetic medicine{settings.city ? ` · ${settings.city}` : ''}</div>
            <h1 className="mt-24 reveal d1">The art of <em>healthy</em> skin.</h1>
            <p className="lead reveal d2">{settings.tagline}. Doctors who explain, prescriptions you keep on your phone, and a reminder when it’s time to return.</p>
            <div className="row wrap mt-32 reveal d3" style={{ gap: 14 }}>
              <Link to="/book" className="btn primary lg">Book a consultation</Link>
              <a href="#treatments" className="btn ghost lg">Treatments <ArrowRight size={16} /></a>
            </div>
          </div>
          <div className="facade-wrap reveal d2"><Facade name={brandWord} /></div>
        </div>
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="track">{[...MARQUEE, ...MARQUEE].map((t, i) => <span key={i}>{t}</span>)}</div>
      </div>

      {/* ---------- La maison ---------- */}
      <section className="lux-section">
        <div className="contain grid g-2" style={{ gap: 64, alignItems: 'start' }}>
          <div>
            <div className="eyebrow">La maison</div>
            <h2 className="lux-title mt-16">Medicine first.<br /><em>Beauty,</em> naturally.</h2>
          </div>
          <div className="stack gap-24">
            <p className="lux-lead">Behind a navy door is a clinic run by doctors, not salespeople. Every treatment starts with a diagnosis, every plan is explained in plain words, and nothing is recommended that your skin doesn’t need.</p>
            <div className="grid g-3 stats-3" style={{ gap: 0, borderTop: '1px solid var(--line-strong)' }}>
              {[['MD', 'Dermatologist-led'], ['1 : 1', 'Time with your doctor'], ['24/7', 'Your records, online']].map(([v, l]) => (
                <div key={l} style={{ padding: '20px 16px 0 0' }}>
                  <div className="serif" style={{ fontSize: 34, color: 'var(--brand)' }}>{v}</div>
                  <div className="small muted">{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Doctors ---------- */}
      {doctors.length > 0 && (
        <section className="lux-section" style={{ paddingTop: 0 }}>
          <div className="contain">
            <div className="row between wrap" style={{ marginBottom: 32 }}>
              <div>
                <div className="eyebrow">Your doctors</div>
                <h2 className="lux-title mt-16">In <em>expert</em> hands</h2>
              </div>
            </div>
            {doctors.map((d) => {
              const initial = d.name.replace(/^dr\.?\s+/i, '').trim()[0] || 'P';
              return (
                <div key={d.name} className="doctor">
                  <div className="arch">{initial}</div>
                  <div style={{ paddingTop: 8 }}>
                    <h3>{d.name}</h3>
                    <div className="eyebrow mt-8" style={{ color: 'var(--muted)', letterSpacing: '0.18em' }}>{d.cred}</div>
                    {d.bio && <p className="lux-lead mt-16" style={{ maxWidth: 560 }}>{d.bio}</p>}
                    <Link to="/book" className="link row gap-6 mt-24" style={{ fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Book with {d.name.split(' ').slice(0, 2).join(' ')} <ArrowRight size={14} /></Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ---------- Treatments ---------- */}
      <section className="lux-section" id="treatments" style={{ background: 'var(--surface-2)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="contain treat-grid">
          <div className="treat-intro">
            <div className="eyebrow">Treatments</div>
            <h2 className="lux-title mt-16">What brings you <em>in?</em></h2>
            <p className="lux-lead mt-16">Choose what’s closest. Your doctor takes it from there — there’s no wrong door.</p>
            <Link to="/learn?c=procedures" className="link row gap-6 mt-24" style={{ fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase' }}>What to expect from procedures <ArrowRight size={14} /></Link>
          </div>
          <div className="treatments">
            {TREATMENTS.map((t, i) => (
              <button key={t.title} className="treatment" onClick={() => nav(`/book?concern=${t.concern}`)}>
                <span className="no">{ROMAN[i]}.</span>
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
          <div className="eyebrow">The {brandWord.charAt(0) + brandWord.slice(1).toLowerCase()} way</div>
          <h2 className="lux-title mt-16" style={{ maxWidth: 720 }}>From your first visit to your next, <em>nothing is lost.</em></h2>
          <div className="grid g-4 keep-2 mt-32" style={{ gap: 28 }}>
            {RITUAL.map((r, i) => (
              <div key={r.t} className="ritual">
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
            <div className="row between wrap" style={{ alignItems: 'flex-end', marginBottom: 12 }}>
              <div>
                <div className="eyebrow">Le journal</div>
                <h2 className="lux-title mt-16">Straight answers, <em>no myths.</em></h2>
              </div>
              <Link to="/learn" className="link row gap-6" style={{ fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Read the journal <ArrowRight size={14} /></Link>
            </div>
            <div className="grid g-3" style={{ gap: 40 }}>
              {journal.map((a) => (
                <Link key={a.slug} to={`/learn/${a.slug}`} className="journal-card">
                  <div className="k">{catLabel(a.category)} · {a.read_minutes} min</div>
                  <h3>{a.title}</h3>
                  <p>{a.summary}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---------- Visit ---------- */}
      <section className="navy-band">
        <div className="awning" />
        <div className="contain lux-section grid g-2" style={{ gap: 64 }}>
          <div>
            <div className="eyebrow">Visit</div>
            <h2 className="lux-title mt-16">Behind the <em>navy door.</em></h2>
            <p className="lux-lead mt-16" style={{ maxWidth: 440 }}>Book online in under a minute — no account needed. Arrive ten minutes early, and bring any previous prescriptions.</p>
            <div className="row wrap mt-32" style={{ gap: 12 }}>
              <Link to="/book" className="btn light lg">Book a consultation</Link>
              {settings.maps_url && <a className="btn lg" href={settings.maps_url} target="_blank" rel="noreferrer">Directions</a>}
            </div>
            <div className="stack gap-8 mt-32" style={{ color: 'rgba(255,255,255,0.8)' }}>
              {settings.address && <div className="row top gap-6"><MapPin size={16} style={{ marginTop: 4 }} /><span>{settings.address}</span></div>}
              {settings.phone && <a className="row gap-6" href={`tel:${settings.phone}`}><Phone size={16} />{settings.phone}</a>}
              {settings.whatsapp && <a className="row gap-6" href={`https://wa.me/${settings.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"><MessageCircle size={16} />WhatsApp</a>}
            </div>
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Hours</div>
            <HoursTable hours={clinic?.hours || []} />
          </div>
        </div>
      </section>
    </>
  );
}

function HoursTable({ hours }) {
  return (
    <div className="hours-table">
      {[1, 2, 3, 4, 5, 6, 0].map((d) => {
        const w = hours.filter((h) => h.weekday === d);
        return (
          <div key={d} className="row between">
            <span className="serif" style={{ fontSize: 21, color: '#fff' }}>{WEEKDAYS[d]}</span>
            <span style={{ textAlign: 'right', color: w.length ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.45)', fontWeight: 300 }}>
              {w.length ? w.map((h) => `${fmtTime(h.start_time)} – ${fmtTime(h.end_time)}`).join(', ') : 'Closed'}
            </span>
          </div>
        );
      })}
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
