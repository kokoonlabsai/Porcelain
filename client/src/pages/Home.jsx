import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, MapPin, Phone, Mail, MessageCircle, Sparkles, FlaskConical, Leaf, Syringe, Zap, ScanFace, Stethoscope, MessagesSquare, ShieldCheck, Plus, Award } from 'lucide-react';
import { useApp, useLoad } from '../lib/store';
import { api } from '../lib/api';
import { useReveal } from '../lib/reveal';
import { catLabel, WEEKDAYS, fmtTime } from '../lib/format';
import { CAT_COLORS } from '../components/ui';
import Facade from '../components/Facade';
import CountUp from '../components/CountUp';

/** The clinic's six treatment categories, each opening booking for the closest concern. */
const TREATMENTS = [
  { concern: 'wellness', icon: Sparkles, title: 'Clinical facials', text: 'Medi-facials, HydraFacial, glow' },
  { concern: 'procedure', icon: FlaskConical, title: 'Clinical peels', text: 'Acne, pigmentation, texture' },
  { concern: 'hair', icon: Leaf, title: 'Hair', text: 'Hair fall, thinning, PRP' },
  { concern: 'procedure', icon: Syringe, title: 'Injectables', text: 'Botox, fillers, skin boosters' },
  { concern: 'procedure', icon: Zap, title: 'Lasers & tech', text: 'Laser hair reduction, resurfacing' },
  { concern: 'skin', icon: ScanFace, title: 'Corrective treatments', text: 'Scars, melasma, moles' },
];

const STEPS = [
  { t: 'Consult', d: 'Unhurried time with your doctor.' },
  { t: 'Prescription', d: 'On your phone, instantly.' },
  { t: 'Collect', d: 'Downstairs. Just give your name.' },
  { t: 'Return', d: 'We remind you when it’s time.' },
];

const PRINCIPLES = [
  { icon: Stethoscope, t: 'Evidence-based', d: 'Scientifically sound care for clinical and aesthetic concerns.' },
  { icon: MessagesSquare, t: 'Subtle, yet substantial', d: 'Minimally invasive tweakments. Nothing is ever overdone.' },
  { icon: ShieldCheck, t: 'Global standards', d: 'Lasers and equipment at par with New York, London and Paris.' },
];

const FAQ = [
  { q: 'How long is a consultation?', a: 'Plan for 20–30 minutes with the doctor. Procedures take longer — we’ll tell you when you book.' },
  { q: 'Do I need an account to book?', a: 'No. Your name and phone number are enough. Set a password after booking to see your prescriptions online.' },
  { q: 'What should I bring?', a: 'Any previous prescriptions, reports or the products you use. Photos of a rash that comes and goes help too.' },
  { q: 'Where do I get my medicines?', a: 'From our pharmacy desk, right after your visit. Your prescription is already there — just give your name.' },
  { q: 'Will I get my prescription in writing?', a: 'Yes — on your phone in your patient portal, by email if you share one, and printed if you like.' },
  { q: 'How do follow-ups work?', a: 'The doctor sets your next-visit date. You’ll see it in your portal and get a reminder a few days before.' },
];

/** "2000+ | Patients treated" lines from clinic settings. A leading number counts up; anything else shows as is. */
function parseHighlights(text = '') {
  return text.split('\n').map((line) => line.split('|').map((p) => p.trim())).filter(([v, l]) => v && l).map(([value, label]) => {
    const m = /^(\d+)(.*)$/.exec(value);
    return m ? { label, to: Number(m[1]), suffix: m[2] } : { label, text: value };
  });
}

