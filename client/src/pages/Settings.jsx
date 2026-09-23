import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import LocationTags from '../components/LocationTags.jsx';
import { api, getErrorMessage } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { generateRandomName } from '../lib/randomName.js';
import { useSeo } from '../lib/seo.js';

const TABS = [
  { key: 'profile', label: 'Profile' },
  { key: 'account', label: 'Account' },
  { key: 'standing', label: 'Standing' },
  { key: 'privacy', label: 'Privacy' },
  { key: 'preferences', label: 'Preferences' },
  { key: 'blocked', label: 'Blocked' },
];

export default function Settings() {
  const { user } = useAuth();
  const [tab, setTab] = useState('profile');

  useSeo({ title: 'Settings — tinytalks.live', noindex: true, path: '/settings' });

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-200 dark:border-white/5">
        <Logo size={28} />
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link to="/chat" className="text-sm text-violet-400 hover:underline">← Back to chat</Link>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 flex flex-col md:flex-row gap-4 md:gap-6">
        <nav className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible md:w-48 shrink-0 pb-1 md:pb-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`text-left whitespace-nowrap shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'bg-violet-500/15 text-violet-300'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 card p-5 sm:p-6 min-w-0">
          {tab === 'profile' && <ProfileTab />}
          {tab === 'account' && <AccountTab user={user} />}
          {tab === 'standing' && <StandingTab user={user} />}
          {tab === 'privacy' && <PrivacyTab />}
          {tab === 'preferences' && <PreferencesTab />}
          {tab === 'blocked' && <BlockedTab />}
        </div>
      </main>
    </div>
  );
}

function ProfileTab() {
  const { user, refreshMe } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [locationTags, setLocationTags] = useState(user?.locationTags || []);
  const [interests, setInterests] = useState(user?.interests || []);
  const [interestsPrivate, setInterestsPrivate] = useState(Boolean(user?.interestsPrivate));
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [nameBusy, setNameBusy] = useState(false);
  const [tagsBusy, setTagsBusy] = useState(false);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');

  function flashSaved(which) {
    setSaved(which);
    setTimeout(() => setSaved(''), 2000);
  }

  async function saveName() {
    setNameBusy(true); setError('');
    try {
      await api.patch('/auth/me', { displayName });
      await refreshMe();
      flashSaved('name');
    } catch (e) {
      setError(getErrorMessage(e, 'Could not update name.'));
    } finally {
      setNameBusy(false);
    }
  }

  async function saveTags() {
    setTagsBusy(true); setError('');
    try {
      await api.patch('/auth/me', { locationTags, interests, interestsPrivate });
      await refreshMe();
      flashSaved('tags');
    } catch (e) {
      setError(getErrorMessage(e, 'Could not save.'));
    } finally {
      setTagsBusy(false);
    }
  }

  async function onAvatarChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarBusy(true); setError('');
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      // No explicit Content-Type — see the same fix elsewhere in this app
      // (VerifyGender.jsx, Verify.jsx, Chat.jsx): a hand-set
      // 'multipart/form-data' header has no boundary, so let the browser
      // set it for a FormData body.
      await api.patch('/auth/me/avatar', fd);
      await refreshMe();
    } catch (e2) {
      setError(getErrorMessage(e2, 'Could not update avatar.'));
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    setAvatarBusy(true); setError('');
    try {
      await api.delete('/auth/me/avatar');
      await refreshMe();
    } catch (e) {
      setError(getErrorMessage(e, 'Could not remove avatar.'));
    } finally {
      setAvatarBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display font-bold text-lg mb-3">Avatar</h2>
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-brand-gradient flex items-center justify-center text-2xl overflow-hidden shrink-0">
            {user?.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" /> : '🙂'}
          </div>
          <div className="flex gap-2">
            <label className="btn-secondary !py-1.5 !px-3 text-sm cursor-pointer">
              {avatarBusy ? 'Uploading…' : 'Change'}
              <input type="file" accept="image/*" hidden onChange={onAvatarChange} disabled={avatarBusy} />
            </label>
            {user?.avatarUrl && (
              <button className="btn-secondary !py-1.5 !px-3 text-sm" onClick={removeAvatar} disabled={avatarBusy}>Remove</button>
            )}
          </div>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
          {user?.avatarChangesRemaining ?? 3} avatar change(s) left today.
        </p>
      </div>

      <div>
        <h2 className="font-display font-bold text-lg mb-3">Display name</h2>
        <div className="flex gap-2">
          <input className="input flex-1" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <button type="button" className="btn-secondary !px-3 shrink-0" title="Random name" onClick={() => setDisplayName(generateRandomName())}>
            🎲
          </button>
          <button type="button" className="btn-primary !px-4 shrink-0" onClick={saveName} disabled={nameBusy}>
            {nameBusy ? 'Saving…' : 'Save'}
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
          {user?.nameChangesRemaining ?? 3} name change(s) left today.
        </p>
        {saved === 'name' && <p className="text-xs text-mint-400 mt-1">Saved ✓</p>}
      </div>

      <div>
        <h2 className="font-display font-bold text-lg mb-3">Location tags</h2>
        <LocationTags tags={locationTags} onChange={setLocationTags} />
      </div>

      <div>
        <h2 className="font-display font-bold text-lg mb-3">Interests</h2>
        <LocationTags
          tags={interests}
          onChange={setInterests}
          placeholder="Add an interest (music, gaming, movies)…"
          emptyLabel="No interests yet — add some to match with people who share them."
        />
        <label className="flex items-start gap-2.5 mt-3 cursor-pointer">
          <input
            type="checkbox"
            checked={interestsPrivate}
            onChange={(e) => setInterestsPrivate(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-white/20 bg-slate-100 dark:bg-ink-800 text-violet-500 focus:ring-violet-500"
          />
          <span className="text-sm text-slate-600 dark:text-slate-300">
            Keep my interests private from friends
            <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              By default, people you're friends with can see your interests. This never affects
              random-chat matching, which always uses your interests either way.
            </span>
          </span>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={saveTags} disabled={tagsBusy}>
          {tagsBusy ? 'Saving…' : 'Save tags & interests'}
        </button>
        {saved === 'tags' && <span className="text-xs text-mint-400">Saved ✓</span>}
      </div>

      {error && <p className="text-sm text-coral-400">{error}</p>}
    </div>
  );
}

function AccountTab({ user }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const canChangePassword = user?.accountType !== 'GUEST';

  async function submit(e) {
    e.preventDefault();
    setError(''); setDone(false);
    if (newPassword.length < 8) return setError('New password must be at least 8 characters.');
    if (newPassword !== confirmPassword) return setError("New passwords don't match.");
    setBusy(true);
    try {
      await api.patch('/auth/change-password', { currentPassword, newPassword });
      setDone(true);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (e2) {
      setError(getErrorMessage(e2, 'Could not change password.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display font-bold text-lg mb-2">Account</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {user?.email ? user.email : 'Guest account — no email on file.'}
        </p>
        <span className="chip bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 mt-2 inline-block">
          {user?.accountType}
        </span>
      </div>

      <div>
        <h3 className="font-display font-semibold mb-2">Change password</h3>
        {!canChangePassword ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Guest accounts don't have a password.{' '}
            <Link to="/signup" className="text-violet-400 hover:underline">Create a full account</Link> to set one.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3 max-w-sm">
            <input className="input" type="password" placeholder="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            <input className="input" type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            <input className="input" type="password" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            {error && <p className="text-sm text-coral-400">{error}</p>}
            {done && <p className="text-sm text-mint-400">Password updated ✓</p>}
            <button className="btn-primary" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button>
          </form>
        )}
      </div>
    </div>
  );
}

function StandingTab({ user }) {
  return (
    <div>
      <h2 className="font-display font-bold text-lg mb-3">Standing</h2>
      {user?.banned ? (
        <div className="rounded-xl bg-coral-500/10 border border-coral-500/30 p-4">
          <p className="text-coral-400 font-semibold">Your account is banned</p>
          {user?.banReason && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Reason: {user.banReason}</p>}
        </div>
      ) : (
        <div className="rounded-xl bg-mint-500/10 border border-mint-500/30 p-4">
          <p className="text-mint-400 font-semibold">Your account is in good standing</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            No restrictions on file. Accounts that violate our{' '}
            <Link to="/terms" className="text-violet-400 hover:underline">Terms &amp; Conditions</Link> are signed out and blocked from logging back in.
          </p>
        </div>
      )}
    </div>
  );
}

function PrivacyTab() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function deleteAccount() {
    setError('');
    if (confirmText !== 'DELETE') return setError('Type DELETE to confirm.');
    setBusy(true);
    try {
      await api.delete('/auth/me', { data: { password } });
      logout();
      navigate('/');
    } catch (e) {
      setError(getErrorMessage(e, 'Could not delete account.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="font-display font-bold text-lg mb-3">Privacy</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        tinytalks never collects your location or contacts. Location tags and interests are entirely
        optional and self-reported. Messages are stored securely and are only ever reviewed by our
        moderation team when you or the other person submits a report.
      </p>

      <div className="rounded-xl border border-coral-500/30 p-4">
        <p className="font-semibold text-coral-400">Delete my account</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Permanently deletes your account, messages, and photos. This can't be undone.
        </p>
        <div className="mt-3 space-y-2 max-w-sm">
          <input
            className="input"
            type="password"
            placeholder="Your password (leave blank for guest accounts)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input
            className="input"
            placeholder='Type "DELETE" to confirm'
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
          />
          {error && <p className="text-sm text-coral-400">{error}</p>}
          <button className="btn-secondary border border-coral-500/40 text-coral-400" onClick={deleteAccount} disabled={busy}>
            {busy ? 'Deleting…' : 'Delete my account permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PreferencesTab() {
  return (
    <div>
      <h2 className="font-display font-bold text-lg mb-3">Preferences</h2>
      <div className="flex items-center justify-between max-w-sm">
        <span className="text-sm text-slate-600 dark:text-slate-300">Theme</span>
        <ThemeToggle />
      </div>
    </div>
  );
}

function BlockedTab() {
  const [blocked, setBlocked] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/blocks').then(({ data }) => setBlocked(data.blocked)).catch(() => setError('Could not load blocked users.'));
  }, []);

  async function unblock(userId) {
    try {
      await api.delete(`/blocks/${userId}`);
      setBlocked((prev) => prev.filter((b) => b.userId !== userId));
    } catch {
      setError('Could not unblock.');
    }
  }

  return (
    <div>
      <h2 className="font-display font-bold text-lg mb-3">Blocked users</h2>
      {error && <p className="text-sm text-coral-400 mb-2">{error}</p>}
      {blocked === null && <p className="text-sm text-slate-500">Loading…</p>}
      {blocked?.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">You haven't blocked anyone.</p>
      )}
      <div className="space-y-2">
        {blocked?.map((b) => (
          <div key={b.userId} className="flex items-center justify-between rounded-lg bg-slate-100 dark:bg-white/5 px-3 py-2">
            <span className="text-sm">{b.displayName}</span>
            <button className="btn-secondary !py-1 !px-3 text-xs" onClick={() => unblock(b.userId)}>Unblock</button>
          </div>
        ))}
      </div>
    </div>
  );
}
