import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import PhotoCapture from '../components/PhotoCapture.jsx';
import { getErrorMessage, api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

// Unlocks image sharing. Requires BOTH steps below — never government ID.
export default function Verify() {
  const { user, refreshMe } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState(user?.email || '');
  const [code, setCode] = useState('');
  const [otpStep, setOtpStep] = useState('request'); // request | verify | done
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpMsg, setOtpMsg] = useState('');
  const [devPreview, setDevPreview] = useState('');

  const [selfie, setSelfie] = useState(null);
  const [ageBusy, setAgeBusy] = useState(false);
  const [ageMsg, setAgeMsg] = useState('');

  async function requestOtp(e) {
    e.preventDefault();
    setOtpBusy(true);
    setOtpMsg('');
    try {
      const { data } = await api.post('/otp/request', { email });
      setOtpStep('verify');
      setDevPreview(data.devPreviewUrl || '');
      setOtpMsg('Code sent. Check your email.');
    } catch (e2) {
      setOtpMsg(getErrorMessage(e2, 'Could not send code.'));
    } finally {
      setOtpBusy(false);
    }
  }

  async function verifyOtp(e) {
    e.preventDefault();
    setOtpBusy(true);
    setOtpMsg('');
    try {
      await api.post('/otp/verify', { code });
      setOtpStep('done');
      await refreshMe();
    } catch (e2) {
      setOtpMsg(getErrorMessage(e2, 'Incorrect code.'));
    } finally {
      setOtpBusy(false);
    }
  }

  async function submitAgeEstimation(e) {
    e.preventDefault();
    if (!selfie) return setAgeMsg('Take or upload a selfie first.');
    setAgeBusy(true);
    setAgeMsg('');
    try {
      const fd = new FormData();
      fd.append('selfie', selfie);
      const { data } = await api.post('/verification/age-estimation', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (data.passed) {
        setAgeMsg('Age verification passed.');
      } else {
        setAgeMsg(data.note || 'Could not verify age from that photo. Try again with better lighting.');
      }
      await refreshMe();
    } catch (e2) {
      setAgeMsg(getErrorMessage(e2, 'Verification service unavailable.'));
    } finally {
      setAgeBusy(false);
    }
  }

  const imageVerified = user?.otpVerified && user?.ageEstimationPassed;

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10 relative">
      <div className="absolute top-6 right-6"><ThemeToggle /></div>
      <div className="card w-full max-w-lg p-8">
        <div className="flex justify-center mb-4"><Logo /></div>
        <h1 className="font-display text-xl font-bold text-center">Unlock image sharing</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center mt-1">
          Two quick, free checks. No government ID, ever.
        </p>

        {imageVerified && (
          <div className="mt-6 rounded-xl bg-mint-500/10 border border-mint-500/30 p-4 text-center">
            <p className="text-mint-400 font-semibold">You're image-verified 🎉</p>
            <button className="btn-primary mt-4" onClick={() => navigate('/chat')}>Back to chat</button>
          </div>
        )}

        {!imageVerified && (
          <div className="mt-6 space-y-8">
            <section>
              <StepHeader n={1} title="Email verification" done={user?.otpVerified} />
              {!user?.otpVerified && otpStep !== 'verify' && (
                <form onSubmit={requestOtp} className="mt-3 flex gap-2">
                  <input className="input" type="email" placeholder="you@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  <button className="btn-secondary shrink-0" disabled={otpBusy}>{otpBusy ? '…' : 'Send code'}</button>
                </form>
              )}
              {!user?.otpVerified && otpStep === 'verify' && (
                <form onSubmit={verifyOtp} className="mt-3 flex gap-2">
                  <input className="input" placeholder="6-digit code" required value={code} onChange={(e) => setCode(e.target.value)} />
                  <button className="btn-secondary shrink-0" disabled={otpBusy}>{otpBusy ? '…' : 'Verify'}</button>
                </form>
              )}
              {otpMsg && <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{otpMsg}</p>}
              {devPreview && (
                <p className="text-xs text-slate-500 mt-1">
                  Dev mode (no real SMTP configured):{' '}
                  <a href={devPreview} target="_blank" rel="noreferrer" className="text-violet-400 underline">view sandbox email</a>
                </p>
              )}
            </section>

            <section>
              <StepHeader n={2} title="Live age check (selfie, no ID)" done={user?.ageEstimationPassed} />
              {!user?.ageEstimationPassed && (
                <form onSubmit={submitAgeEstimation} className="mt-3 space-y-2">
                  <PhotoCapture onSelect={setSelfie} />
                  <button className="btn-secondary w-full" disabled={ageBusy}>{ageBusy ? 'Checking…' : 'Submit selfie'}</button>
                </form>
              )}
              {ageMsg && <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{ageMsg}</p>}
            </section>

            <button className="btn-secondary w-full" onClick={() => navigate('/chat')}>
              Skip for now — I'll stick to text chat
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StepHeader({ n, title, done }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${done ? 'bg-mint-500 text-ink-950' : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300'}`}>
        {done ? '✓' : n}
      </div>
      <h2 className="font-display font-semibold">{title}</h2>
    </div>
  );
}
