import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { getErrorMessage, api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

export default function Signup() {
  const [form, setForm] = useState({ email: '', password: '', displayName: '', genderClaimed: 'UNSPECIFIED' });
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (!ageConfirmed) return setError('Please confirm you are 18 or older.');

    setLoading(true);
    try {
      const { data } = await api.post('/auth/signup', { ...form, ageConfirmed: true });
      login(data.token, data.user);
      // The gender-verification photo is a separate step now, so it can
      // be taken with a phone camera or laptop webcam right after the
      // account exists, rather than blocking this form on it.
      navigate('/verify-gender');
    } catch (e2) {
      setError(getErrorMessage(e2));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 relative">
      <div className="absolute top-6 right-6"><ThemeToggle /></div>
      <div className="card w-full max-w-md p-8">
        <div className="flex justify-center mb-6"><Logo /></div>
        <h1 className="font-display text-xl font-bold text-center">Create your account</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center mt-1">
          Right after this, you'll submit a quick photo for gender verification —
          upload one or use your camera.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <input
            className="input" placeholder="Display name" value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          />
          <input
            className="input" type="email" placeholder="Email" required value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            className="input" type="password" placeholder="Password" required value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />

          <div>
            <label className="text-sm text-slate-600 dark:text-slate-300 mb-1 block">I identify as</label>
            <select
              className="input" value={form.genderClaimed}
              onChange={(e) => setForm({ ...form, genderClaimed: e.target.value })}
            >
              <option value="UNSPECIFIED">Prefer not to say</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="NONBINARY">Non-binary</option>
            </select>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox" checked={ageConfirmed}
              onChange={(e) => setAgeConfirmed(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 dark:border-white/20 bg-slate-100 dark:bg-ink-800 text-violet-500 focus:ring-violet-500"
            />
            <span className="text-sm text-slate-600 dark:text-slate-300">
              I confirm I am 18 or older and agree to the{' '}
              <a href="/terms" className="text-violet-400 hover:underline">Terms &amp; Conditions</a>.
            </span>
          </label>

          {error && <p className="text-sm text-coral-400">{error}</p>}

          <button className="btn-primary w-full" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-sm text-slate-500 dark:text-slate-400 text-center mt-6">
          Already have an account? <Link to="/login" className="text-violet-400 hover:underline">Log in</Link>
        </p>
      </div>
    </div>
  );
}
