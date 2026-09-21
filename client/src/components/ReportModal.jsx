import { useState } from 'react';
import { api } from '../lib/api.js';

const CATEGORIES = [
  { value: 'HARASSMENT_OR_ABUSE', label: 'Harassment or abuse' },
  { value: 'UNDERAGE_SUSPICION', label: 'I think this person is underage' },
  { value: 'NUDITY_OR_SEXUAL_CONTENT', label: 'Unwanted nudity or sexual content' },
  { value: 'SPAM_OR_SCAM', label: 'Spam or scam' },
  { value: 'IMPERSONATION_OR_FAKE_PROFILE', label: 'Impersonation or fake profile' },
  { value: 'GENDER_MISREPRESENTATION', label: 'Gender misrepresentation' },
  { value: 'THREATS_OR_VIOLENCE', label: 'Threats or violence' },
  { value: 'HATE_SPEECH', label: 'Hate speech' },
  { value: 'OTHER', label: 'Something else' },
];

export default function ReportModal({ reportedUserId, conversationId, onClose }) {
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!category) return setError('Choose a category.');
    setBusy(true);
    setError('');
    try {
      await api.post('/reports', { reportedUserId, conversationId, category, description });
      setDone(true);
    } catch (e2) {
      setError(e2.response?.data?.error || 'Could not submit report.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-6 z-50">
      <div className="card p-6 w-full max-w-md">
        {done ? (
          <div className="text-center py-4">
            <p className="font-display font-semibold text-mint-400">Report submitted</p>
            <p className="text-sm text-slate-400 mt-2">Our team will review this. Thanks for helping keep tinytalks safe.</p>
            <button className="btn-primary mt-5" onClick={onClose}>Close</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h2 className="font-display font-bold text-lg">Report this person</h2>
            <div className="mt-4 space-y-2 max-h-52 overflow-y-auto">
              {CATEGORIES.map((c) => (
                <label key={c.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="category" value={c.value} checked={category === c.value} onChange={() => setCategory(c.value)} />
                  {c.label}
                </label>
              ))}
            </div>
            <textarea
              className="input mt-3 h-24 resize-none"
              placeholder="Add details (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            {error && <p className="text-sm text-coral-400 mt-2">{error}</p>}
            <div className="flex gap-2 mt-4">
              <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
              <button className="btn-primary flex-1" disabled={busy}>{busy ? 'Submitting…' : 'Submit report'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
