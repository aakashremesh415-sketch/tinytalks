import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { notifyUser } from '../lib/pusher.js';
import { publicImage } from './images.js';
import { publicVoiceNote } from './voiceNotes.js';

const router = Router();

// --- Chat history sidebar ---
// Conversations persist server-side regardless of the ephemeral "matched"
// queue state — a stranger-matched conversation is really just a normal
// conversation row from here on, reopenable any time either participant
// wants, whether or not the other is currently online. This route (fixed
// path, so it must be registered before the /:conversationId param route
// below, or Express would try to treat "conversations" as an id) lists
// them with the single latest message for a sidebar preview; the client
// decrypts that preview itself since only ciphertext lives here.
// Picks whichever ciphertext/nonce THIS requesting device can actually
// decrypt: its own MessageCopy if this message was fanned out (see /send
// below), falling back to the message's own legacy fields for anything
// sent before multi-device support existed (readable only by whichever
// single device originally handled it — unchanged, pre-existing behavior).
function resolveForDevice(message, deviceId) {
  const mine = deviceId && message.copies
    ? message.copies.find((c) => c.deviceId === deviceId)
    : null;
  return {
    ciphertext: mine ? mine.ciphertext : message.ciphertext,
    nonce: mine ? mine.nonce : message.nonce,
  };
}

router.get('/conversations', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ participantAId: userId }, { participantBId: userId }] },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { copies: true } },
      participantA: { select: { id: true, displayName: true } },
      participantB: { select: { id: true, displayName: true } },
    },
  });

  res.json({
    conversations: conversations.map((c) => {
      const partner = c.participantAId === userId ? c.participantB : c.participantA;
      const last = c.messages[0] || null;
      const resolved = last ? resolveForDevice(last, req.deviceId) : null;
      return {
        id: c.id,
        partnerId: partner.id,
        partnerDisplayName: partner.displayName || 'Anonymous',
        createdAt: c.createdAt,
        endedAt: c.endedAt,
        lastMessage: last && {
          id: last.id,
          kind: last.kind,
          ciphertext: resolved.ciphertext,
          nonce: resolved.nonce,
          senderPubKey: last.senderPubKey,
          senderId: last.senderId,
          createdAt: last.createdAt,
        },
      };
    }),
  });
}));

// Full history for one conversation — same participant check as /send.
// Image entries carry availability/viewed state so the client can render
// an already-self-destructed image as gone without a wasted fetch attempt.
router.get('/:conversationId', requireAuth, asyncHandler(async (req, res) => {
  const conversation = await prisma.conversation.findUnique({ where: { id: req.params.conversationId } });
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
  if (![conversation.participantAId, conversation.participantBId].includes(req.user.id)) {
    return res.status(403).json({ error: 'Not a participant in this conversation.' });
  }

  const partnerId = conversation.participantAId === req.user.id
    ? conversation.participantBId
    : conversation.participantAId;

  const messages = await prisma.message.findMany({
    where: { conversationId: req.params.conversationId },
    orderBy: { createdAt: 'asc' },
    include: { image: true, voiceNote: true, copies: true },
  });

  res.json({
    conversationId: conversation.id,
    partnerId,
    endedAt: conversation.endedAt,
    messages: messages.map((m) => {
      const resolved = resolveForDevice(m, req.deviceId);
      return {
        id: m.id,
        kind: m.kind,
        ciphertext: resolved.ciphertext,
        nonce: resolved.nonce,
        senderPubKey: m.senderPubKey,
        senderId: m.senderId,
        replyToId: m.replyToId,
        editedAt: m.editedAt,
        createdAt: m.createdAt,
        image: m.image ? publicImage(m.image) : null,
        voiceNote: m.voiceNote ? publicVoiceNote(m.voiceNote) : null,
      };
    }),
  });
}));

// Relay of an already-E2E-encrypted text/sticker/gif message (replaces the
// old Socket.io 'message:send' handler). The server never sees
// plaintext — every copy in `copies` was produced client-side with
// nacl.box, from the sending device's secret key to one target device's
// published public key (see client/src/lib/crypto.js's
// encryptForDevices). The client is expected to have already fanned this
// out to every one of the recipient's devices AND its own other devices
// (via GET /keys/:userId/all for both sides) — this route just persists
// whatever copies it's handed; it has no way to tell if one was missed.
//
// Notifies BOTH participants' private-user-<id> Pusher channels (not just
// the partner, like the old single-device version did) — every one of a
// user's signed-in devices shares that same channel, so this is what
// makes a message show up live on the sender's OTHER devices too, not
// just on next reload. The full `copies` array rides along in the push
// payload (small — a handful of devices, short ciphertexts) so each
// receiving device can pick out its own without a round trip.
router.post('/send', requireAuth, asyncHandler(async (req, res) => {
  const { conversationId, senderPubKey, kind, replyToId, copies } = req.body;

  if (!conversationId || !senderPubKey || !Array.isArray(copies) || copies.length === 0) {
    return res.status(400).json({ error: 'conversationId, senderPubKey and a non-empty copies array are required.' });
  }
  for (const c of copies) {
    if (!c.deviceId || !c.ciphertext || !c.nonce) {
      return res.status(400).json({ error: 'Each copy needs deviceId, ciphertext and nonce.' });
    }
  }

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
  if (![conversation.participantAId, conversation.participantBId].includes(req.user.id)) {
    return res.status(403).json({ error: 'Not a participant in this conversation.' });
  }

  // Silently drop a replyToId that doesn't check out (belongs to a
  // different conversation, or was deleted between the client reading it
  // and this request landing) rather than failing the whole send over a
  // quote-reply detail — the message still sends, it just isn't quoting
  // anything.
  let validReplyToId = null;
  if (replyToId) {
    const parent = await prisma.message.findUnique({ where: { id: replyToId }, select: { conversationId: true } });
    if (parent && parent.conversationId === conversationId) validReplyToId = replyToId;
  }

  const message = await prisma.message.create({
    data: {
      conversationId,
      senderId: req.user.id,
      ciphertext: '',
      nonce: '',
      senderPubKey,
      kind: kind || 'text',
      replyToId: validReplyToId,
      copies: { create: copies.map((c) => ({ deviceId: c.deviceId, ciphertext: c.ciphertext, nonce: c.nonce })) },
    },
  });

  const partnerId = conversation.participantAId === req.user.id
    ? conversation.participantBId
    : conversation.participantAId;

  const payload = {
    id: message.id,
    conversationId,
    senderId: req.user.id,
    senderPubKey,
    kind: message.kind,
    replyToId: message.replyToId,
    createdAt: message.createdAt,
    copies,
  };
  await Promise.all([
    notifyUser(partnerId, 'message:new', payload),
    notifyUser(req.user.id, 'message:new', payload),
  ]);

  res.status(201).json({ ok: true, messageId: message.id, replyToId: message.replyToId });
}));