const MARQUEE = ['Clinical facials', 'Clinical peels', 'Hair', 'Injectables', 'Lasers & tech', 'Corrective treatments', 'Acne & scars', 'Pigmentation', 'Skin boosters'];

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
    { name: settings.doctor_name, role: settings.doctor_role, cred: settings.doctor_credentials, exp: settings.doctor_experience, bio: settings.doctor_bio, tags: settings.doctor_tags, awards: settings.doctor_awards },
    { name: settings.doctor2_name, role: settings.doctor2_role, cred: settings.doctor2_credentials, exp: settings.doctor2_experience, bio: settings.doctor2_bio, tags: settings.doctor2_tags, awards: settings.doctor2_awards },
  ].filter((d) => d.name);
  const highlights = parseHighlights(settings.highlights);

  return (
    <>
      {/* ---------- Hero ---------- */}
      <section className="lux-hero">
        <div className="contain grid g-2 hero-grid">
          <div className="hero-copy">
            <div className="eyebrow reveal">Skin · Hair · Wellness{settings.city ? ` · ${settings.city}` : ''}</div>
            <h1 className="mt-24">
              <span className="word reveal d1">The art of</span>{' '}
              <span className="word reveal d2"><em>healthy</em> skin.</span>
            </h1>
            <p className="lead reveal d3">Evidence-based dermatology and aesthetics. Subtle, yet substantial results.</p>
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

      {/* ---------- Why Porcelain: principles + highlights ---------- */}
      <section className="lux-section">
        <div className="contain why-grid">
          <div>
            <div className="eyebrow sr">Why {brandWord.charAt(0) + brandWord.slice(1).toLowerCase()}</div>
            <h2 className="big-statement mt-16 sr">Medicine first.<br /><em>Beauty,</em> naturally.</h2>
            <p className="sub sr">Aesthetic medicine is as much an art as a science. Nothing is ever overdone — yet every feature is taken into account.</p>
            <div className="principles mt-48">
              {PRINCIPLES.map((p, i) => (
                <div key={p.t} className="principle sr" style={delay(i, 100)}>
                  <span className="principle-ico"><p.icon size={22} strokeWidth={1.7} /></span>
                  <div>
                    <div className="principle-t">{p.t}</div>
                    <div className="principle-d">{p.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {highlights.length > 0 && (
            <div className="highlights sr">
              {highlights.map((h) => (
                <div key={h.label} className="highlight">
                  <div className="v">{h.text ?? <CountUp to={h.to} suffix={h.suffix} />}</div>
                  <div className="l">{h.label}</div>
                </div>
              ))}
            </div>
          )}
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
        <section className="lux-section doctors-band">
          <div className="contain">
            <div className="section-intro">
              <div className="eyebrow sr">Your doctors</div>
              <h2 className="big-statement mt-16 sr">In <em>expert</em> hands.</h2>
              <p className="sub sr">{doctors.length === 2 ? 'A dynamic duo bringing global standards of care to Bhopal.' : 'Specialist care, from consultation to follow-up.'}</p>
            </div>
            <div className="doctor-grid mt-48">
              {doctors.map((d, i) => {
                const initial = d.name.replace(/^dr\.?\s+/i, '').trim()[0] || 'P';
                return (
                  <div key={d.name} className="doctor-card sr" style={delay(i, 120)}>
                    <div className="arch">{initial}</div>
                    {d.exp && <div className="doc-exp">{d.exp}</div>}
                    <h3>{d.name}</h3>
                    {d.role && <div className="doc-role">{d.role}</div>}
                    <div className="cred">{d.cred}</div>
                    {d.bio && <p>{d.bio}</p>}
                    {d.tags && (
                      <div className="doc-tags">
                        {d.tags.split(/\s*[·,]\s*/).filter(Boolean).map((t) => <span key={t}>{t}</span>)}
                      </div>
                    )}
                    {d.awards && (
                      <ul className="doc-awards">
                        {d.awards.split('\n').map((a) => a.trim()).filter(Boolean).map((a) => <li key={a}><Award size={16} />{a}</li>)}
                      </ul>
                    )}
                    <Link to="/book" className="caps-link mt-24">Book a visit <ArrowRight size={14} /></Link>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ---------- Message from the founders ---------- */}
      {settings.founders_quote && (
        <section className="lux-section quote-section">
          <div className="contain center">
            <div className="eyebrow sr">A message from our founders</div>
            <blockquote className="founders-quote sr">“{settings.founders_quote}”</blockquote>
            <div className="quote-by sr">{doctors.map((d) => d.name).join(' & ')}</div>
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

      {/* ---------- First visit FAQ ---------- */}
      <section className="lux-section">
        <div className="contain faq-grid">
          <div>
            <h2 className="big-statement sr">Your first <em>visit.</em></h2>
            <p className="sub sr">Everything people ask before they come in.</p>
            <Link to="/book" className="btn primary lg mt-32 sr">Book a consultation</Link>
          </div>
          <div className="faq">
            {FAQ.map((f, i) => (
              <details key={f.q} className="faq-item sr" style={delay(i, 60)} open={i === 0}>
                <summary>{f.q}<Plus className="faq-plus" size={22} /></summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Journal ---------- */}
      {journal.length > 0 && (
        <section className="lux-section tinted">
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
              {settings.phone && <a className="row gap-6" href={`tel:${settings.phone.replace(/[^\d+]/g, '')}`}><Phone size={18} />{settings.phone}</a>}
              {settings.email && <a className="row gap-6" href={`mailto:${settings.email}`}><Mail size={18} />{settings.email}</a>}
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
