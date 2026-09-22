import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { notifyUser } from '../lib/pusher.js';

const router = Router();

function shape(f, myId) {
  const isRequester = f.requesterId === myId;
  const other = isRequester ? f.addressee : f.requester;
  const isFriend = f.status === 'ACCEPTED';
  // Interests are only ever shared with an ACCEPTED friend, and only if
  // the other person hasn't marked them private in Settings (Profile tab
  // → interestsPrivate). Never exposed to a pending request either
  // direction — accepting is what unlocks it, same as everything else
  // about being friends here.
  const interestsVisible = isFriend && !other.interestsPrivate;
  return {
    userId: other.id,
    displayName: other.displayName || 'Anonymous',
    status: f.status,
    direction: isRequester ? 'outgoing' : 'incoming',
    createdAt: f.createdAt,
    interests: interestsVisible ? (other.interests || []) : [],
  };
}

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const myId = req.user.id;
  const rows = await prisma.friendship.findMany({
    where: { OR: [{ requesterId: myId }, { addresseeId: myId }] },
    include: {
      requester: { select: { id: true, displayName: true, interests: true, interestsPrivate: true } },
      addressee: { select: { id: true, displayName: true, interests: true, interestsPrivate: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const shaped = rows.map((f) => shape(f, myId));
  res.json({
    friends: shaped.filter((f) => f.status === 'ACCEPTED'),
    incomingRequests: shaped.filter((f) => f.status === 'PENDING' && f.direction === 'incoming'),
    outgoingRequests: shaped.filter((f) => f.status === 'PENDING' && f.direction === 'outgoing'),
  });
}));

// Sending a request when the other side already requested you is treated
// as mutual interest and auto-accepts both directions, rather than
// creating a second pending row (the @@unique on [requesterId,
// addresseeId] only prevents an exact duplicate in the SAME direction).
router.post('/:userId/request', requireAuth, asyncHandler(async (req, res) => {
  const myId = req.user.id;
  const otherId = req.params.userId;
  if (otherId === myId) return res.status(400).json({ error: "You can't friend yourself." });

  const [blockedByMe, blockedMe] = await Promise.all([
    prisma.blockedUser.findUnique({ where: { blockerId_blockedId: { blockerId: myId, blockedId: otherId } } }),
    prisma.blockedUser.findUnique({ where: { blockerId_blockedId: { blockerId: otherId, blockedId: myId } } }),
  ]);
  if (blockedByMe || blockedMe) {
    return res.status(403).json({ error: "You can't friend someone you've blocked, or who's blocked you." });
  }

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: myId, addresseeId: otherId },
        { requesterId: otherId, addresseeId: myId },
      ],
    },
  });

  if (existing) {
    if (existing.status === 'ACCEPTED') return res.json({ ok: true, status: 'ACCEPTED' });
    if (existing.requesterId === myId) return res.json({ ok: true, status: 'PENDING' }); // already sent
    await prisma.friendship.update({ where: { id: existing.id }, data: { status: 'ACCEPTED' } });
    await notifyUser(otherId, 'friend:accepted', { userId: myId, displayName: req.user.displayName || 'Anonymous' });
    return res.json({ ok: true, status: 'ACCEPTED' });
  }

  await prisma.friendship.create({ data: { requesterId: myId, addresseeId: otherId } });
  await notifyUser(otherId, 'friend:request', { userId: myId, displayName: req.user.displayName || 'Anonymous' });
  res.json({ ok: true, status: 'PENDING' });
}));

router.post('/:userId/accept', requireAuth, asyncHandler(async (req, res) => {
  const myId = req.user.id;
  const otherId = req.params.userId;
  const existing = await prisma.friendship.findFirst({
    where: { requesterId: otherId, addresseeId: myId, status: 'PENDING' },
  });
  if (!existing) return res.status(404).json({ error: 'No pending request from this user.' });

  await prisma.friendship.update({ where: { id: existing.id }, data: { status: 'ACCEPTED' } });
  await notifyUser(otherId, 'friend:accepted', { userId: myId, displayName: req.user.displayName || 'Anonymous' });
  res.json({ ok: true });
}));

// Also covers declining a pending request, either direction — no
// notification either way, matching how a quiet "not interested" should feel.
router.delete('/:userId', requireAuth, asyncHandler(async (req, res) => {
  const myId = req.user.id;
  const otherId = req.params.userId;
  await prisma.friendship.deleteMany({
    where: {
      OR: [
        { requesterId: myId, addresseeId: otherId },
        { requesterId: otherId, addresseeId: myId },
      ],
    },
  });
  res.json({ ok: true });
}));

// Start (or reuse) a direct conversation with a friend — bypasses the
// random-match queue entirely, since friends already know who they're
// talking to. Reuses the same Conversation/Message machinery as random
// chats, so it shows up in the chat-history sidebar exactly the same way.
router.post('/:userId/start-chat', requireAuth, asyncHandler(async (req, res) => {
  const myId = req.user.id;
  const otherId = req.params.userId;

  const friendship = await prisma.friendship.findFirst({
    where: {
      status: 'ACCEPTED',
      OR: [
        { requesterId: myId, addresseeId: otherId },
        { requesterId: otherId, addresseeId: myId },
      ],
    },
  });
  if (!friendship) return res.status(403).json({ error: 'Not friends with this user.' });

  let conversation = await prisma.conversation.findFirst({
    where: {
      OR: [
        { participantAId: myId, participantBId: otherId },
        { participantAId: otherId, participantBId: myId },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({ data: { participantAId: myId, participantBId: otherId } });
  }

  res.json({ conversationId: conversation.id, partnerId: otherId });
}));

export default router;
