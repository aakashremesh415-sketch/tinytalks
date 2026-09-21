import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { getErrorMessage, api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/login', { email, password });
      login(data.token, data.user);
      if (data.user.accountType === 'ADMIN') navigate('/admin');
      else if (data.user.accountType === 'REGULAR' && data.user.genderVerification === 'NONE') navigate('/verify-gender');
      else navigate('/chat');
    } catch (e2) {
      setError(getErrorMessage(e2, 'Invalid credentials.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 relative">
      <div className="absolute top-6 right-6"><ThemeToggle /></div>
      <div className="card w-full max-w-sm p-8">
        <div className="flex justify-center mb-6"><Logo /></div>
        <h1 className="font-display text-xl font-bold text-center">Log in</h1>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <input className="input" type="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="input" type="password" placeholder="Password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="text-sm text-coral-400">{error}</p>}
          <button className="btn-primary w-full" disabled={loading}>{loading ? 'Logging in…' : 'Log in'}</button>
        </form>
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center mt-6">
          No account? <Link to="/signup" className="text-violet-400 hover:underline">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
