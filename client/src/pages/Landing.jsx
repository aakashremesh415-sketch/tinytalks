import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import LandingSeoContent from '../content/LandingSeoContent.jsx';
import { buildLandingJsonLd } from '../content/seoJsonLd.js';
import { useSeo } from '../lib/seo.js';
import { getErrorMessage, api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

const TITLE = 'tinytalks.live — Free Random Chat App | Talk to Strangers Anonymously';
const DESCRIPTION =
  'tinytalks is a free random chat app for anonymous conversations with real strangers. No account required — start chatting as a guest in seconds.';

export default function Landing() {
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  useSeo({ title: TITLE, description: DESCRIPTION, path: '/', jsonLd: buildLandingJsonLd() });

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
      setError(getErrorMessage(e));
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

      <main className="flex-1">
        <div className="max-w-5xl w-full mx-auto px-6 grid md:grid-cols-[1fr_320px] gap-12 items-start py-12">
          <LandingSeoContent />

          <div className="md:sticky md:top-12">
            <div className="card p-5">
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
        </div>
      </main>

      <footer className="max-w-5xl w-full mx-auto px-6 py-8 text-xs text-slate-400 dark:text-slate-500 flex flex-wrap gap-x-4 gap-y-2">
        <span>&copy; {new Date().getFullYear()} tinytalks.live</span>
        <a href="/terms" className="hover:underline">Terms &amp; Conditions</a>
        <a href="/login" className="hover:underline">Log in</a>
        <a href="/signup" className="hover:underline">Create account</a>
      </footer>
    </div>
  );
}
