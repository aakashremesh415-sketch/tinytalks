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
// them with the single latest message for a sidebar preview.
router.get('/conversations', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ participantAId: userId }, { participantBId: userId }] },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      participantA: { select: { id: true, displayName: true } },
      participantB: { select: { id: true, displayName: true } },
    },
  });

  res.json({
    conversations: conversations.map((c) => {
      const partner = c.participantAId === userId ? c.participantB : c.participantA;
      const last = c.messages[0] || null;
      return {
        id: c.id,
        partnerId: partner.id,
        partnerDisplayName: partner.displayName || 'Anonymous',
        createdAt: c.createdAt,
        endedAt: c.endedAt,
        lastMessage: last && {
          id: last.id,
          kind: last.kind,
          text: last.text,
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
    include: { image: true, voiceNote: true, reactions: true },
  });

  res.json({
    conversationId: conversation.id,
    partnerId,
    endedAt: conversation.endedAt,
    messages: messages.map((m) => ({
      id: m.id,
      kind: m.kind,
      text: m.text,
      senderId: m.senderId,
      replyToId: m.replyToId,
      editedAt: m.editedAt,
      createdAt: m.createdAt,
      image: m.image ? publicImage(m.image) : null,
      voiceNote: m.voiceNote ? publicVoiceNote(m.voiceNote) : null,
      reactions: m.reactions,
    })),
  });
}));

// Sends a text/sticker/GIF message. This used to relay pre-encrypted
// per-device ciphertext — the app is no longer end-to-end encrypted, so
// this just takes plain text directly and stores it as-is; the server can
// read every message, which is what lets admin moderation actually see
// reported content.
//
// Notifies BOTH participants' private-user-<id> Pusher channels (not just
// the partner) — every one of a user's signed-in devices/tabs shares that
// same channel, so a message shows up live everywhere the sender is signed
// in too, not just on next reload.
router.post('/send', requireAuth, asyncHandler(async (req, res) => {
  const { conversationId, text, kind, replyToId } = req.body;

  if (!conversationId || !text) {
    return res.status(400).json({ error: 'conversationId and text are required.' });
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
      text,
      kind: kind || 'text',
      replyToId: validReplyToId,
    },
  });

  const partnerId = conversation.participantAId === req.user.id
    ? conversation.participantBId
    : conversation.participantAId;

  const payload = {
    id: message.id,
    conversationId,
    senderId: req.user.id,
    text: message.text,
    kind: message.kind,
    replyToId: message.replyToId,
    createdAt: message.createdAt,
  };
  await Promise.all([
    notifyUser(partnerId, 'message:new', payload),
    notifyUser(req.user.id, 'message:new', payload),
  ]);

  res.status(201).json({ ok: true, messageId: message.id, replyToId: message.replyToId, createdAt: message.createdAt });
}));

// Editing a sent text message — only the original sender may edit, and
// only text messages (a sticker/GIF's "text" is an id/URL, not something a
// person edits; an image's storagePath is the photo itself).
router.patch('/:messageId', requireAuth, asyncHandler(async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'text is required.' });
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
  const updated = await prisma.message.update({ where: { id: message.id }, data: { text, editedAt } });

  const payload = {
    id: updated.id,
    conversationId: updated.conversationId,
    text: updated.text,
    editedAt: updated.editedAt,
  };
  await Promise.all([
    notifyUser(partnerId, 'message:edited', payload),
    notifyUser(req.user.id, 'message:edited', payload),
  ]);

  res.json({ ok: true, editedAt: updated.editedAt });
}));

// Wipes every message in a conversation outright. Originally built as the
// fix for old E2E messages permanently stuck showing "Could not decrypt";
// kept now that encryption is gone as a general "start this conversation
// over" tool. Either participant can do this for their shared
// conversation; it's a hard delete of the Message rows (cascading to
// Image/VoiceNote/MessageReaction via onDelete: Cascade in
// schema.prisma), not a soft per-user hide — it clears the history for
// BOTH sides. Both participants are notified live so an already-open chat
// window clears immediately instead of showing stale messages until a
// refresh.
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

