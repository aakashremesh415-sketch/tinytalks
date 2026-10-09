import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { pusher, userChannel } from '../lib/pusher.js';

const router = Router();
const SIGNAL_TYPES = new Set(['invite', 'accept', 'reject', 'offer', 'answer', 'candidate', 'hangup']);
const CALL_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SIGNAL_BYTES = 16 * 1024;

router.post('/:conversationId/signal', requireAuth, asyncHandler(async (req, res) => {
  const { callId, type, data } = req.body;
  if (!CALL_ID_RE.test(callId || '') || !SIGNAL_TYPES.has(type)) {
    return res.status(400).json({ error: 'A valid callId and signal type are required.' });
  }

  const needsData = type === 'offer' || type === 'answer' || type === 'candidate';
  if (needsData !== (data !== undefined) || (data !== undefined && (!data || typeof data !== 'object' || Array.isArray(data)))) {
    return res.status(400).json({ error: 'Invalid call signal data.' });
  }
  if (data !== undefined && Buffer.byteLength(JSON.stringify(data), 'utf8') > MAX_SIGNAL_BYTES) {
    return res.status(413).json({ error: 'Call signal is too large.' });
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: req.params.conversationId },
    select: { participantAId: true, participantBId: true },
  });
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
  if (![conversation.participantAId, conversation.participantBId].includes(req.user.id)) {
    return res.status(403).json({ error: 'Not a participant in this conversation.' });
  }

  const partnerId = conversation.participantAId === req.user.id
    ? conversation.participantBId
    : conversation.participantAId;
  const block = await prisma.blockedUser.findFirst({
    where: {
      OR: [
        { blockerId: req.user.id, blockedId: partnerId },
        { blockerId: partnerId, blockedId: req.user.id },
      ],
    },
    select: { id: true },
  });
  if (block) return res.status(403).json({ error: 'Calls are unavailable in this conversation.' });

  const payload = {
    conversationId: req.params.conversationId,
    callId,
    type,
    data,
    fromUserId: req.user.id,
    fromDisplayName: req.user.displayName || 'Anonymous',
  };
  await pusher.trigger(userChannel(partnerId), 'call:signal', payload);
  if (type === 'accept') {
    await pusher.trigger(userChannel(req.user.id), 'call:claimed', {
      conversationId: req.params.conversationId,
      callId,
      fromUserId: req.user.id,
    });
  } else if (type === 'reject' || type === 'hangup') {
    await pusher.trigger(userChannel(req.user.id), 'call:closed', {
      conversationId: req.params.conversationId,
      callId,
      fromUserId: req.user.id,
    });
  }
  res.json({ ok: true });
}));

export default router;
