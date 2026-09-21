import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { notifyUser } from '../lib/pusher.js';

const router = Router();

// Matchmaking, as a request/response API instead of an in-memory socket
// queue (serverless functions share no memory between invocations — see
// the WaitingQueueEntry model in schema.prisma). The user who calls
// /join and finds a match gets the result directly in this response; the
// user who was already waiting gets notified over their private Pusher
// channel, since there's no open connection to hand a response to.
//
// Known limitation: matching two simultaneous joins isn't fully
// serialized (no SELECT ... FOR UPDATE), so a rare race can leave two
// mutually-compatible users both waiting for one cycle instead of
// matching immediately. They'll match on the next /join call either side
// makes. Fine for an MVP; worth a proper transaction if volume grows.
router.post('/join', requireAuth, asyncHandler(async (req, res) => {
  const { desiredGender } = req.body;
  const userId = req.user.id;

  await prisma.waitingQueueEntry.deleteMany({ where: { userId } });

  const canFilter = Boolean(req.user.premiumGenderFilter && desiredGender && desiredGender !== 'ANY');

  const candidates = await prisma.waitingQueueEntry.findMany({
    where: { userId: { not: userId } },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  const match = candidates.find((w) => {
    const otherWantsFilter = w.desiredGender && w.desiredGender !== 'ANY' && w.canFilter;
    if (canFilter && w.genderClaimed !== desiredGender) return false;
    if (otherWantsFilter && req.user.genderClaimed !== w.desiredGender) return false;
    return true;
  });

  async function startWaiting() {
    await prisma.waitingQueueEntry.create({
      data: {
        userId,
        genderClaimed: req.user.genderClaimed,
        desiredGender: desiredGender || null,
        canFilter,
      },
    });
    return res.json({ status: 'waiting' });
  }

  if (!match) return startWaiting();

  // Claim atomically: if another concurrent /join already took this
  // candidate, fall back to waiting ourselves rather than double-booking.
  const claimed = await prisma.waitingQueueEntry.deleteMany({ where: { id: match.id } });
  if (claimed.count === 0) return startWaiting();

  const conversation = await prisma.conversation.create({
    data: { participantAId: userId, participantBId: match.userId },
  });

  await notifyUser(match.userId, 'queue:matched', {
    conversationId: conversation.id,
    partnerId: userId,
  });

  res.json({ status: 'matched', conversationId: conversation.id, partnerId: match.userId });
}));

router.post('/leave', requireAuth, asyncHandler(async (req, res) => {
  await prisma.waitingQueueEntry.deleteMany({ where: { userId: req.user.id } });
  res.json({ ok: true });
}));

export default router;
