import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import ReportModal from '../components/ReportModal.jsx';
import ImageBubble from '../components/ImageBubble.jsx';
import { stickerById } from '../components/StickerPicker.jsx';
import PickerTabs from '../components/PickerTabs.jsx';
import VoiceRecorder from '../components/VoiceRecorder.jsx';
import VoiceNoteBubble from '../components/VoiceNoteBubble.jsx';
import ViewToggle from '../components/ViewToggle.jsx';
import { api, getErrorMessage } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useRealtime } from '../lib/realtime.jsx';
import { applyEmojiShortcuts } from '../lib/emojiShortcuts.js';
import { useSeo } from '../lib/seo.js';

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

// Reshapes one server history row into what MessageBubble/ImageBubble/
// VoiceNoteBubble expect — this used to also decrypt ciphertext client-side
// (per-device, via the removed nacl.box scheme); the server now sends
// plain text directly, so this is just a field remap.
function decodeHistoryMessage(m, myUserId) {
  const incoming = m.senderId !== myUserId;
  if (m.kind === 'image') {
    return {
      id: m.id,
      kind: 'image',
      imageId: m.image?.id,
      viewMode: m.image?.viewMode,
      image: m.image,
      replyToId: m.replyToId || null,
      incoming,
      createdAt: m.createdAt,
    };
  }
  if (m.kind === 'voice') {
    return {
      id: m.id,
      kind: 'voice',
      // null once the recipient's already listened (erased server-side —
      // see routes/voiceNotes.js publicVoiceNote()); VoiceNoteBubble reads
      // that directly as "played"/unavailable.
      voiceNote: m.voiceNote,
      replyToId: m.replyToId || null,
      incoming,
      createdAt: m.createdAt,
    };
  }
  // Text, stickers and GIFs all flow through the same `text` column — a
  // sticker's "text" is just its id (e.g. "fire"), a GIF's is its CDN URL
  // — so they share this same decode path; `m.kind` (not a hardcoded
  // 'text') is what tells MessageBubble how to render it.
  return { id: m.id, kind: m.kind, plaintext: m.text, replyToId: m.replyToId || null, editedAt: m.editedAt || null, incoming, createdAt: m.createdAt };
}

// A failed send used to only ever show up in the browser console — from
// the sender's side, the message just silently vanished back into the
// draft box with no explanation. This gives the visible banner above the
// composer something concrete to say instead of a generic "something went
// wrong".
function describeSendError() {
  return "Couldn't send that — please try again.";
}

function formatMessageTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

// Short label for a message shown as a quote — in the reply-preview bar
// above the composer, and in the quoted snippet inside a reply bubble.
function replyPreviewLabel(msg) {
  if (!msg) return '…';
  if (msg.kind === 'image') return '📷 Photo';
  if (msg.kind === 'sticker') {
    const s = stickerById(msg.plaintext);
    return s ? `${s.emoji} Sticker` : '🏷️ Sticker';
  }
  if (msg.kind === 'gif') return '🎞️ GIF';
  if (msg.kind === 'voice') return '🎤 Voice note';
  return msg.plaintext ?? '…';
}

// Which conversation (if any) was open before the user navigated away from
// /chat — restored on remount so visiting Settings and coming back reopens
// the same thread instead of dropping back to the setup screen.
const ACTIVE_CHAT_KEY = 'tinytalks:activeChat';

