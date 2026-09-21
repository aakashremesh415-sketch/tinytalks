import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

export default function Signup() {
  const [form, setForm] = useState({ email: '', password: '', displayName: '', genderClaimed: 'UNSPECIFIED' });
  const [photo, setPhoto] = useState(null);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (!ageConfirmed) return setError('Please confirm you are 18 or older.');
    if (!photo) return setError('A photo is required so we can verify your gender.');

    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      fd.append('ageConfirmed', 'true');
      fd.append('genderPhoto', photo);

      const { data } = await api.post('/auth/signup', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      login(data.token, data.user);
      navigate('/chat');
    } catch (e2) {
      setError(e2.response?.data?.error || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="card w-full max-w-md p-8">
        <div className="flex justify-center mb-6"><Logo /></div>
        <h1 className="font-display text-xl font-bold text-center">Create your account</h1>
        <p className="text-sm text-slate-400 text-center mt-1">
          Regular accounts go through gender verification, reviewed by our team.
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
            <label className="text-sm text-slate-300 mb-1 block">I identify as</label>
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

          <div>
            <label className="text-sm text-slate-300 mb-1 block">
              Verification photo <span className="text-slate-500">(reviewed by an admin, used only to confirm gender)</span>
            </label>
            <input
              className="input file:mr-3 file:btn-secondary file:!py-1 file:!px-3 file:border-0"
              type="file" accept="image/*" required
              onChange={(e) => setPhoto(e.target.files?.[0] || null)}
            />
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox" checked={ageConfirmed}
              onChange={(e) => setAgeConfirmed(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-white/20 bg-ink-800 text-violet-500 focus:ring-violet-500"
            />
            <span className="text-sm text-slate-300">
              I confirm I am 18 or older and agree to the{' '}
              <a href="/terms" className="text-violet-400 hover:underline">Terms &amp; Conditions</a>.
            </span>
          </label>

          {error && <p className="text-sm text-coral-400">{error}</p>}

          <button className="btn-primary w-full" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-sm text-slate-400 text-center mt-6">
          Already have an account? <Link to="/login" className="text-violet-400 hover:underline">Log in</Link>
        </p>
      </div>
    </div>
  );
}
