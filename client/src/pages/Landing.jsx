import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

export default function Landing() {
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  async function continueAsGuest() {
    if (!ageConfirmed) {
      setError('Please confirm you are 18 or older to continue.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/guest', { ageConfirmed: true });
      login(data.token, data.user);
      navigate('/chat');
    } catch (e) {
      setError(e.response?.data?.error || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="max-w-5xl w-full mx-auto px-6 py-6 flex items-center justify-between">
        <Logo />
        <nav className="flex items-center gap-3 text-sm">
          <a href="/login" className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors">Log in</a>
          <a href="/signup" className="btn-secondary !py-1.5 !px-4">Create account</a>
          <ThemeToggle />
        </nav>
      </header>

      <main className="flex-1 flex items-center">
        <div className="max-w-5xl w-full mx-auto px-6 grid md:grid-cols-2 gap-12 items-center py-12">
          <div>
            <h1 className="font-display text-4xl sm:text-5xl font-extrabold leading-tight">
              Talk to someone new.
              <span className="block bg-brand-gradient bg-clip-text text-transparent">
                Encrypted. Anonymous. Real.
              </span>
            </h1>
            <p className="mt-5 text-slate-500 dark:text-slate-400 text-lg max-w-md">
              tinytalks connects you with a random stranger for a private,
              end-to-end encrypted conversation — no account required to start.
            </p>

            <div className="mt-8 card p-5 max-w-sm">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ageConfirmed}
                  onChange={(e) => setAgeConfirmed(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 dark:border-white/20 bg-slate-100 dark:bg-ink-800 text-violet-500 focus:ring-violet-500"
                />
                <span className="text-sm text-slate-600 dark:text-slate-300">
                  I confirm that I am <strong className="text-slate-900 dark:text-slate-100">18 years of age or older</strong>,
                  and I agree to the{' '}
                  <a href="/terms" className="text-violet-400 hover:underline">Terms &amp; Conditions</a>.
                </span>
              </label>

              {error && <p className="mt-3 text-sm text-coral-400">{error}</p>}

              <button
                onClick={continueAsGuest}
                disabled={loading}
                className="btn-primary w-full mt-4"
              >
                {loading ? 'Starting…' : 'Start chatting as a guest'}
              </button>
              <p className="mt-2 text-xs text-slate-500">
                Guest sessions and their data are permanently deleted after 2 days.
                Image sharing requires a quick one-time verification.
              </p>
            </div>
          </div>

          <div className="hidden md:block">
            <FeatureList />
          </div>
        </div>
      </main>
    </div>
  );
}

function FeatureList() {
  const items = [
    { title: 'End-to-end encrypted', body: 'Messages are encrypted on your device — we cannot read them, ever.' },
    { title: 'Gender filter', body: 'Match with the gender you prefer. Free for early users.' },
    { title: 'Verified, safer images', body: 'Self-destructing photo sharing, unlocked only after a quick age check — no ID required.' },
    { title: 'Real moderation', body: 'Reports go to a real review queue with clear categories, not a black box.' },
  ];
  return (
    <div className="space-y-4">
      {items.map((it) => (
        <div key={it.title} className="card p-4">
          <p className="font-display font-semibold text-slate-900 dark:text-slate-100">{it.title}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{it.body}</p>
        </div>
      ))}
    </div>
  );
}