// --- Reactions (see MessageReaction in schema.prisma) — a single reaction
// per (message, user); reacting again replaces the previous one. ---
router.put('/:messageId/reactions', requireAuth, asyncHandler(async (req, res) => {
  const { emoji } = req.body;
  if (!emoji) return res.status(400).json({ error: 'emoji is required.' });

  const message = await prisma.message.findUnique({ where: { id: req.params.messageId } });
  if (!message) return res.status(404).json({ error: 'Message not found.' });
  const conversation = await prisma.conversation.findUnique({ where: { id: message.conversationId } });
  if (!conversation || ![conversation.participantAId, conversation.participantBId].includes(req.user.id)) {
    return res.status(403).json({ error: 'Not a participant in this conversation.' });
  }

  await prisma.messageReaction.upsert({
    where: { messageId_userId: { messageId: message.id, userId: req.user.id } },
    update: { emoji },
    create: { messageId: message.id, userId: req.user.id, emoji },
  });

  const partnerId = conversation.participantAId === req.user.id
    ? conversation.participantBId
    : conversation.participantAId;
  const payload = { messageId: message.id, conversationId: message.conversationId, userId: req.user.id, emoji };
  await Promise.all([
    notifyUser(partnerId, 'message:reaction', payload),
    notifyUser(req.user.id, 'message:reaction', payload),
  ]);

  res.json({ ok: true });
}));

router.delete('/:messageId/reactions', requireAuth, asyncHandler(async (req, res) => {
  const message = await prisma.message.findUnique({ where: { id: req.params.messageId } });
  if (!message) return res.status(404).json({ error: 'Message not found.' });
  const conversation = await prisma.conversation.findUnique({ where: { id: message.conversationId } });
  if (!conversation || ![conversation.participantAId, conversation.participantBId].includes(req.user.id)) {
    return res.status(403).json({ error: 'Not a participant in this conversation.' });
  }

  await prisma.messageReaction.deleteMany({ where: { messageId: message.id, userId: req.user.id } });

  const partnerId = conversation.participantAId === req.user.id
    ? conversation.participantBId
    : conversation.participantAId;
  const payload = { messageId: message.id, conversationId: message.conversationId, userId: req.user.id, emoji: null };
  await Promise.all([
    notifyUser(partnerId, 'message:reaction', payload),
    notifyUser(req.user.id, 'message:reaction', payload),
  ]);

  res.json({ ok: true });
}));

// --- Read receipts (see Conversation.lastReadAtA/B in schema.prisma). ---
router.post('/:conversationId/read', requireAuth, asyncHandler(async (req, res) => {
  const conversation = await prisma.conversation.findUnique({ where: { id: req.params.conversationId } });
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
  const isA = conversation.participantAId === req.user.id;
  const isB = conversation.participantBId === req.user.id;
  if (!isA && !isB) return res.status(403).json({ error: 'Not a participant in this conversation.' });

  const readAt = new Date();
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: isA ? { lastReadAtA: readAt } : { lastReadAtB: readAt },
  });

  const partnerId = isA ? conversation.participantBId : conversation.participantAId;
  await notifyUser(partnerId, 'conversation:read', { conversationId: conversation.id, readAt, by: req.user.id });

  res.json({ ok: true, readAt });
}));

// --- Typing indicator — purely ephemeral, no persistence at all; just a
// relay to the partner so their UI can show "X is typing…" for a few
// seconds. ---
router.post('/:conversationId/typing', requireAuth, asyncHandler(async (req, res) => {
  const conversation = await prisma.conversation.findUnique({ where: { id: req.params.conversationId } });
  if (!conversation || ![conversation.participantAId, conversation.participantBId].includes(req.user.id)) {
    return res.status(403).json({ error: 'Not a participant in this conversation.' });
  }
  const partnerId = conversation.participantAId === req.user.id
    ? conversation.participantBId
    : conversation.participantAId;
  await notifyUser(partnerId, 'typing', { conversationId: conversation.id, userId: req.user.id });
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
