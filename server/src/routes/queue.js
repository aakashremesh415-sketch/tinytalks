import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { notifyUser } from '../lib/pusher.js';
import { normalizeTags } from '../lib/locationTags.js';

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
  const { desiredGender, locationTags, interests } = req.body;
  const userId = req.user.id;
  const myTags = normalizeTags(locationTags);
  const myInterests = normalizeTags(interests);

  await prisma.waitingQueueEntry.deleteMany({ where: { userId } });

  const canFilter = Boolean(req.user.premiumGenderFilter && desiredGender && desiredGender !== 'ANY');

  // Blocking is checked both directions: a block stops matching whichever
  // way it was made, so the blocked person can't just match back in.
  const [blockedByMe, blockedMe] = await Promise.all([
    prisma.blockedUser.findMany({ where: { blockerId: userId }, select: { blockedId: true } }),
    prisma.blockedUser.findMany({ where: { blockedId: userId }, select: { blockerId: true } }),
  ]);
  const excluded = new Set([
    ...blockedByMe.map((b) => b.blockedId),
    ...blockedMe.map((b) => b.blockerId),
  ]);

  const candidates = await prisma.waitingQueueEntry.findMany({
    where: { userId: { not: userId } },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  const eligible = candidates.filter((w) => {
    if (excluded.has(w.userId)) return false;
    const otherWantsFilter = w.desiredGender && w.desiredGender !== 'ANY' && w.canFilter;
    if (canFilter && w.genderClaimed !== desiredGender) return false;
    if (otherWantsFilter && req.user.genderClaimed !== w.desiredGender) return false;
    return true;
  });

  // Soft preference, not a hard filter: with few users online, requiring
  // an overlapping location tag or interest could leave someone waiting
  // forever. Prefer the candidate sharing the most tags/interests;
  // Array#sort is stable, so among equal scores the earliest-waiting
  // candidate (already ordered by createdAt above) still wins.
  function overlapScore(w) {
    let score = 0;
    if (myTags.length && w.locationTags?.length) {
      score += w.locationTags.filter((t) => myTags.includes(t)).length;
    }
    if (myInterests.length && w.interests?.length) {
      score += w.interests.filter((t) => myInterests.includes(t)).length;
    }
    return score;
  }
  const match = [...eligible].sort((a, b) => overlapScore(b) - overlapScore(a))[0];

  async function startWaiting() {
    await prisma.waitingQueueEntry.create({
      data: {
        userId,
        genderClaimed: req.user.genderClaimed,
        desiredGender: desiredGender || null,
        canFilter,
        locationTags: myTags,
        interests: myInterests,
      },
    });
    return res.json({ status: 'waiting' });
  }

  if (!match) return startWaiting();

  // Claim atomically: if another concurrent /join already took this
  // candidate, fall back to waiting ourselves rather than double-booking.
  const claimed = await prisma.waitingQueueEntry.deleteMany({ where: { id: match.id } });
  if (claimed.count === 0) return startWaiting();

  // Reuse whatever conversation already exists between this exact pair
  // (from an earlier random match, or from being/becoming friends) rather
  // than always spinning up a new one — otherwise two people who cross
  // paths in the queue more than once (easy in a small user base, and
  // routine for friends who queue hoping to land each other) end up with
  // several duplicate threads and split history instead of one. Mirrors
  // the same lookup routes/friends.js's /start-chat already does.
  let conversation = await prisma.conversation.findFirst({
    where: {
      OR: [
        { participantAId: userId, participantBId: match.userId },
        { participantAId: match.userId, participantBId: userId },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { participantAId: userId, participantBId: match.userId },
    });
  } else if (conversation.endedAt) {
    // Picking the conversation back up — clear the "ended" mark so it
    // reads as active again rather than a stale, closed-out thread.
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { endedAt: null },
    });
  }

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
