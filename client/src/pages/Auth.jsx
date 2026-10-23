import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Phone, Lock, UserRound, Mail } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../lib/store';
import { Button, Field, Logo, fieldErrors } from '../components/ui';

function AuthCard({ title, sub, children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div className="center" style={{ display: 'flex', justifyContent: 'center' }}><Logo /></div>
        <div className="card mt-24" style={{ padding: 28 }}>
          <h1 className="serif" style={{ fontSize: 30 }}>{title}</h1>
          {sub && <p className="muted mt-8">{sub}</p>}
          <div className="mt-24">{children}</div>
        </div>
        <p className="center small muted mt-16"><Link to="/" className="link">← Back to the website</Link></p>
      </div>
    </div>
  );
}

const landing = (user, next) => (user.role === 'patient' ? next || '/portal' : '/staff');

export function Login() {
  const { login } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { token, user } = await api('/auth/login', { method: 'POST', body: { phone, password } });
      login(token, user);
      nav(landing(user, params.get('next')), { replace: true });
    } catch (ex) {
      setError(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Welcome back" sub="Log in with your phone number to see your prescriptions and visits.">
      <form className="stack gap-16" onSubmit={submit}>
        <Field label="Phone number">
          <div className="input-icon"><Phone size={18} /><input className="input" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" required autoFocus /></div>
        </Field>
        <Field label="Password" error={error}>
          <div className="input-icon"><Lock size={18} /><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        </Field>
        <Button className="primary lg block" loading={busy}>Log in</Button>
        <p className="small muted center">Forgot your password, or the clinic created your record? Ask the reception for a temporary password.</p>
        <div className="divider" style={{ margin: '4px 0' }} />
        <p className="center small">New here? <Link className="link" to="/signup">Create an account</Link> · <Link className="link" to="/book">Book without one</Link></p>
      </form>
    </AuthCard>
  );
}

export function Signup() {
  const { login } = useApp();
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', phone: '', email: '', password: '' });
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
      const { token, user } = await api('/auth/signup', { method: 'POST', body: f });
      login(token, user);
      nav('/portal', { replace: true });
    } catch (ex) {
      setErrors(fieldErrors(ex));
      setError(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Create your account" sub="Keep your prescriptions, photos and follow-up dates in one place.">
      <form className="stack gap-16" onSubmit={submit}>
        {error && errors.phone && <div className="notice clay small">{error}</div>}
        <Field label="Full name" error={errors.name}>
          <div className="input-icon"><UserRound size={18} /><input className="input" value={f.name} onChange={set('name')} autoComplete="name" required autoFocus /></div>
        </Field>
        <Field label="Phone number" error={errors.phone && !error ? errors.phone : undefined}>
          <div className="input-icon"><Phone size={18} /><input className="input" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" placeholder="98765 43210" required /></div>
        </Field>
        <Field label="Email (optional)" hint="For prescriptions and reminders by email" error={errors.email}>
          <div className="input-icon"><Mail size={18} /><input className="input" type="email" value={f.email} onChange={set('email')} autoComplete="email" /></div>
        </Field>
        <Field label="Password" error={errors.password}>
          <div className="input-icon"><Lock size={18} /><input className="input" type="password" value={f.password} onChange={set('password')} autoComplete="new-password" placeholder="6+ characters" required /></div>
        </Field>
        {error && !Object.keys(errors).length && <div className="notice red small">{error}</div>}
        <Button className="primary lg block" loading={busy}>Create account</Button>
        <p className="center small">Already have one? <Link className="link" to="/login">Log in</Link></p>
      </form>
    </AuthCard>
  );
}
