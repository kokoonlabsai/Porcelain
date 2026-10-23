import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Home, CalendarPlus, ClipboardList, CalendarDays, BookOpen, UserRound, LogOut, Users, Pill, CalendarClock, Settings, Newspaper, UserCog, LayoutDashboard, KeyRound, MapPin, Phone, MessageCircle,
} from 'lucide-react';
import { useApp } from '../lib/store';
import { api } from '../lib/api';
import { Logo, Button, Field, Modal, Toasts } from './ui';
import { WEEKDAYS, fmtTime } from '../lib/format';

export function PublicLayout() {
  const { user, isStaff, settings, clinic } = useApp();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  const home = user ? (isStaff ? '/staff' : '/portal') : null;
  return (
    <>
      <header className={`topbar ${scrolled ? 'scrolled' : ''}`}>
        <div className="contain">
          <Logo />
          <nav className="nav-links">
            <NavLink to="/" end>Home</NavLink>
            <NavLink to="/learn">Learn</NavLink>
            <NavLink to="/book">Book a visit</NavLink>
          </nav>
          <div className="grow" />
          {home ? (
            <Link className="btn primary sm" to={home}>{isStaff ? 'Clinic dashboard' : 'My portal'}</Link>
          ) : (
            <>
              <Link className="btn ghost sm" to="/login">Log in</Link>
              <Link className="btn primary sm hide-sm" to="/book">Book now</Link>
            </>
          )}
        </div>
      </header>
      <main><Outlet /></main>
      <footer className="footer">
        <div className="contain grid g-3">
          <div className="stack">
            <Logo />
            <p>{settings.tagline}</p>
          </div>
          <div className="stack gap-6">
            <div className="strong" style={{ color: 'var(--ink)' }}>Visit us</div>
            {settings.address && <div className="row top gap-6"><MapPin size={16} style={{ marginTop: 3 }} /><span>{settings.address}</span></div>}
            {settings.phone && <a className="row gap-6" href={`tel:${settings.phone}`}><Phone size={16} />{settings.phone}</a>}
            {settings.whatsapp && <a className="row gap-6" href={`https://wa.me/${settings.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"><MessageCircle size={16} />WhatsApp us</a>}
            {settings.maps_url && <a className="link" href={settings.maps_url} target="_blank" rel="noreferrer">Get directions</a>}
          </div>
          <div className="stack gap-6">
            <div className="strong" style={{ color: 'var(--ink)' }}>Opening hours</div>
            <Hours hours={clinic?.hours || []} />
          </div>
        </div>
        <div className="contain mt-24 tiny">© {new Date().getFullYear()} {settings.clinic_name}. Information on this site is educational and doesn’t replace a consultation. · <Link to="/login" className="link">Staff login</Link></div>
      </footer>
      <Toasts />
    </>
  );
}

/** Groups days with identical hours: "Mon – Fri  10:00 AM – 1:00 PM, 4:00 – 7:00 PM". */
export function Hours({ hours }) {
  const byDay = WEEKDAYS.map((_, d) => hours.filter((h) => h.weekday === d).map((h) => `${fmtTime(h.start_time)} – ${fmtTime(h.end_time)}`).join(', '));
  const order = [1, 2, 3, 4, 5, 6, 0];
  const groups = [];
  for (const d of order) {
    const last = groups[groups.length - 1];
    if (last && last.text === byDay[d]) last.days.push(d);
    else groups.push({ days: [d], text: byDay[d] });
  }
  return (
    <div className="stack gap-4 small">
      {groups.map((g) => (
        <div key={g.days[0]} className="row between top" style={{ gap: 16 }}>
          <span className="strong" style={{ color: 'var(--ink-2)' }}>{WEEKDAYS[g.days[0]].slice(0, 3)}{g.days.length > 1 ? ` – ${WEEKDAYS[g.days[g.days.length - 1]].slice(0, 3)}` : ''}</span>
          <span style={{ textAlign: 'right' }}>{g.text || 'Closed'}</span>
        </div>
      ))}
    </div>
  );
}

function ChangePasswordGate() {
  const { user, setUser, toast } = useApp();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (!user?.must_change_password) return null;
  const save = async (e) => {
    e.preventDefault();
    if (pw.length < 6) return setErr('Use at least 6 characters');
    if (pw !== pw2) return setErr('The two passwords don’t match');
    setBusy(true);
    try {
      const { user: u } = await api('/auth/me', { method: 'PATCH', body: { new_password: pw } });
      setUser(u);
      toast('Password saved');
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Choose your password" onClose={() => {}}>
      <form className="stack gap-16" onSubmit={save}>
        <div className="notice"><KeyRound size={18} /><div>You logged in with a temporary password. Pick one you’ll remember — you’ll use it with your phone number from now on.</div></div>
        <Field label="New password"><input className="input" type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
        <Field label="Type it again" error={err}><input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></Field>
        <Button className="primary block lg" loading={busy}>Save password</Button>
      </form>
    </Modal>
  );
}

function Shell({ links, tabs }) {
  const { user, logout } = useApp();
  const nav = useNavigate();
  const out = () => { logout(); nav('/'); };
  return (
    <div className="shell">
      <aside className="sidebar">
        <Logo />
        {links.map((l) => l.section
          ? <div key={l.section} className="side-label">{l.section}</div>
          : (
            <NavLink key={l.to} to={l.to} end={l.end} className="side-link">
              <l.icon size={19} />{l.label}{l.count ? <span className="count">{l.count}</span> : null}
            </NavLink>
          ))}
        <div className="grow" />
        <div className="row" style={{ padding: '10px 8px', borderTop: '1px solid var(--line)' }}>
          <div className="grow">
            <div className="strong small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
            <div className="tiny muted" style={{ textTransform: 'capitalize' }}>{user?.role === 'reception' ? 'Reception & pharmacy' : user?.role}</div>
          </div>
          <button className="btn ghost icon sm" onClick={out} title="Log out" aria-label="Log out"><LogOut size={17} /></button>
        </div>
      </aside>
      <div className="main">
        <div className="mobile-top">
          <Logo size={30} />
          <button className="btn ghost sm" onClick={out}><LogOut size={16} />Log out</button>
        </div>
        <Outlet />
      </div>
      <nav className="tabbar">
        {tabs.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end}>
            <l.icon size={21} />{l.short || l.label}{l.count ? <span className="dot">{l.count}</span> : null}
          </NavLink>
        ))}
      </nav>
      <ChangePasswordGate />
      <Toasts />
    </div>
  );
}

export function PortalLayout() {
  const links = [
    { to: '/portal', end: true, icon: Home, label: 'Home' },
    { to: '/portal/book', icon: CalendarPlus, label: 'Book a visit', short: 'Book' },
    { to: '/portal/visits', icon: ClipboardList, label: 'Prescriptions & visits', short: 'Visits' },
    { to: '/portal/appointments', icon: CalendarDays, label: 'Appointments', short: 'Bookings' },
    { to: '/portal/learn', icon: BookOpen, label: 'Learn' },
    { to: '/portal/profile', icon: UserRound, label: 'Profile' },
  ];
  return <Shell links={links} tabs={links.filter((l) => l.to !== '/portal/appointments')} />;
}

export function StaffLayout() {
  const { user } = useApp();
  const [pending, setPending] = useState(0);
  useEffect(() => {
    const load = () => api('/staff/dashboard').then((d) => setPending(d.pharmacy_pending)).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);
  const admin = user?.role === 'admin';
  const links = [
    { to: '/staff', end: true, icon: LayoutDashboard, label: 'Today' },
    { to: '/staff/appointments', icon: CalendarDays, label: 'Appointments', short: 'Calendar' },
    { to: '/staff/patients', icon: Users, label: 'Patients' },
    { to: '/staff/pharmacy', icon: Pill, label: 'Pharmacy', count: pending },
    ...(admin ? [
      { section: 'Admin' },
      { to: '/staff/schedule', icon: CalendarClock, label: 'Schedule & slots' },
      { to: '/staff/staff', icon: UserCog, label: 'Staff accounts' },
      { to: '/staff/articles', icon: Newspaper, label: 'Learn articles' },
      { to: '/staff/settings', icon: Settings, label: 'Clinic details' },
    ] : []),
  ];
  const tabs = links.filter((l) => !l.section).slice(0, 4);
  if (admin) tabs.push({ to: '/staff/more', icon: Settings, label: 'More' });
  return <Shell links={links} tabs={tabs} />;
}