export default function Chat() {
  const { user, logout } = useAuth();
  const { onlineUserIds, userChannel: channel, presenceReady } = useRealtime();
  const navigate = useNavigate();
  const activeConversationIdRef = useRef(null); // read inside the Pusher handlers bound once at mount
  const conversationsRef = useRef([]); // same reason — lets the presence handlers below see the current list without re-binding
  const prevOnlineRef = useRef(null); // last onlineUserIds snapshot, to diff for disconnect/reconnect notices

  const [view, setView] = useState('setup'); // 'setup' | 'thread'
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messagesByConv, setMessagesByConv] = useState({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [conversationGone, setConversationGone] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileSidebarTab, setMobileSidebarTab] = useState('history'); // 'friends' | 'history'

  const [friends, setFriends] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [friendActionBusy, setFriendActionBusy] = useState(null); // userId currently being acted on
  const [replyingTo, setReplyingTo] = useState(null); // the message object being replied to, or null
  const [editingId, setEditingId] = useState(null); // id of the message currently being edited, or null
  const [editDraft, setEditDraft] = useState('');

  const [queueStatus, setQueueStatus] = useState('idle'); // idle | waiting
  const [desiredGender, setDesiredGender] = useState('ANY');
  const [draft, setDraft] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [imageVerifiedNotice, setImageVerifiedNotice] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  // A failed send/edit used to just log to the console and silently
  // restore the draft — which reads as "my message vanished for no
  // reason" from the user's side. This surfaces it instead.
  const [sendError, setSendError] = useState(null);
  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);
  const nearBottomRef = useRef(true); // whether the thread is scrolled near its bottom right now
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);

  const imageVerified = Boolean(user?.otpVerified && user?.ageEstimationPassed);
  const isAdmin = user?.accountType === 'ADMIN';
  const activeConv = conversations.find((c) => c.id === activeConversationId) || null;
  const activeMessages = messagesByConv[activeConversationId] || [];
  const canSend = Boolean(activeConversationId);

  useSeo({ title: 'Chat — tinytalks.live', noindex: true, path: '/chat' });

  useEffect(() => { activeConversationIdRef.current = activeConversationId; }, [activeConversationId]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);

  // Remembers whichever thread is open so a remount (navigating to Settings
  // and back — Chat unmounts on every route change) can restore it, instead
  // of silently resetting to the setup screen as if the chat had ended.
  useEffect(() => {
    if (view === 'thread' && activeConversationId) {
      sessionStorage.setItem(ACTIVE_CHAT_KEY, activeConversationId);
    } else {
      sessionStorage.removeItem(ACTIVE_CHAT_KEY);
    }
  }, [view, activeConversationId]);

  useEffect(() => {
    api.get('/messages/conversations')
      .then(({ data }) => {
        const list = data.conversations.map((c) => ({ ...c, hasUnread: false }));
        setConversations(list);
        const savedId = sessionStorage.getItem(ACTIVE_CHAT_KEY);
        if (savedId && list.some((c) => c.id === savedId)) {
          openConversation(savedId);
        }
      })
      .catch(() => {});
    api.get('/friends')
      .then(({ data }) => {
        setFriends(data.friends);
        setIncomingRequests(data.incomingRequests);
        setOutgoingRequests(data.outgoingRequests);
      })
      .catch(() => {});

    // Only ever leaves the matchmaking queue on unmount — the Pusher
    // connection itself now lives in RealtimeProvider (see lib/realtime.jsx)
    // for the whole session, so navigating away from this page no longer
    // drops the socket, the presence roster, or any open conversation.
    return () => {
      api.post('/queue/leave').catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pusher event bindings, kept in their own effect keyed off the shared
  // channel from RealtimeProvider — this only attaches/detaches THIS page's
  // listeners (by reference, via unbind) on mount/unmount, never touches
  // the underlying subscription or connection.
  useEffect(() => {
    if (!channel) return; // briefly null right after login, before the provider finishes subscribing

    const onMatched = async ({ conversationId: cid, partnerId: pid }) => {
      await handleMatched(cid, pid);
    };

    // Reaches only the OTHER participant (see server/src/routes/messages.js
    // and images.js — notifyUser targets the partner, never the sender),
    // so an incoming message here is always FROM the partner of whichever
    // conversation it names, whether or not that thread is the one
    // currently open on screen.
    const onMessage = (msg) => {
      const isActive = msg.conversationId === activeConversationIdRef.current;
      const incoming = msg.senderId !== user.id;

      setMessagesByConv((prev) => {
        const existing = prev[msg.conversationId] || [];
        // Every one of a user's own devices is notified on every send/edit
        // (see server/src/routes/messages.js /send — notifies both
        // participants), including whichever device/tab actually sent it —
        // that tab already appended the message to state synchronously
        // right after its own POST resolved, so this echo would otherwise
        // double it up.
        if (existing.some((m) => m.id === msg.id)) return prev;

        let plaintext;
        let voiceNote;
        if (msg.kind === 'image') {
          plaintext = undefined; // ImageBubble manages its own fetch-on-open flow
        } else if (msg.kind === 'voice') {
          plaintext = undefined;
          voiceNote = { id: msg.voiceNoteId, durationSec: msg.durationSec };
        } else {
          plaintext = msg.text;
        }

        return {
          ...prev,
          [msg.conversationId]: [...existing, { ...msg, voiceNote, plaintext, incoming }],
        };
      });
      setConversations((prev) => {
        const bumped = bumpConversation(prev, msg.conversationId, {
          id: msg.id, kind: msg.kind, text: msg.text, senderId: msg.senderId, createdAt: msg.createdAt,
        });
        if (bumped === prev) {
          // A message for a conversation we don't have listed yet (e.g. a
          // match made just before this tab loaded) — true up from the server.
          api.get('/messages/conversations')
            .then(({ data }) => setConversations(data.conversations.map((c) => ({ ...c, hasUnread: c.id !== activeConversationIdRef.current }))))
            .catch(() => {});
          return prev;
        }
        return bumped.map((c) => (c.id === msg.conversationId ? { ...c, hasUnread: incoming && !isActive } : c));
      });
    };

    // A text message got edited — either by the partner, or echoed back to
    // our own other devices/tabs after we ourselves edited it (see
    // server/src/routes/messages.js PATCH /:messageId — notifies both
    // participants). If this is the tab that made the edit, saveEdit()
    // already applied the new text locally, but re-applying it here from
    // the server's own copy is harmless and keeps every tab consistent.
    const onEdited = (msg) => {
      setMessagesByConv((prev) => {
        const list = prev[msg.conversationId];
        if (!list) return prev;
        return {
          ...prev,
          [msg.conversationId]: list.map((m) => (
            m.id === msg.id ? { ...m, plaintext: msg.text, editedAt: msg.editedAt } : m
          )),
        };
      });
    };

    // Friend requests/acceptances land on this same private channel — just
    // re-pull the friends list rather than trying to patch it in place,
    // since a request can auto-accept server-side (mutual interest).
    const onFriendRequest = () => { refreshFriends(); };
    const onFriendAccepted = () => { refreshFriends(); };

    // Either participant cleared this conversation's history (see the
    // "Clear chat" button below / DELETE /messages/:id/history) — drop it
    // from local state on both ends so an already-open window updates live
    // instead of showing messages the server no longer has.
    const onCleared = (data) => {
      setMessagesByConv((prev) => {
        if (!prev[data.conversationId]) return prev;
        return { ...prev, [data.conversationId]: [] };
      });
    };

    channel.bind('queue:matched', onMatched);
    channel.bind('message:new', onMessage);
    channel.bind('message:edited', onEdited);
    channel.bind('friend:request', onFriendRequest);
    channel.bind('friend:accepted', onFriendAccepted);
    channel.bind('conversation:cleared', onCleared);

    return () => {
      channel.unbind('queue:matched', onMatched);
      channel.unbind('message:new', onMessage);
      channel.unbind('message:edited', onEdited);
      channel.unbind('friend:request', onFriendRequest);
      channel.unbind('friend:accepted', onFriendAccepted);
      channel.unbind('conversation:cleared', onCleared);
    };
  }, [channel]);

  // Diffs the shared online-user roster (from RealtimeProvider) against its
  // previous snapshot, and drops a system notice into any open-this-session
  // conversation whose partner just disconnected or reconnected.
  useEffect(() => {
    if (!presenceReady) return; // initial roster hasn't arrived yet — nothing to diff against
    const prevSet = prevOnlineRef.current;
    // prevSet is only null on the very first run after presence becomes
    // ready (including right after a remount, e.g. returning from Settings)
    // — that first snapshot is "who's already online", not a batch of
    // real connect events, so it's stored but never diffed/announced.
    if (prevSet) {
      for (const uid of prevSet) {
        if (!onlineUserIds.has(uid)) {
          const conv = conversationsRef.current.find((c) => c.partnerId === uid);
          if (conv) injectSystemNotice(conv.id, `${conv.partnerDisplayName || 'They'} disconnected`);
        }
      }
      for (const uid of onlineUserIds) {
        if (!prevSet.has(uid)) {
          const conv = conversationsRef.current.find((c) => c.partnerId === uid);
          if (conv) injectSystemNotice(conv.id, `${conv.partnerDisplayName || 'They'} reconnected`);
        }
      }
    }
    prevOnlineRef.current = new Set(onlineUserIds);
  }, [onlineUserIds, presenceReady]);

  function injectSystemNotice(conversationId, text) {
    setMessagesByConv((prev) => {
      if (prev[conversationId] === undefined) return prev; // never opened this session — nothing to append to
      return {
        ...prev,
        [conversationId]: [...prev[conversationId], {
          id: `sys-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          kind: 'system',
          text,
          createdAt: new Date().toISOString(),
        }],
      };
    });
  }

  // Smart auto-scroll: jump to the newest message when the user is already
  // near the bottom (the normal case — sending, or reading live), but don't
  // yank them away from wherever they've scrolled up to read older history.
  // While away from the bottom, a "New messages" pill (below) offers a
  // manual jump instead.
  useEffect(() => {
    if (historyLoading) return; // wait for bubbles to actually render before scrolling to them
    const el = scrollRef.current;
    if (!el) return;
    if (nearBottomRef.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      setShowJumpToBottom(false);
    } else {
      setShowJumpToBottom(true);
    }
  }, [activeMessages, historyLoading]);

  // Opening a (possibly different) thread always starts pinned to its
  // bottom, regardless of where the previous thread had been scrolled to.
  useEffect(() => {
    nearBottomRef.current = true;
    setShowJumpToBottom(false);
    setSendError(null);
  }, [activeConversationId]);

  function handleThreadScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < 120;
    nearBottomRef.current = nearBottom;
    if (nearBottom) setShowJumpToBottom(false);
  }

  function jumpToBottom() {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    nearBottomRef.current = true;
    setShowJumpToBottom(false);
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

  async function refreshFriends() {
    try {
      const { data } = await api.get('/friends');
      setFriends(data.friends);
      setIncomingRequests(data.incomingRequests);
      setOutgoingRequests(data.outgoingRequests);
    } catch (err) {
      console.error(err);
    }
  }

  function friendStatusFor(partnerId) {
    if (!partnerId) return 'none';
    if (friends.some((f) => f.userId === partnerId)) return 'friends';
    if (outgoingRequests.some((f) => f.userId === partnerId)) return 'outgoing';
    if (incomingRequests.some((f) => f.userId === partnerId)) return 'incoming';
    return 'none';
  }

  async function sendFriendRequest(userId) {
    setFriendActionBusy(userId);
    try {
      await api.post(`/friends/${userId}/request`);
      await refreshFriends();
    } catch (err) {
      console.error(err);
    } finally {
      setFriendActionBusy(null);
    }
  }

  async function acceptFriendRequest(userId) {
    setFriendActionBusy(userId);
    try {
      await api.post(`/friends/${userId}/accept`);
      await refreshFriends();
    } catch (err) {
      console.error(err);
    } finally {
      setFriendActionBusy(null);
    }
  }

  async function removeFriendOrRequest(userId) {
    setFriendActionBusy(userId);
    try {
      await api.delete(`/friends/${userId}`);
      await refreshFriends();
    } catch (err) {
      console.error(err);
    } finally {
      setFriendActionBusy(null);
    }
  }

  async function startChatWithFriend(userId) {
    setFriendActionBusy(userId);
    try {
      const { data } = await api.post(`/friends/${userId}/start-chat`);
      const { conversationId: cid, partnerId: pid } = data;
      setConversations((prev) => {
        if (prev.some((c) => c.id === cid)) return prev;
        const friend = friends.find((f) => f.userId === pid);
        return [{ id: cid, partnerId: pid, partnerDisplayName: friend?.displayName || 'Anonymous', createdAt: new Date().toISOString(), endedAt: null, lastMessage: null, hasUnread: false }, ...prev];
      });
      await openConversation(cid);
    } catch (err) {
      console.error(err);
    } finally {
      setFriendActionBusy(null);
    }
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
  }

  async function openConversation(id) {
    setActiveConversationId(id);
    setView('thread');
    setSidebarOpen(false);
    setConversationGone(false);
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, hasUnread: false } : c)));

    if (messagesByConv[id] !== undefined) return; // already loaded this session

    setHistoryLoading(true);
    try {
      const { data } = await api.get(`/messages/${id}`);
      const decoded = data.messages.map((m) => decodeHistoryMessage(m, user.id));
      setMessagesByConv((prev) => ({ ...prev, [id]: decoded }));
    } catch (err) {
      console.error(err);
      if (err.response?.status === 404) {
        // The conversation row itself is gone server-side — most commonly
        // because the other participant was a guest whose account (and
        // everything tied to it, via onDelete: Cascade in schema.prisma)
        // was purged by the nightly retention job after their 2-day
        // window. That's permanent, not "no messages yet", so this drops
        // it from the sidebar instead of leaving a dead entry that looks
        // identical to a brand-new empty chat every time it's reopened.
        setConversationGone(true);
        setConversations((prev) => prev.filter((c) => c.id !== id));
      }
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

  const [clearBusy, setClearBusy] = useState(false);
  // Wipes the conversation's history outright for BOTH participants, not
  // just hiding it locally — a general "start this conversation over" tool
  // (it used to also be the only fix for old messages encrypted under a
  // key that no longer existed anywhere; that scheme is gone now, but the
  // button's still useful).
  async function clearHistory() {
    if (!activeConv) return;
    if (!window.confirm("Clear this conversation's history for both of you? This removes every message and can't be undone.")) return;
    setClearBusy(true);
    try {
      await api.delete(`/messages/${activeConv.id}/history`);
      setMessagesByConv((prev) => ({ ...prev, [activeConv.id]: [] }));
    } catch (err) {
      console.error(err);
      window.alert(getErrorMessage(err, "Couldn't clear this conversation."));
    } finally {
      setClearBusy(false);
    }
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
    // Belt-and-suspenders: the composer already converts shortcuts live as
    // you type (see onChange below), but this catches anything that slipped
    // through — pasted text, for instance.
    const text = applyEmojiShortcuts(draft.trim());
    if (!text || !activeConversationId || !activeConv) return;

    const replyTarget = replyingTo;
    setDraft('');
    setReplyingTo(null);
    setSendError(null);

    try {
      const { data } = await api.post('/messages/send', {
        conversationId: activeConversationId,
        text,
        kind: 'text',
        replyToId: replyTarget?.id || null,
      });
      const createdAt = new Date().toISOString();
      setMessagesByConv((prev) => ({
        ...prev,
        [activeConversationId]: [...(prev[activeConversationId] || []), {
          id: data.messageId, kind: 'text', plaintext: text, replyToId: data.replyToId || null, incoming: false, createdAt,
        }],
      }));
      setConversations((prev) => bumpConversation(prev, activeConversationId, {
        id: data.messageId, kind: 'text', senderId: user.id, createdAt,
      }));
    } catch (err) {
      console.error(err);
      setSendError(describeSendError());
      setDraft(text); // don't lose the draft on a failed send
      setReplyingTo(replyTarget); // ...or the reply target it was attached to
    }
  }

  function startEdit(message) {
    setEditingId(message.id);
    setEditDraft(message.plaintext || '');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft('');
  }

  async function saveEdit(messageId) {
    const text = applyEmojiShortcuts(editDraft.trim());
    if (!text || !activeConv) return;

    setSendError(null);

    try {
      const { data } = await api.patch(`/messages/${messageId}`, { text });
      setMessagesByConv((prev) => ({
        ...prev,
        [activeConversationId]: (prev[activeConversationId] || []).map((m) => (
          m.id === messageId ? { ...m, plaintext: text, editedAt: data.editedAt } : m
        )),
      }));
      setEditingId(null);
      setEditDraft('');
    } catch (err) {
      console.error(err);
      setSendError(describeSendError());
      // leave the edit box open with its draft intact so nothing is lost
    }
  }

  async function sendImage(file, viewMode) {
    if (!file || !activeConversationId) return;

    const fd = new FormData();
    fd.append('image', file);
    fd.append('conversationId', activeConversationId);
    fd.append('viewMode', viewMode);

    // No explicit Content-Type here — axios/the browser needs to set it
    // itself for a FormData body, since it has to include a `boundary=...`
    // parameter the multipart body is actually delimited with. Setting
    // 'multipart/form-data' by hand (as this used to) sends that header
    // with no boundary, which made the server's multer/busboy parser
    // throw on every request — every upload in the app had this bug.
    const { data } = await api.post('/images', fd);
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

  // Voice notes are single-device only, same as images (see the VoiceNote
  // model comment in schema.prisma and VoiceNoteBubble.jsx). Keeps a local
  // object URL of the recording for this tab only, so the sender can play
  // back what they just sent without ever hitting the erase-on-listen
  // endpoint — mirroring sendImage's localPreviewUrl above, for the same
  // reason (see VoiceNoteBubble's header comment).
  async function sendVoiceNote(blob, durationSec) {
    if (!blob || !activeConversationId) return;

    const fd = new FormData();
    fd.append('audio', blob, 'blob.bin');
    fd.append('conversationId', activeConversationId);
    fd.append('durationSec', String(durationSec));

    try {
      // See the matching comment in sendImage above — no explicit
      // Content-Type for a FormData body.
      const { data } = await api.post('/voice-notes', fd);
      const createdAt = new Date().toISOString();
      setMessagesByConv((prev) => ({
        ...prev,
        [activeConversationId]: [...(prev[activeConversationId] || []), {
          id: data.messageId,
          kind: 'voice',
          voiceNote: data.voiceNote,
          incoming: false,
          localBlobUrl: URL.createObjectURL(blob),
          createdAt,
        }],
      }));
      setConversations((prev) => bumpConversation(prev, activeConversationId, {
        id: data.messageId, kind: 'voice', senderId: user.id, createdAt,
      }));
    } catch (err) {
      console.error(err);
      // Shows the server's actual reason (see the matching change in
      // routes/voiceNotes.js) instead of a fixed generic message — this
      // bug has been hard to pin down over several rounds precisely
      // because "please try again" hid whatever the real cause was.
      window.alert(getErrorMessage(err, "Couldn't send that voice note — please try again."));
    }
  }

  // Marks a voice note as consumed in local state too (not just inside
  // VoiceNoteBubble's own component state) so it reads "played" even if the
  // bubble were to remount later in the same session.
  function markVoiceConsumed(messageId) {
    setMessagesByConv((prev) => ({
      ...prev,
      [activeConversationId]: (prev[activeConversationId] || []).map((m) => (
        m.id === messageId ? { ...m, voiceNote: null } : m
      )),
    }));
  }

  // Stickers and GIFs both piggyback on the plain-text send path: the
  // "text" being sent is just a sticker id or a GIF's CDN URL, and a
  // distinct `kind` is what tells the sidebar/bubble how to render it
  // instead of showing that raw payload. Same reply-target handling as a
  // normal text send.
  async function sendPayload(kind, payloadText) {
    if (!payloadText || !activeConversationId || !activeConv) return;

    const replyTarget = replyingTo;
    setReplyingTo(null);
    setSendError(null);

    try {
      const { data } = await api.post('/messages/send', {
        conversationId: activeConversationId,
        text: payloadText,
        kind,
        replyToId: replyTarget?.id || null,
      });
      const createdAt = new Date().toISOString();
      setMessagesByConv((prev) => ({
        ...prev,
        [activeConversationId]: [...(prev[activeConversationId] || []), {
          id: data.messageId, kind, plaintext: payloadText, replyToId: data.replyToId || null, incoming: false, createdAt,
        }],
      }));
      setConversations((prev) => bumpConversation(prev, activeConversationId, {
        id: data.messageId, kind, senderId: user.id, createdAt,
      }));
    } catch (err) {
      console.error(err);
      setSendError(describeSendError());
      setReplyingTo(replyTarget);
    }
  }

  function sendSticker(stickerId) {
    sendPayload('sticker', stickerId);
  }

  function sendGif(url) {
    sendPayload('gif', url);
  }

  const friendsPanelProps = {
    user,
    activeConv,
    view,
    incomingRequests,
    friends,
    friendActionBusy,
    onlineUserIds,
    onAccept: acceptFriendRequest,
    onRemove: removeFriendOrRequest,
    onStartChat: startChatWithFriend,
  };
  const historyPanelProps = {
    conversations,
    activeConversationId,
    view,
    onNewChat: () => { setView('setup'); setSidebarOpen(false); },
    onOpen: openConversation,
    myUserId: user.id,
  };

  return (
    <div className="h-screen h-dvh flex flex-col overflow-hidden">
      <header className="shrink-0 sticky top-0 z-20 bg-white dark:bg-ink-950 flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-200 dark:border-white/5">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setMobileSidebarTab('friends'); setSidebarOpen(true); }}
            className="lg:hidden relative text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-lg leading-none px-1"
            aria-label="Friends and profile"
          >
            👥
            {incomingRequests.length > 0 && (
              <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-coral-500" />
            )}
          </button>
          <button
            onClick={() => { setMobileSidebarTab('history'); setSidebarOpen(true); }}
            className="lg:hidden text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-lg leading-none px-1"
            aria-label="Chat history"
          >
            ☰
          </button>
          <Logo size={28} />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
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
          {isAdmin && <ViewToggle active="chat" />}
          <button onClick={() => { logout(); navigate('/'); }} className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
            Log out
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Mobile drawer: tab-switched Friends / History, overlaying the
            whole screen. Desktop instead shows both as permanent columns
            (below), so this element is hidden at the lg breakpoint. */}
        <aside className={`${sidebarOpen ? 'flex' : 'hidden'} lg:hidden flex-col w-full sm:w-80 shrink-0 fixed inset-0 z-40 bg-white dark:bg-ink-950`}>
          <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-white/5">
            <div className="flex gap-1.5">
              <button
                onClick={() => setMobileSidebarTab('friends')}
                className={`text-sm font-medium px-3 py-1 rounded-full transition-colors ${mobileSidebarTab === 'friends' ? 'bg-violet-500/15 text-violet-600 dark:text-violet-300' : 'text-slate-500 dark:text-slate-400'}`}
              >
                Friends
              </button>
              <button
                onClick={() => setMobileSidebarTab('history')}
                className={`text-sm font-medium px-3 py-1 rounded-full transition-colors ${mobileSidebarTab === 'history' ? 'bg-violet-500/15 text-violet-600 dark:text-violet-300' : 'text-slate-500 dark:text-slate-400'}`}
              >
                History
              </button>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="text-slate-500 dark:text-slate-400 text-lg leading-none px-1" aria-label="Close">✕</button>
          </div>
          {/* min-h-0, not its own overflow-y-auto — each panel already
              freezes its own header and only scrolls its own list (see
              FriendsPanel/HistoryPanel below); scrolling the whole panel
              here instead would carry that header away with it. */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {mobileSidebarTab === 'friends' ? <FriendsPanel {...friendsPanelProps} /> : <HistoryPanel {...historyPanelProps} />}
          </div>
        </aside>

        {/* Desktop left sidebar: profile shortcut, current chat, friends. */}
        <aside className="hidden lg:flex flex-col w-72 shrink-0 border-r border-slate-200 dark:border-white/5">
          <FriendsPanel {...friendsPanelProps} />
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
              {/* Sticky within the thread column — like a spreadsheet's
                  frozen header row, this stays put while the message list
                  below scrolls, no matter how long the conversation gets. */}
              <div className="shrink-0 sticky top-0 z-10 bg-white dark:bg-ink-950 flex flex-wrap items-center justify-between gap-2 pb-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="chip bg-mint-500/10 border-mint-500/30 text-mint-400">
                    {activeConv.partnerDisplayName}
                  </span>
                  <span
                    className={`chip ${onlineUserIds.has(activeConv.partnerId)
                      ? 'bg-mint-500/10 border-mint-500/30 text-mint-400'
                      : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500'}`}
                  >
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full mr-1.5 align-middle ${onlineUserIds.has(activeConv.partnerId) ? 'bg-mint-500' : 'bg-slate-400 dark:bg-slate-500'}`}
                    />
                    {onlineUserIds.has(activeConv.partnerId) ? 'Online' : 'Offline'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <FriendActionButton
                    status={friendStatusFor(activeConv.partnerId)}
                    busy={friendActionBusy === activeConv.partnerId}
                    onAdd={() => sendFriendRequest(activeConv.partnerId)}
                    onAccept={() => acceptFriendRequest(activeConv.partnerId)}
                  />
                  <button className="btn-secondary !py-1.5 !px-3 text-sm" onClick={() => setReportOpen(true)}>Report</button>
                  <button className="btn-secondary !py-1.5 !px-3 text-sm" onClick={blockPartner} disabled={blockBusy}>
                    {blockBusy ? 'Blocking…' : 'Block'}
                  </button>
                  <button
                    className="btn-secondary !py-1.5 !px-3 text-sm"
                    onClick={clearHistory}
                    disabled={clearBusy}
                    title="Permanently clears this chat's history for both of you — the fix for old 'Could not decrypt' messages"
                  >
                    {clearBusy ? 'Clearing…' : 'Clear chat'}
                  </button>
                  <button className="btn-secondary !py-1.5 !px-3 text-sm" onClick={closeThread}>Close</button>
                </div>
              </div>

              {/* min-h-0 (not a min-height like 50vh) is what actually lets
                  this flex child shrink to fit the space left over by the
                  frozen header/composer above and below it, instead of
                  forcing the whole page to grow and scroll as a unit. The
                  wrapping relative/absolute pair lets the "New messages"
                  pill float over the scroll area without being clipped or
                  scrolling away with it. */}
              <div className="relative flex-1 min-h-0">
              <div
                ref={scrollRef}
                onScroll={handleThreadScroll}
                className="absolute inset-0 overflow-y-auto card p-3 sm:p-4 space-y-3"
              >
                {historyLoading && <p className="text-center text-sm text-slate-500 mt-10">Loading…</p>}
                {!historyLoading && activeMessages.map((m, i) => {
                  if (m.kind === 'system') {
                    return (
                      <div key={m.id} className="flex justify-center">
                        <span className="text-xs text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-white/5 rounded-full px-3 py-1">
                          {m.text}
                        </span>
                      </div>
                    );
                  }
                  // Only label the first message of a run from the same
                  // sender (like most chat apps) rather than repeating a
                  // name above every single bubble — in a 1:1 thread the
                  // sender only ever flips between "me" and "them", so
                  // comparing `incoming` to the previous message is enough.
                  const prev = activeMessages[i - 1];
                  const showName = i === 0 || prev.kind === 'system' || prev.incoming !== m.incoming;
                  const senderName = m.incoming ? (activeConv.partnerDisplayName || 'Anonymous') : 'You';
                  const repliedTo = m.replyToId ? activeMessages.find((x) => x.id === m.replyToId) : null;
                  return (
                    <MessageBubble
                      key={m.id}
                      message={m}
                      senderName={showName ? senderName : null}
                      repliedTo={repliedTo}
                      onReply={() => setReplyingTo(m)}
                      isEditing={editingId === m.id}
                      editDraft={editDraft}
                      onEditDraftChange={setEditDraft}
                      onStartEdit={!m.incoming && m.kind === 'text' ? () => startEdit(m) : null}
                      onSaveEdit={() => saveEdit(m.id)}
                      onCancelEdit={cancelEdit}
                      onVoiceConsumed={() => markVoiceConsumed(m.id)}
                    />
                  );
                })}
                {!historyLoading && activeMessages.length === 0 && (
                  <p className="text-center text-sm text-slate-500 mt-10">Say hi 👋</p>
                )}
              </div>
              {showJumpToBottom && (
                <button
                  type="button"
                  onClick={jumpToBottom}
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 chip bg-violet-600 border-violet-500 text-white shadow-lg hover:bg-violet-500"
                >
                  ↓ New messages
                </button>
              )}
              </div>

              {sendError && (
                <div className="shrink-0 flex items-center justify-between gap-2 rounded-lg px-3 py-2 bg-coral-500/10 border-l-2 border-coral-500 text-xs text-coral-500 dark:text-coral-400">
                  <span>⚠️ {sendError}</span>
                  <button type="button" onClick={() => setSendError(null)} className="text-coral-500 hover:text-coral-600 px-1 shrink-0" aria-label="Dismiss">
                    ✕
                  </button>
                </div>
              )}

              {replyingTo && (
                <div className="shrink-0 flex items-center justify-between gap-2 rounded-lg px-3 py-2 bg-slate-100 dark:bg-white/5 border-l-2 border-violet-400 text-xs">
                  <div className="min-w-0">
                    <p className="text-slate-400 dark:text-slate-500">
                      Replying to {replyingTo.incoming ? (activeConv.partnerDisplayName || 'Anonymous') : 'yourself'}
                    </p>
                    <p className="truncate text-slate-600 dark:text-slate-300">
                      {replyPreviewLabel(replyingTo)}
                    </p>
                  </div>
                  <button type="button" onClick={() => setReplyingTo(null)} className="text-slate-400 hover:text-coral-500 px-1 shrink-0" aria-label="Cancel reply">
                    ✕
                  </button>
                </div>
              )}

              <form onSubmit={sendText} className="shrink-0 flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-secondary !px-3"
                  title={imageVerified ? 'Send a self-destructing image' : 'Verify to unlock image sharing'}
                >
                  📷
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onPickImage} />
                <PickerTabs
                  onEmoji={(emoji) => setDraft((d) => `${d}${emoji}`)}
                  onSticker={sendSticker}
                  onGif={sendGif}
                />
                <VoiceRecorder onRecorded={sendVoiceNote} disabled={!canSend} />
                <input
                  className="input flex-1 min-w-0"
                  placeholder="Type a message… try :) or :fire:"
                  value={draft}
                  onChange={(e) => setDraft(applyEmojiShortcuts(e.target.value))}
                />
                <button className="btn-primary shrink-0" disabled={!canSend}>Send</button>
              </form>
            </>
          )}

          {view === 'thread' && !activeConv && conversationGone && (
            <div className="card p-6 flex-1 flex flex-col items-center justify-center gap-3 text-center">
              <p className="font-display font-semibold text-slate-900 dark:text-slate-100">
                This conversation is no longer available
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
                The other person's guest session expired and their data was permanently deleted, so
                there's no history left to show. Guest accounts (and everything tied to them) are
                automatically removed 2 days after they're created.
              </p>
              <button className="btn-secondary mt-2" onClick={() => setView('setup')}>Back</button>
            </div>
          )}
        </main>

        {/* Desktop right sidebar: chat history across all conversations
            (random matches and friend chats alike — both live in the same
            Conversation table, see server/src/routes/friends.js). */}
        <aside className="hidden lg:flex flex-col w-72 shrink-0 border-l border-slate-200 dark:border-white/5">
          <HistoryPanel {...historyPanelProps} />
        </aside>
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

// Small pill in the thread header reflecting the friend-relationship state
// with whoever the current conversation partner is — works for both random
// matches (where "add friend" is how a good chat becomes a lasting one) and
// existing friend chats (where it just confirms the ✓ Friends state).
function FriendActionButton({ status, busy, onAdd, onAccept }) {
  if (status === 'friends') {
    return <span className="chip bg-mint-500/10 border-mint-500/30 text-mint-400">✓ Friends</span>;
  }
  if (status === 'outgoing') {
    return <button className="btn-secondary !py-1.5 !px-3 text-sm" disabled>Request sent</button>;
  }
  if (status === 'incoming') {
    return (
      <button className="btn-secondary !py-1.5 !px-3 text-sm" onClick={onAccept} disabled={busy}>
        Accept friend request
      </button>
    );
  }
  return (
    <button className="btn-secondary !py-1.5 !px-3 text-sm" onClick={onAdd} disabled={busy}>
      + Add friend
    </button>
  );
}

// Left-sidebar content on desktop, "Friends" tab of the mobile drawer.
// Shows a profile shortcut, a pointer to whichever conversation is
// currently open, incoming friend requests, and the friends list itself —
// clicking a friend opens (or starts) a direct chat with them, same as
// Chitchat's layout the user referenced.
function FriendsPanel({ user, activeConv, view, incomingRequests, friends, friendActionBusy, onlineUserIds, onAccept, onRemove, onStartChat }) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-slate-200 dark:border-white/5">
        <Link to="/settings" className="flex items-center gap-3 group">
          <span className="h-10 w-10 rounded-full bg-brand-gradient flex items-center justify-center text-white font-display font-semibold overflow-hidden shrink-0">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              (user?.displayName?.[0] || 'A').toUpperCase()
            )}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium truncate group-hover:underline">{user?.displayName || 'Anonymous'}</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">⚙ Profile &amp; settings</span>
          </span>
        </Link>
      </div>

      {view === 'thread' && activeConv && (
        <div className="p-3 border-b border-slate-200 dark:border-white/5">
          <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5 px-1">Current chat</p>
          <div className="rounded-lg px-3 py-2 bg-violet-500/10 text-sm font-medium truncate">
            {activeConv.partnerDisplayName}
          </div>
        </div>
      )}

      {incomingRequests.length > 0 && (
        <div className="p-3 border-b border-slate-200 dark:border-white/5">
          <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5 px-1">Friend requests</p>
          <div className="space-y-1.5">
            {incomingRequests.map((r) => (
              <div key={r.userId} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 bg-slate-100 dark:bg-white/5">
                <span className="text-sm truncate">{r.displayName}</span>
                <div className="flex gap-1 shrink-0">
                  <button
                    className="text-xs px-2 py-1 rounded-md bg-mint-500/20 text-mint-500 hover:bg-mint-500/30 disabled:opacity-50"
                    onClick={() => onAccept(r.userId)}
                    disabled={friendActionBusy === r.userId}
                  >
                    Accept
                  </button>
                  <button
                    className="text-xs px-2 py-1 rounded-md bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 disabled:opacity-50"
                    onClick={() => onRemove(r.userId)}
                    disabled={friendActionBusy === r.userId}
                    title="Decline"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5 px-1">Friends</p>
        {friends.length === 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400 px-1 py-2">
            No friends yet — add someone from a chat.
          </p>
        )}
        <div className="space-y-1">
          {friends.map((f) => (
            <div key={f.userId} className="group flex items-start gap-1">
              <button
                onClick={() => onStartChat(f.userId)}
                disabled={friendActionBusy === f.userId}
                className="flex-1 min-w-0 text-left rounded-lg px-3 py-2 hover:bg-slate-100 dark:hover:bg-white/5"
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${onlineUserIds?.has(f.userId) ? 'bg-mint-500' : 'bg-slate-300 dark:bg-white/20'}`}
                    title={onlineUserIds?.has(f.userId) ? 'Online' : 'Offline'}
                  />
                  <span className="text-sm truncate">{f.displayName}</span>
                </span>
                {/* Interests are only ever present here if this friend has
                    accepted AND hasn't marked them private (server-side
                    filtering — see routes/friends.js shape()); an empty
                    array just means "nothing to show", not "hidden". */}
                {f.interests?.length > 0 && (
                  <span className="block text-xs text-slate-500 dark:text-slate-400 truncate pl-4 mt-0.5">
                    {f.interests.join(', ')}
                  </span>
                )}
              </button>
              <button
                onClick={() => onRemove(f.userId)}
                disabled={friendActionBusy === f.userId}
                className="opacity-0 group-hover:opacity-100 text-xs text-slate-400 hover:text-coral-500 px-1.5 py-2 disabled:opacity-50"
                title="Remove friend"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Right-sidebar content on desktop, "History" tab of the mobile drawer —
// this is the original chat-history list, unchanged in behavior, just
// relocated so the left side could become the friends/profile panel.
function HistoryPanel({ conversations, activeConversationId, view, onNewChat, onOpen, myUserId }) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-3">
        <button onClick={onNewChat} className="btn-primary w-full !py-2 text-sm">+ New chat</button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 space-y-1">
        {conversations.length === 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400 px-2 py-4 text-center">No chats yet — start one!</p>
        )}
        {conversations.map((c) => (
          <button
            key={c.id}
            onClick={() => onOpen(c.id)}
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
              <ConversationPreviewText conv={c} myUserId={myUserId} />
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

function ConversationPreviewText({ conv, myUserId }) {
  const last = conv.lastMessage;
  if (!last) return 'Say hi 👋';
  const mine = last.senderId === myUserId;
  if (last.kind === 'image') return mine ? 'You: 📷 Photo' : '📷 Photo';
  if (last.kind === 'sticker') {
    const s = last.text ? stickerById(last.text) : null;
    const label = s ? `${s.emoji} Sticker` : '🏷️ Sticker';
    return mine ? `You: ${label}` : label;
  }
  if (last.kind === 'gif') return mine ? 'You: 🎞️ GIF' : '🎞️ GIF';
  if (last.kind === 'voice') return mine ? 'You: 🎤 Voice note' : '🎤 Voice note';
  const text = last.text || '(sent)';
  return mine ? `You: ${text}` : text;
}

function MessageBubble({
  message, senderName, repliedTo, onReply,
  isEditing, editDraft, onEditDraftChange, onStartEdit, onSaveEdit, onCancelEdit, onVoiceConsumed,
}) {
  const isMine = !message.incoming;
  const text = message.plaintext;
  const sticker = message.kind === 'sticker' ? stickerById(text) : null;
  const repliedPreview = repliedTo ? replyPreviewLabel(repliedTo) : null;

  return (
    <div className={`group flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
      {senderName && (
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 px-1 mb-1">
          {senderName}
        </span>
      )}
      <div className={`flex items-end gap-1 max-w-full ${isMine ? 'flex-row-reverse' : ''}`}>
        <div className="max-w-[85%] sm:max-w-[75%] min-w-0">
          {repliedTo && !isEditing && (
            <div className={`mb-1 rounded-lg px-3 py-1.5 text-xs border-l-2 truncate ${isMine ? 'border-white/40 bg-white/10 text-white/80 ml-auto' : 'border-violet-400 bg-slate-100 dark:bg-ink-800 text-slate-500 dark:text-slate-400'}`}>
              {repliedPreview}
            </div>
          )}

          {message.kind === 'text' && isEditing ? (
            <div>
              <textarea
                autoFocus
                rows={2}
                className="input w-full text-sm resize-none"
                value={editDraft}
                onChange={(e) => onEditDraftChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSaveEdit(); }
                  if (e.key === 'Escape') onCancelEdit();
                }}
              />
              <div className="flex gap-3 justify-end mt-1">
                <button type="button" className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" onClick={onCancelEdit}>
                  Cancel
                </button>
                <button type="button" className="text-xs text-violet-500 hover:text-violet-600 font-medium" onClick={onSaveEdit}>
                  Save
                </button>
              </div>
            </div>
          ) : message.kind === 'image' ? (
            <ImageBubble message={message} isMine={isMine} />
          ) : message.kind === 'voice' ? (
            <VoiceNoteBubble message={message} isMine={isMine} onConsumed={onVoiceConsumed} />
          ) : message.kind === 'sticker' ? (
            <div className="flex flex-col items-center gap-0.5 px-2 py-1" title={sticker?.label}>
              <span className="text-6xl leading-none">{sticker?.emoji || '❓'}</span>
              {sticker?.label && <span className="text-[11px] text-slate-400 dark:text-slate-500">{sticker.label}</span>}
            </div>
          ) : message.kind === 'gif' ? (
            <img src={text} alt="GIF" loading="lazy" className="rounded-xl max-h-64 max-w-full bg-slate-100 dark:bg-ink-800" />
          ) : (
            <div className={`rounded-2xl px-4 py-2 text-sm ${isMine ? 'bg-brand-gradient text-white' : 'bg-slate-100 dark:bg-ink-800 text-slate-900 dark:text-slate-100'}`}>
              {text}
            </div>
          )}

          {!isEditing && (
            <div className={`text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 px-1 ${isMine ? 'text-right' : 'text-left'}`}>
              {formatMessageTime(message.createdAt)}{message.editedAt && ' · edited'}
            </div>
          )}
        </div>

        {!isEditing && (
          <div className="flex shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            {onReply && (
              <button type="button" onClick={onReply} className="text-slate-400 hover:text-violet-500 text-sm px-1" title="Reply">
                ↩
              </button>
            )}
            {isMine && message.kind === 'text' && onStartEdit && (
              <button type="button" onClick={onStartEdit} className="text-slate-400 hover:text-violet-500 text-sm px-1" title="Edit">
                ✎
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
