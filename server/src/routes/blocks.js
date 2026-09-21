import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';

const router = Router();

// Self-serve, instant, one-way blocking — distinct from /api/reports,
// which goes to admin review. routes/queue.js excludes both directions
// (blocker→blocked and blocked→blocker) from matching.
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const rows = await prisma.blockedUser.findMany({
    where: { blockerId: req.user.id },
    include: { blocked: { select: { id: true, displayName: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({
    blocked: rows.map((r) => ({
      userId: r.blockedId,
      displayName: r.blocked.displayName || 'Anonymous',
      blockedAt: r.createdAt,
    })),
  });
}));

router.post('/:userId', requireAuth, asyncHandler(async (req, res) => {
  const blockedId = req.params.userId;
  if (blockedId === req.user.id) {
    return res.status(400).json({ error: "You can't block yourself." });
  }
  await prisma.blockedUser.upsert({
    where: { blockerId_blockedId: { blockerId: req.user.id, blockedId } },
    create: { blockerId: req.user.id, blockedId },
    update: {},
  });
  res.json({ ok: true });
}));

router.delete('/:userId', requireAuth, asyncHandler(async (req, res) => {
  await prisma.blockedUser.deleteMany({
    where: { blockerId: req.user.id, blockedId: req.params.userId },
  });
  res.json({ ok: true });
}));

export default router;
