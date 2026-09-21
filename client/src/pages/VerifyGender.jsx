import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import PhotoCapture from '../components/PhotoCapture.jsx';
import { getErrorMessage, api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

// Gender-verification photo, submitted as its own step after signup or
// login (rather than blocking the signup form on it) so it can be taken
// with a phone camera or laptop webcam, not just uploaded from disk.
// An admin reviews this photo — see routes/admin.js — purely to confirm
// the gender claimed at signup. It is unrelated to the OTP + age-estimation
// checks on /verify, which unlock image sharing.
export default function VerifyGender() {
  const { user, refreshMe } = useAuth();
  const navigate = useNavigate();
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const status = user?.genderVerification;

  async function submit(e) {
    e.preventDefault();
    if (!photo) return setError('Take or upload a photo first.');
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('genderPhoto', photo);
      await api.post('/auth/gender-photo', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSubmitted(true);
      await refreshMe();
    } catch (e2) {
      setError(getErrorMessage(e2, 'Could not submit photo.'));
    } finally {
      setBusy(false);
    }
  }

  const alreadyPending = status === 'PENDING' && !submitted;
  const approved = status === 'APPROVED';

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10 relative">
      <div className="absolute top-6 right-6"><ThemeToggle /></div>
      <div className="card w-full max-w-md p-8">
        <div className="flex justify-center mb-4"><Logo /></div>
        <h1 className="font-display text-xl font-bold text-center">Gender verification</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center mt-1">
          A quick photo so our team can confirm the gender on your profile.
        </p>

        {approved && (
          <div className="mt-6 rounded-xl bg-mint-500/10 border border-mint-500/30 p-4 text-center">
            <p className="text-mint-400 font-semibold">You're verified 🎉</p>
            <button className="btn-primary mt-4" onClick={() => navigate('/chat')}>Continue to chat</button>
          </div>
        )}

        {!approved && (submitted || alreadyPending) && (
          <div className="mt-6 rounded-xl bg-violet-500/10 border border-violet-500/30 p-4 text-center">
            <p className="text-violet-300 font-semibold">Photo submitted — pending review</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Our team reviews these by hand; you can keep chatting in the meantime.
            </p>
            <button className="btn-primary mt-4" onClick={() => navigate('/chat')}>Continue to chat</button>
          </div>
        )}

        {!approved && !submitted && !alreadyPending && (
          <form onSubmit={submit} className="mt-6 space-y-4">
            {status === 'REJECTED' && (
              <p className="text-sm text-coral-400">
                Your last photo wasn't accepted. Try again with clear, even lighting.
              </p>
            )}
            <PhotoCapture onSelect={setPhoto} />
            {error && <p className="text-sm text-coral-400">{error}</p>}
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? 'Submitting…' : 'Submit for review'}
            </button>
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => navigate('/chat')}
            >
              Skip for now
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
