import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { notifyUser } from '../lib/pusher.js';
import { publicImage } from './images.js';

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
          ciphertext: last.ciphertext,
          nonce: last.nonce,
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
    include: { image: true },
  });

  res.json({
    conversationId: conversation.id,
    partnerId,
    endedAt: conversation.endedAt,
    messages: messages.map((m) => ({
      id: m.id,
      kind: m.kind,
      ciphertext: m.ciphertext,
      nonce: m.nonce,
      senderPubKey: m.senderPubKey,
      senderId: m.senderId,
      createdAt: m.createdAt,
      image: m.image ? publicImage(m.image) : null,
    })),
  });
}));

// Relay of an already-E2E-encrypted text message (replaces the old
// Socket.io 'message:send' handler). The server never sees plaintext —
// ciphertext/nonce were produced client-side with nacl.box using the
// recipient's published public key.
//
// Like the old socket handler, this notifies only the OTHER participant
// (over their private-user-<id> Pusher channel) — the sender already
// rendered its own copy optimistically the moment it called this API, so
// there's no echo to exclude and no shared "conversation channel" to
// manage.
router.post('/send', requireAuth, asyncHandler(async (req, res) => {
  const { conversationId, ciphertext, nonce, senderPubKey, kind } = req.body;

  if (!conversationId || !ciphertext || !nonce || !senderPubKey) {
    return res.status(400).json({ error: 'conversationId, ciphertext, nonce and senderPubKey are required.' });
  }

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
  if (![conversation.participantAId, conversation.participantBId].includes(req.user.id)) {
    return res.status(403).json({ error: 'Not a participant in this conversation.' });
  }

  const message = await prisma.message.create({
    data: {
      conversationId,
      senderId: req.user.id,
      ciphertext,
      nonce,
      senderPubKey,
      kind: kind || 'text',
    },
  });

  const partnerId = conversation.participantAId === req.user.id
    ? conversation.participantBId
    : conversation.participantAId;

  await notifyUser(partnerId, 'message:new', {
    id: message.id,
    conversationId,
    ciphertext,
    nonce,
    senderPubKey,
    kind: message.kind,
    createdAt: message.createdAt,
  });

  res.status(201).json({ ok: true, messageId: message.id });
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
