import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import ReportModal from '../components/ReportModal.jsx';
import ImageBubble from '../components/ImageBubble.jsx';
import { api, getStoredToken } from '../lib/api.js';
import { connectPusher, userChannel } from '../lib/pusher.js';
import { useAuth } from '../lib/auth.jsx';
import { cacheSentPlaintext, getCachedSentPlaintext } from '../lib/sentCache.js';
import {
  loadOrCreateKeyPair,
  publicKeyToBase64,
  encryptText,
  decryptText,
  encryptBytes,
} from '../lib/crypto.js';

// Gender symbols instead of a plain dropdown — matches the icon-button
// style people expect from stranger-chat apps, while keeping the same
// four GenderClaim categories the schema already supports.
const GENDERS = [
  { value: 'ANY', label: 'Anyone', symbol: '⚥' },
  { value: 'MALE', label: 'Men', symbol: '♂' },
  { value: 'FEMALE', label: 'Women', symbol: '♀' },
  { value: 'NONBINARY', label: 'Non-binary', symbol: '⚧' },
];

// Moves (or ignores) a conversation to the front of the sidebar list with
// an updated lastMessage preview — shared by the send path and the
// incoming-Pusher-message path so both keep the list in the same shape.
function bumpConversation(list, id, lastMessage) {
  const idx = list.findIndex((c) => c.id === id);
  if (idx === -1) return list;
  const updated = { ...list[idx], lastMessage };
  const rest = list.filter((c) => c.id !== id);
  return [updated, ...rest];
}

function decodeHistoryMessage(m, myUserId, keyPair) {
  const incoming = m.senderId !== myUserId;
  if (m.kind === 'image') {
    return {
      id: m.id,
      kind: 'image',
      imageId: m.image?.id,
      viewMode: m.image?.viewMode,
      image: m.image,
      nonce: m.nonce,
      senderPubKey: m.senderPubKey,
      incoming,
      createdAt: m.createdAt,
    };
  }
  if (!incoming) {
    // My own historical message — the server never stored plaintext, and
    // nacl.box needs the recipient's key (not mine) to re-derive it, so
    // this only works if I sent it from this same browser (see sentCache.js).
    const cached = getCachedSentPlaintext(m.id);
    return { id: m.id, kind: 'text', plaintext: cached, incoming: false, createdAt: m.createdAt };
  }
  const text = decryptText(m.ciphertext, m.nonce, m.senderPubKey, keyPair.secretKey);
  return { id: m.id, kind: 'text', plaintext: text, incoming: true, createdAt: m.createdAt };
}

