import { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import ReportModal from '../components/ReportModal.jsx';
import ImageBubble from '../components/ImageBubble.jsx';
import { api, getStoredToken } from '../lib/api.js';
import { connectSocket } from '../lib/socket.js';
import { useAuth } from '../lib/auth.jsx';
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
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const keyPairRef = useRef(null);

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

  const imageVerified = Boolean(user?.otpVerified && user?.ageEstimationPassed);

  useEffect(() => {
    keyPairRef.current = loadOrCreateKeyPair();
    const token = getStoredToken();
    const socket = connectSocket(token);
    socketRef.current = socket;

    api.post('/keys/publish', { publicKey: publicKeyToBase64(keyPairRef.current.publicKey) }).catch(() => {});

    socket.on('queue:waiting', () => setStatus('waiting'));

    socket.on('queue:matched', async ({ conversationId: cid, partnerId: pid }) => {
      setConversationId(cid);
      setPartnerId(pid);
      setMessages([]);
      setStatus('matched');

      const key = await fetchPartnerKeyWithRetry(pid);
      setPartnerPubKey(key);
    });

    socket.on('message:new', (msg) => {
      setMessages((prev) => [...prev, { ...msg, incoming: true }]);
    });

    return () => socket.disconnect();
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

  function findMatch() {
    setStatus('waiting');
    socketRef.current.emit('queue:join', { desiredGender });
  }

  function leaveConversation() {
    if (conversationId) socketRef.current.emit('conversation:end', { conversationId });
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

    socketRef.current.emit(
      'message:send',
      { conversationId, ciphertext, nonce, senderPubKey, kind: 'text' },
      (ack) => {
        if (ack?.error) console.error(ack.error);
      }
    );

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
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <Logo size={30} />
        <div className="flex items-center gap-3">
          {user?.accountType === 'GUEST' && (
            <span className="chip bg-coral-500/10 border-coral-500/30 text-coral-400">Guest · expires in 2 days</span>
          )}
          {!imageVerified && (
            <Link to="/verify" className="chip bg-violet-500/10 border-violet-500/30 text-violet-300 hover:bg-violet-500/20">
              Unlock image sharing
            </Link>
          )}
          <button onClick={() => { logout(); navigate('/'); }} className="text-sm text-slate-400 hover:text-white">
            Log out
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto flex flex-col p-4 gap-4">
        {status !== 'matched' && (
          <div className="card p-8 text-center flex-1 flex flex-col items-center justify-center gap-4">
            <div>
              <label className="text-sm text-slate-400 mb-2 block">
                Match with{user?.premiumGenderFilter ? '' : ' (upgrade for gender filter)'}
              </label>
              <select
                className="input max-w-xs mx-auto"
                value={desiredGender}
                disabled={!user?.premiumGenderFilter}
                onChange={(e) => setDesiredGender(e.target.value)}
              >
                {GENDERS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>

            <button onClick={findMatch} disabled={status === 'waiting'} className="btn-primary">
              {status === 'waiting' ? 'Looking for someone…' : 'Find someone to talk to'}
            </button>
            {status === 'waiting' && (
              <p className="text-sm text-slate-500">This can take a moment depending on who's online.</p>
            )}
          </div>
        )}

        {status === 'matched' && (
          <>
            <div className="flex items-center justify-between">
              <span className="chip bg-mint-500/10 border-mint-500/30 text-mint-400">Connected · end-to-end encrypted</span>
              <div className="flex gap-2">
                <button className="btn-secondary !py-1.5 !px-3 text-sm" onClick={() => setReportOpen(true)}>Report</button>
                <button className="btn-secondary !py-1.5 !px-3 text-sm" onClick={leaveConversation}>Leave chat</button>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto card p-4 space-y-3 min-h-[50vh]">
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
                className="input flex-1"
                placeholder="Type a message…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button className="btn-primary" disabled={!partnerPubKey}>Send</button>
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
            <p className="text-sm text-slate-400 mt-2">
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
        <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${isMine ? 'bg-brand-gradient text-white' : 'bg-ink-800 text-slate-100'}`}>
          {text}
        </div>
      )}
    </div>
  );
}
