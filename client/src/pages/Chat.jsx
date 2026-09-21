import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import ReportModal from '../components/ReportModal.jsx';
import ImageBubble from '../components/ImageBubble.jsx';
import LocationTags from '../components/LocationTags.jsx';
import { api, getStoredToken, getErrorMessage } from '../lib/api.js';
import { connectPusher, userChannel } from '../lib/pusher.js';
import { useAuth } from '../lib/auth.jsx';
import { generateRandomName } from '../lib/randomName.js';
import {
  loadOrCreateKeyPair,
  publicKeyToBase64,
  encryptText,
  decryptText,
  encryptBytes,
} from '../lib/crypto.js';

const GENDERS = [
  { value: 'ANY', label: 'Anyone' },
  { value: 'MALE', label: 'Men' },
  { value: 'FEMALE', label: 'Women' },
  { value: 'NONBINARY', label: 'Non-binary' },
];

export default function Chat() {
  const { user, logout, refreshMe } = useAuth();
  const navigate = useNavigate();
  const keyPairRef = useRef(null);
  const conversationIdRef = useRef(null); // kept in sync with state below, read inside the Pusher handler bound once at mount

  const [status, setStatus] = useState('idle'); // idle | waiting | matched
  const [desiredGender, setDesiredGender] = useState('ANY');
  const [conversationId, setConversationId] = useState(null);
  const [partnerId, setPartnerId] = useState(null);
  const [partnerPubKey, setPartnerPubKey] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [imageVerifiedNotice, setImageVerifiedNotice] = useState(false);
  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);

  // --- Profile: editable display name + self-reported location tags ---
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [locationTags, setLocationTags] = useState(user?.locationTags || []);
  const [locationFilterOn, setLocationFilterOn] = useState((user?.locationTags || []).length > 0);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState('');

  const imageVerified = Boolean(user?.otpVerified && user?.ageEstimationPassed);
  const isAdmin = user?.accountType === 'ADMIN';

  useEffect(() => { conversationIdRef.current = conversationId; }, [conversationId]);

  useEffect(() => {
    keyPairRef.current = loadOrCreateKeyPair();
    const token = getStoredToken();
    const pusher = connectPusher(token);
    const channel = pusher.subscribe(userChannel(user.id));

    api.post('/keys/publish', { publicKey: publicKeyToBase64(keyPairRef.current.publicKey) }).catch(() => {});

    channel.bind('queue:matched', async ({ conversationId: cid, partnerId: pid }) => {
      await handleMatched(cid, pid);
    });

    channel.bind('message:new', (msg) => {
      if (msg.conversationId !== conversationIdRef.current) return; // stray event from a conversation we've since left
      setMessages((prev) => [...prev, { ...msg, incoming: true }]);
    });

    return () => {
      pusher.unsubscribe(userChannel(user.id));
      pusher.disconnect();
      api.post('/queue/leave').catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function fetchPartnerKeyWithRetry(pid, attempts = 6) {
    for (let i = 0; i < attempts; i++) {
      try {
        const { data } = await api.get(`/keys/${pid}/latest`);
        return data.publicKey;
      } catch {
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    return null;
  }

  async function handleMatched(cid, pid) {
    setConversationId(cid);
    setPartnerId(pid);
    setMessages([]);
    setStatus('matched');

    const key = await fetchPartnerKeyWithRetry(pid);
    setPartnerPubKey(key);
  }

  async function saveProfile() {
    setProfileSaving(true);
    setProfileError('');
    setProfileSaved(false);
    try {
      await api.patch('/auth/me', {
        displayName,
        locationTags,
      });
      await refreshMe();
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } catch (e) {
      setProfileError(getErrorMessage(e, 'Could not save profile.'));
    } finally {
      setProfileSaving(false);
    }
  }

  async function findMatch() {
    setStatus('waiting');
    try {
      const { data } = await api.post('/queue/join', {
        desiredGender,
        locationTags: locationFilterOn ? locationTags : [],
      });
      if (data.status === 'matched') {
        await handleMatched(data.conversationId, data.partnerId);
      }
      // status === 'waiting': stay put — the 'queue:matched' Pusher event
      // will fire once someone else's /queue/join matches with us.
    } catch (err) {
      console.error(err);
      setStatus('idle');
    }
  }

  function leaveConversation() {
    if (conversationId) api.post('/messages/end', { conversationId }).catch(() => {});
    setConversationId(null);
    setPartnerId(null);
    setPartnerPubKey(null);
    setMessages([]);
    setStatus('idle');
  }

  function sendText(e) {
    e.preventDefault();
    if (!draft.trim() || !partnerPubKey || !conversationId) return;

    const { ciphertext, nonce } = encryptText(draft, keyPairRef.current.secretKey, partnerPubKey);
    const senderPubKey = publicKeyToBase64(keyPairRef.current.publicKey);

    api
      .post('/messages/send', { conversationId, ciphertext, nonce, senderPubKey, kind: 'text' })
      .catch((err) => console.error(err));

    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, kind: 'text', plaintext: draft, incoming: false, createdAt: new Date().toISOString() },
    ]);
    setDraft('');
  }

  async function sendImage(file, viewMode) {
    if (!file || !partnerPubKey || !conversationId) return;
    const buf = new Uint8Array(await file.arrayBuffer());
    const { ciphertext, nonce } = encryptBytes(buf, keyPairRef.current.secretKey, partnerPubKey);
    const senderPubKey = publicKeyToBase64(keyPairRef.current.publicKey);

    const fd = new FormData();
    fd.append('image', new Blob([ciphertext]), 'blob.bin');
    fd.append('conversationId', conversationId);
    fd.append('nonce', nonce);
    fd.append('senderPubKey', senderPubKey);
    fd.append('viewMode', viewMode);

    const { data } = await api.post('/images', fd, { headers: { 'Content-Type': 'multipart/form-data' } });

    setMessages((prev) => [
      ...prev,
      {
        id: data.messageId,
        kind: 'image',
        imageId: data.image.id,
        viewMode: data.image.viewMode,
        incoming: false,
        localPreviewUrl: URL.createObjectURL(file),
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  function onPickImage(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!imageVerified) {
      setImageVerifiedNotice(true);
      return;
    }
    const viewMode = window.confirm('Send as one-time view? (Cancel = 10-second view)') ? 'ONE_TIME' : 'TIMED_10S';
    sendImage(file, viewMode);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-200 dark:border-white/5">
        <Logo size={28} />
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {isAdmin && (
            <Link to="/admin" className="chip bg-violet-500/10 border-violet-500/30 text-violet-300 hover:bg-violet-500/20">
              Admin view
            </Link>
          )}
          {user?.accountType === 'GUEST' && (
            <span className="chip bg-coral-500/10 border-coral-500/30 text-coral-400">Guest · 2 days</span>
          )}
          {user?.accountType === 'REGULAR' && user?.genderVerification === 'NONE' && (
            <Link to="/verify-gender" className="chip bg-violet-500/10 border-violet-500/30 text-violet-300 hover:bg-violet-500/20">
              Verify gender
            </Link>
          )}
          {!imageVerified && (
            <Link to="/verify" className="chip bg-violet-500/10 border-violet-500/30 text-violet-300 hover:bg-violet-500/20">
              Unlock images
            </Link>
          )}
          <ThemeToggle />
          <button onClick={() => { logout(); navigate('/'); }} className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
            Log out
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto flex flex-col p-3 sm:p-4 gap-4">
        {status !== 'matched' && (
          <div className="card p-4 sm:p-6 flex-1 flex flex-col gap-6">
            {/* --- Profile: name + location --- */}
            <div>
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2 block">Your name</label>
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder="Display name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-secondary !px-3 shrink-0"
                  title="Suggest a random name"
                  onClick={() => setDisplayName(generateRandomName())}
                >
                  🎲
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Your location tags
                </label>
                <button
                  type="button"
                  onClick={() => setLocationFilterOn((v) => !v)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                    locationFilterOn
                      ? 'bg-mint-500/10 border-mint-500/30 text-mint-400'
                      : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {locationFilterOn ? 'ON' : 'OFF'}
                </button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                Add towns, districts, or your state — we'll prefer matching you with people who share one. Self-reported only; never tracked.
              </p>
              <LocationTags tags={locationTags} onChange={setLocationTags} disabled={!locationFilterOn} />
            </div>

            <div className="flex items-center gap-3">
              <button type="button" className="btn-secondary !py-1.5 !px-4 text-sm" onClick={saveProfile} disabled={profileSaving}>
                {profileSaving ? 'Saving…' : 'Save profile'}
              </button>
              {profileSaved && <span className="text-xs text-mint-400">Saved ✓</span>}
              {profileError && <span className="text-xs text-coral-400">{profileError}</span>}
            </div>

            <div className="border-t border-slate-200 dark:border-white/5 pt-6 flex flex-col items-center gap-4 text-center">
              <div>
                <label className="text-sm text-slate-500 dark:text-slate-400 mb-2 block">Match with</label>
                <select
                  className="input max-w-xs mx-auto border-violet-400/60 dark:border-violet-500/50 focus:ring-violet-500"
                  value={desiredGender}
                  onChange={(e) => setDesiredGender(e.target.value)}
                >
                  {GENDERS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
              </div>

              <button onClick={findMatch} disabled={status === 'waiting'} className="btn-primary w-full sm:w-auto">
                {status === 'waiting' ? 'Looking for someone…' : 'Find someone to talk to'}
              </button>
              {status === 'waiting' && (
                <p className="text-sm text-slate-500">This can take a moment depending on who's online.</p>
              )}
            </div>
          </div>
        )}

        {status === 'matched' && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="chip bg-mint-500/10 border-mint-500/30 text-mint-400">Connected · end-to-end encrypted</span>
              <div className="flex gap-2">
                <button className="btn-secondary !py-1.5 !px-3 text-sm" onClick={() => setReportOpen(true)}>Report</button>
                <button className="btn-secondary !py-1.5 !px-3 text-sm" onClick={leaveConversation}>Leave chat</button>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto card p-3 sm:p-4 space-y-3 min-h-[50vh]">
              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  keyPair={keyPairRef.current}
                />
              ))}
              {messages.length === 0 && (
                <p className="text-center text-sm text-slate-500 mt-10">Say hi 👋 — this conversation is end-to-end encrypted.</p>
              )}
            </div>

            <form onSubmit={sendText} className="flex gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn-secondary !px-3"
                title={imageVerified ? 'Send a self-destructing image' : 'Verify to unlock image sharing'}
              >
                📷
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onPickImage} />
              <input
                className="input flex-1 min-w-0"
                placeholder="Type a message…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button className="btn-primary shrink-0" disabled={!partnerPubKey}>Send</button>
            </form>
          </>
        )}
      </main>

      {reportOpen && partnerId && (
        <ReportModal
          reportedUserId={partnerId}
          conversationId={conversationId}
          onClose={() => setReportOpen(false)}
        />
      )}

      {imageVerifiedNotice && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-6 z-50">
          <div className="card p-6 max-w-sm text-center">
            <p className="font-display font-semibold">Verify to send images</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              A quick, free, ID-free check unlocks self-destructing image sharing.
            </p>
            <div className="flex gap-2 mt-4">
              <button className="btn-secondary flex-1" onClick={() => setImageVerifiedNotice(false)}>Not now</button>
              <Link to="/verify" className="btn-primary flex-1">Verify</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message, keyPair }) {
  const isMine = !message.incoming;
  let text = message.plaintext;

  if (message.incoming && message.kind === 'text' && text === undefined) {
    text = decryptText(message.ciphertext, message.nonce, message.senderPubKey, keyPair.secretKey) || '⚠️ Could not decrypt';
  }

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      {message.kind === 'image' ? (
        <ImageBubble message={message} keyPair={keyPair} isMine={isMine} />
      ) : (
        <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2 text-sm ${isMine ? 'bg-brand-gradient text-white' : 'bg-slate-100 dark:bg-ink-800 text-slate-900 dark:text-slate-100'}`}>
          {text}
        </div>
      )}
    </div>
  );
}