export default function Chat() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const keyPairRef = useRef(null);
  const activeConversationIdRef = useRef(null); // read inside the Pusher handlers bound once at mount

  const [view, setView] = useState('setup'); // 'setup' | 'thread'
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messagesByConv, setMessagesByConv] = useState({});
  const [partnerKeyByConv, setPartnerKeyByConv] = useState({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [queueStatus, setQueueStatus] = useState('idle'); // idle | waiting
  const [desiredGender, setDesiredGender] = useState('ANY');
  const [draft, setDraft] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [imageVerifiedNotice, setImageVerifiedNotice] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);

  const imageVerified = Boolean(user?.otpVerified && user?.ageEstimationPassed);
  const isAdmin = user?.accountType === 'ADMIN';
  const activeConv = conversations.find((c) => c.id === activeConversationId) || null;
  const activeMessages = messagesByConv[activeConversationId] || [];
  const canSend = Boolean(activeConversationId && partnerKeyByConv[activeConversationId]);

  useEffect(() => { activeConversationIdRef.current = activeConversationId; }, [activeConversationId]);

  useEffect(() => {
    keyPairRef.current = loadOrCreateKeyPair();
    const token = getStoredToken();
    const pusher = connectPusher(token);
    const channel = pusher.subscribe(userChannel(user.id));

    api.post('/keys/publish', { publicKey: publicKeyToBase64(keyPairRef.current.publicKey) }).catch(() => {});
    api.get('/messages/conversations')
      .then(({ data }) => setConversations(data.conversations.map((c) => ({ ...c, hasUnread: false }))))
      .catch(() => {});

    channel.bind('queue:matched', async ({ conversationId: cid, partnerId: pid }) => {
      await handleMatched(cid, pid);
    });

    // Reaches only the OTHER participant (see server/src/routes/messages.js
    // and images.js — notifyUser targets the partner, never the sender),
    // so an incoming message here is always FROM the partner of whichever
    // conversation it names, whether or not that thread is the one
    // currently open on screen.
    channel.bind('message:new', (msg) => {
      const isActive = msg.conversationId === activeConversationIdRef.current;
      setMessagesByConv((prev) => ({
        ...prev,
        [msg.conversationId]: [...(prev[msg.conversationId] || []), { ...msg, incoming: true }],
      }));
      setConversations((prev) => {
        const bumped = bumpConversation(prev, msg.conversationId, {
          id: msg.id, kind: msg.kind, ciphertext: msg.ciphertext, nonce: msg.nonce,
          senderPubKey: msg.senderPubKey, senderId: null, createdAt: msg.createdAt,
        });
        if (bumped === prev) {
          // A message for a conversation we don't have listed yet (e.g. a
          // match made just before this tab loaded) — true up from the server.
          api.get('/messages/conversations')
            .then(({ data }) => setConversations(data.conversations.map((c) => ({ ...c, hasUnread: c.id !== activeConversationIdRef.current }))))
            .catch(() => {});
          return prev;
        }
        return bumped.map((c) => (c.id === msg.conversationId ? { ...c, hasUnread: !isActive } : c));
      });
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
  }, [activeMessages]);

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

  function refreshConversationsQuiet() {
    setTimeout(async () => {
      try {
        const { data } = await api.get('/messages/conversations');
        setConversations((prev) => prev.map((c) => {
          const fresh = data.conversations.find((f) => f.id === c.id);
          return fresh ? { ...c, partnerDisplayName: fresh.partnerDisplayName } : c;
        }));
      } catch {
        // best-effort display-name true-up; safe to skip on failure
      }
    }, 1200);
  }

  async function handleMatched(cid, pid) {
    setConversations((prev) => {
      if (prev.some((c) => c.id === cid)) return prev;
      return [{ id: cid, partnerId: pid, partnerDisplayName: 'Anonymous', createdAt: new Date().toISOString(), endedAt: null, lastMessage: null, hasUnread: false }, ...prev];
    });
    setMessagesByConv((prev) => (prev[cid] ? prev : { ...prev, [cid]: [] }));
    setActiveConversationId(cid);
    setView('thread');
    setSidebarOpen(false);
    setQueueStatus('idle');
    refreshConversationsQuiet();

    const key = await fetchPartnerKeyWithRetry(pid);
    setPartnerKeyByConv((prev) => ({ ...prev, [cid]: key }));
  }

  async function openConversation(id) {
    setActiveConversationId(id);
    setView('thread');
    setSidebarOpen(false);
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, hasUnread: false } : c)));

    if (messagesByConv[id] !== undefined) return; // already loaded this session

    setHistoryLoading(true);
    try {
      const { data } = await api.get(`/messages/${id}`);
      const decoded = data.messages.map((m) => decodeHistoryMessage(m, user.id, keyPairRef.current));
      setMessagesByConv((prev) => ({ ...prev, [id]: decoded }));
      if (!partnerKeyByConv[id]) {
        const key = await fetchPartnerKeyWithRetry(data.partnerId);
        setPartnerKeyByConv((prev) => ({ ...prev, [id]: key }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function findMatch() {
    setQueueStatus('waiting');
    try {
      const { data } = await api.post('/queue/join', {
        desiredGender,
        locationTags: user?.locationTags || [],
        interests: user?.interests || [],
      });
      if (data.status === 'matched') {
        await handleMatched(data.conversationId, data.partnerId);
      }
      // status === 'waiting': stay put — the 'queue:matched' Pusher event
      // fires once someone else's /queue/join matches with us.
    } catch (err) {
      console.error(err);
      setQueueStatus('idle');
    }
  }

  function closeThread() {
    if (activeConversationId) api.post('/messages/end', { conversationId: activeConversationId }).catch(() => {});
    setView('setup');
  }

  async function blockPartner() {
    if (!activeConv) return;
    if (!window.confirm("Block this person? You won't be matched with them again.")) return;
    setBlockBusy(true);
    try {
      await api.post(`/blocks/${activeConv.partnerId}`);
      setConversations((prev) => prev.filter((c) => c.id !== activeConv.id));
    } catch (err) {
      console.error(err);
    } finally {
      setBlockBusy(false);
      setView('setup');
    }
  }

  async function sendText(e) {
    e.preventDefault();
    const text = draft.trim();
    const partnerKey = partnerKeyByConv[activeConversationId];
    if (!text || !partnerKey || !activeConversationId) return;

    const { ciphertext, nonce } = encryptText(text, keyPairRef.current.secretKey, partnerKey);
    const senderPubKey = publicKeyToBase64(keyPairRef.current.publicKey);
    setDraft('');

    try {
      const { data } = await api.post('/messages/send', { conversationId: activeConversationId, ciphertext, nonce, senderPubKey, kind: 'text' });
      cacheSentPlaintext(data.messageId, text);
      const createdAt = new Date().toISOString();
      setMessagesByConv((prev) => ({
        ...prev,
        [activeConversationId]: [...(prev[activeConversationId] || []), { id: data.messageId, kind: 'text', plaintext: text, incoming: false, createdAt }],
      }));
      setConversations((prev) => bumpConversation(prev, activeConversationId, {
        id: data.messageId, kind: 'text', senderId: user.id, createdAt,
      }));
    } catch (err) {
      console.error(err);
      setDraft(text); // don't lose the draft on a failed send
    }
  }

  async function sendImage(file, viewMode) {
    const partnerKey = partnerKeyByConv[activeConversationId];
    if (!file || !partnerKey || !activeConversationId) return;
    const buf = new Uint8Array(await file.arrayBuffer());
    const { ciphertext, nonce } = encryptBytes(buf, keyPairRef.current.secretKey, partnerKey);
    const senderPubKey = publicKeyToBase64(keyPairRef.current.publicKey);

    const fd = new FormData();
    fd.append('image', new Blob([ciphertext]), 'blob.bin');
    fd.append('conversationId', activeConversationId);
    fd.append('nonce', nonce);
    fd.append('senderPubKey', senderPubKey);
    fd.append('viewMode', viewMode);

    const { data } = await api.post('/images', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    const createdAt = new Date().toISOString();

    setMessagesByConv((prev) => ({
      ...prev,
      [activeConversationId]: [...(prev[activeConversationId] || []), {
        id: data.messageId,
        kind: 'image',
        imageId: data.image.id,
        viewMode: data.image.viewMode,
        incoming: false,
        localPreviewUrl: URL.createObjectURL(file),
        createdAt,
      }],
    }));
    setConversations((prev) => bumpConversation(prev, activeConversationId, {
      id: data.messageId, kind: 'image', senderId: user.id, createdAt,
    }));
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-lg leading-none px-1"
            aria-label="Open chats"
          >
            ☰
          </button>
          <Logo size={28} />
        </div>
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
          <Link to="/settings" className="chip bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10">
            ⚙ Settings
          </Link>
          <ThemeToggle />
          <button onClick={() => { logout(); navigate('/'); }} className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
            Log out
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar: chat history + open chats. Fixed overlay on mobile
            (toggled by the ☰ button above), a normal flex column on desktop. */}
        <aside className={`${sidebarOpen ? 'flex' : 'hidden'} md:flex flex-col w-full sm:w-80 md:w-72 shrink-0 border-r border-slate-200 dark:border-white/5 fixed md:static inset-0 z-40 bg-white dark:bg-ink-950`}>
          <div className="flex items-center justify-between p-4 md:hidden border-b border-slate-200 dark:border-white/5">
            <span className="font-display font-semibold">Chats</span>
            <button onClick={() => setSidebarOpen(false)} className="text-slate-500 dark:text-slate-400 text-lg leading-none" aria-label="Close">✕</button>
          </div>
          <div className="p-3">
            <button
              onClick={() => { setView('setup'); setSidebarOpen(false); }}
              className="btn-primary w-full !py-2 text-sm"
            >
              + New chat
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
            {conversations.length === 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400 px-2 py-4 text-center">No chats yet — start one!</p>
            )}
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => openConversation(c.id)}
                className={`w-full text-left rounded-lg px-3 py-2 transition-colors ${
                  activeConversationId === c.id && view === 'thread'
                    ? 'bg-violet-500/15'
                    : 'hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{c.partnerDisplayName}</span>
                  {c.hasUnread && <span className="h-2 w-2 rounded-full bg-violet-500 shrink-0" />}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  <ConversationPreviewText conv={c} myUserId={user.id} keyPair={keyPairRef.current} />
                </p>
              </button>
            ))}
          </div>
        </aside>

        <main className="flex-1 max-w-3xl w-full mx-auto flex flex-col p-3 sm:p-4 gap-4 min-w-0">
          {view === 'setup' && (
            <SetupPanel
              user={user}
              desiredGender={desiredGender}
              setDesiredGender={setDesiredGender}
              queueStatus={queueStatus}
              onFindMatch={findMatch}
            />
          )}

          {view === 'thread' && activeConv && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="chip bg-mint-500/10 border-mint-500/30 text-mint-400">
                  {activeConv.partnerDisplayName} · end-to-end encrypted
                </span>
                <div className="flex gap-2">
                  <button className="btn-secondary !py-1.5 !px-3 text-sm" onClick={() => setReportOpen(true)}>Report</button>
                  <button className="btn-secondary !py-1.5 !px-3 text-sm" onClick={blockPartner} disabled={blockBusy}>
                    {blockBusy ? 'Blocking…' : 'Block'}
                  </button>
                  <button className="btn-secondary !py-1.5 !px-3 text-sm" onClick={closeThread}>Close</button>
                </div>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto card p-3 sm:p-4 space-y-3 min-h-[50vh]">
                {historyLoading && <p className="text-center text-sm text-slate-500 mt-10">Loading…</p>}
                {!historyLoading && activeMessages.map((m) => (
                  <MessageBubble key={m.id} message={m} keyPair={keyPairRef.current} />
                ))}
                {!historyLoading && activeMessages.length === 0 && (
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
                <button className="btn-primary shrink-0" disabled={!canSend}>Send</button>
              </form>
            </>
          )}
        </main>
      </div>

      {reportOpen && activeConv && (
        <ReportModal
          reportedUserId={activeConv.partnerId}
          conversationId={activeConv.id}
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

function SetupPanel({ user, desiredGender, setDesiredGender, queueStatus, onFindMatch }) {
  const myTags = user?.locationTags || [];
  const myInterests = user?.interests || [];

  return (
    <div className="card p-4 sm:p-6 flex-1 flex flex-col items-center justify-center gap-5 text-center">
      <div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Matching as <strong className="text-slate-900 dark:text-slate-100">{user?.displayName || 'Anonymous'}</strong>
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
          {(myTags.length || myInterests.length)
            ? `Preferring matches sharing: ${[...myTags, ...myInterests].join(', ')}`
            : "No location tags or interests set — you'll match with anyone."}
          {' '}
          <Link to="/settings" className="text-violet-400 hover:underline">Edit in Settings</Link>
        </p>
      </div>

      <div>
        <label className="text-sm text-slate-500 dark:text-slate-400 mb-2 block">Match with</label>
        <div className="flex flex-wrap justify-center gap-2">
          {GENDERS.map((g) => (
            <button
              key={g.value}
              type="button"
              onClick={() => setDesiredGender(g.value)}
              className={`flex flex-col items-center gap-1 rounded-xl border px-4 py-2 min-w-[68px] transition-colors ${
                desiredGender === g.value
                  ? 'border-violet-500 bg-violet-500/10 text-violet-600 dark:text-violet-300'
                  : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-violet-400/50'
              }`}
            >
              <span className="text-xl leading-none">{g.symbol}</span>
              <span className="text-xs font-medium">{g.label}</span>
            </button>
          ))}
        </div>
      </div>

      <button onClick={onFindMatch} disabled={queueStatus === 'waiting'} className="btn-primary w-full sm:w-auto">
        {queueStatus === 'waiting' ? 'Looking for someone…' : 'Find someone to talk to'}
      </button>
      {queueStatus === 'waiting' && (
        <p className="text-sm text-slate-500">This can take a moment depending on who's online.</p>
      )}
    </div>
  );
}

function ConversationPreviewText({ conv, myUserId, keyPair }) {
  const last = conv.lastMessage;
  if (!last) return 'Say hi 👋';
  if (last.kind === 'image') return (last.senderId === myUserId ? 'You: 📷 Photo' : '📷 Photo');
  if (last.senderId === myUserId) {
    const cached = getCachedSentPlaintext(last.id);
    return cached ? `You: ${cached}` : 'You: (sent)';
  }
  if (!keyPair) return '🔒 New message';
  const text = decryptText(last.ciphertext, last.nonce, last.senderPubKey, keyPair.secretKey);
  return text || '🔒 New message';
}

function MessageBubble({ message, keyPair }) {
  const isMine = !message.incoming;
  let text = message.plaintext;

  if (message.incoming && message.kind === 'text' && text === undefined) {
    text = decryptText(message.ciphertext, message.nonce, message.senderPubKey, keyPair.secretKey);
  }
  if (message.kind === 'text' && (text === null || text === undefined)) {
    text = isMine ? '🔒 Sent message (unavailable on this device)' : '⚠️ Could not decrypt';
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
