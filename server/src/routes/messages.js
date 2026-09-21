import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { notifyUser } from '../lib/pusher.js';

const router = Router();

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