// Editing a sent text message — the client re-encrypts the new text for
// every device again (same fan-out as /send) and PATCHes the result over;
// the server just replaces this message's MessageCopy rows and stamps
// editedAt, never seeing plaintext at any point. Only the original sender
// may edit, and only text messages (a sticker/GIF's "text" is an id/URL,
// not something a person edits; an image's ciphertext is the photo
// itself).
router.patch('/:messageId', requireAuth, asyncHandler(async (req, res) => {
  const { senderPubKey, copies } = req.body;
  if (!senderPubKey || !Array.isArray(copies) || copies.length === 0) {
    return res.status(400).json({ error: 'senderPubKey and a non-empty copies array are required.' });
  }
  for (const c of copies) {
    if (!c.deviceId || !c.ciphertext || !c.nonce) {
      return res.status(400).json({ error: 'Each copy needs deviceId, ciphertext and nonce.' });
    }
  }

  const message = await prisma.message.findUnique({ where: { id: req.params.messageId } });
  if (!message) return res.status(404).json({ error: 'Message not found.' });
  if (message.senderId !== req.user.id) {
    return res.status(403).json({ error: 'You can only edit your own messages.' });
  }
  if (message.kind !== 'text') {
    return res.status(400).json({ error: 'Only text messages can be edited.' });
  }

  const conversation = await prisma.conversation.findUnique({ where: { id: message.conversationId } });
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
  const partnerId = conversation.participantAId === req.user.id
    ? conversation.participantBId
    : conversation.participantAId;

  const editedAt = new Date();
  const [updated] = await prisma.$transaction([
    prisma.message.update({ where: { id: message.id }, data: { senderPubKey, editedAt } }),
    prisma.messageCopy.deleteMany({ where: { messageId: message.id } }),
    prisma.messageCopy.createMany({
      data: copies.map((c) => ({ messageId: message.id, deviceId: c.deviceId, ciphertext: c.ciphertext, nonce: c.nonce })),
    }),
  ]);

  const payload = {
    id: updated.id,
    conversationId: updated.conversationId,
    senderPubKey: updated.senderPubKey,
    editedAt: updated.editedAt,
    copies,
  };
  await Promise.all([
    notifyUser(partnerId, 'message:edited', payload),
    notifyUser(req.user.id, 'message:edited', payload),
  ]);

  res.json({ ok: true, editedAt: updated.editedAt });
}));

// Wipes every message in a conversation outright. The practical fix for
// old messages permanently stuck showing "Could not decrypt": once a
// device's key has rotated (localStorage cleared, a fresh browser, an old
// pre-multi-device message whose one-and-only holder is gone) the
// ciphertext encrypted for that old key is unreadable forever — the server
// never had the plaintext to re-encrypt from, so there's no way to
// "repair" these, only to clear them out. Either participant can do this
// for their shared conversation; it's a hard delete of the Message rows
// (cascading to Image/VoiceNote/MessageCopy via onDelete: Cascade in
// schema.prisma), not a soft per-user hide — it clears the history for
// BOTH sides, same as if the conversation just started over. Both
// participants are notified live so an already-open chat window clears
// immediately instead of showing stale messages until a refresh.
router.delete('/:conversationId/history', requireAuth, asyncHandler(async (req, res) => {
  const conversation = await prisma.conversation.findUnique({ where: { id: req.params.conversationId } });
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
  if (![conversation.participantAId, conversation.participantBId].includes(req.user.id)) {
    return res.status(403).json({ error: 'Not a participant in this conversation.' });
  }

  await prisma.message.deleteMany({ where: { conversationId: conversation.id } });

  const partnerId = conversation.participantAId === req.user.id
    ? conversation.participantBId
    : conversation.participantAId;
  await Promise.all([
    notifyUser(partnerId, 'conversation:cleared', { conversationId: conversation.id }),
    notifyUser(req.user.id, 'conversation:cleared', { conversationId: conversation.id }),
  ]);

  res.json({ ok: true });
}));

router.post('/end', requireAuth, asyncHandler(async (req, res) => {
  const { conversationId } = req.body;
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (conversation && [conversation.participantAId, conversation.participantBId].includes(req.user.id)) {
    await prisma.conversation.update({ where: { id: conversationId }, data: { endedAt: new Date() } });
  }
  res.json({ ok: true });
}));

export default router;
