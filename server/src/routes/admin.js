import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { hashIdentifier } from '../lib/hash.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { fetchObject } from '../lib/storage.js';
import { publicUser } from './auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// --- Gender verification queue ---
router.get('/verifications/pending', asyncHandler(async (req, res) => {
  const users = await prisma.user.findMany({
    where: { genderVerification: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, email: true, displayName: true, genderClaimed: true,
      genderPhotoPath: true, createdAt: true,
    },
  });
  res.json({ users });
}));

router.get('/verifications/:userId/photo', asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
  if (!user?.genderPhotoPath) return res.status(404).json({ error: 'No photo on file.' });

  const bytes = await fetchObject(user.genderPhotoPath);
  if (!bytes) return res.status(404).json({ error: 'Photo file no longer exists.' });

  res.send(bytes);
}));

router.post('/verifications/:userId/decision', asyncHandler(async (req, res) => {
  const { decision } = req.body; // 'APPROVED' | 'REJECTED'
  if (!['APPROVED', 'REJECTED'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be APPROVED or REJECTED.' });
  }
  const user = await prisma.user.update({
    where: { id: req.params.userId },
    data: { genderVerification: decision, genderReviewedBy: req.user.id, genderReviewedAt: new Date() },
  });
  res.json({ user: publicUser(user) });
}));

// --- Reports / ticketing ---
router.get('/reports', asyncHandler(async (req, res) => {
  const { status, category } = req.query;
  const reports = await prisma.report.findMany({
    where: {
      status: status || undefined,
      category: category || undefined,
    },
    include: {
      reporter: { select: { id: true, email: true, displayName: true, accountType: true } },
      reportedUser: { select: { id: true, email: true, displayName: true, accountType: true, banned: true } },
    },
    orderBy: [{ createdAt: 'desc' }],
  });
  res.json({ reports });
}));

router.patch('/reports/:id', asyncHandler(async (req, res) => {
  const { status, resolutionNote } = req.body;
  const report = await prisma.report.update({
    where: { id: req.params.id },
    data: {
      status: status || undefined,
      resolutionNote: resolutionNote ?? undefined,
      assignedAdminId: req.user.id,
    },
  });
  res.json({ report });
}));

// --- User lookup (by email/display name substring) ---
router.get('/users', asyncHandler(async (req, res) => {
  const q = (req.query.query || '').trim();
  if (!q) return res.json({ users: [] });

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: q } },
        { displayName: { contains: q } },
      ],
    },
    select: {
      id: true, email: true, displayName: true, accountType: true,
      genderVerification: true, banned: true, banReason: true, createdAt: true,
      lastSeenAt: true, lastIp: true,
    },
    take: 20,
  });
  res.json({ users });
}));

// --- Full, paginated user directory (distinct from the search box above,
// which only ever returns matches for a typed query) — lets an admin just
// browse everyone, newest first, along with each account's last-seen time
// and IP so the same view roughly doubles as an activity log. ---
router.get('/users/list', asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 25));

  const [users, total, activeUsers] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, email: true, displayName: true, accountType: true,
        genderVerification: true, banned: true, banReason: true, createdAt: true,
        lastSeenAt: true, lastIp: true,
      },
    }),
    prisma.user.count(),
    // "Active" means seen within the same window requireAuth uses to decide
    // whether to bother re-stamping lastSeenAt at all (see
    // middleware/auth.js's ACTIVITY_THROTTLE_MS) — a rough "online right
    // now or in roughly the last few minutes" measure, not a precise
    // concurrent-session count.
    prisma.user.count({ where: { lastSeenAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } } }),
  ]);

  res.json({ users, total, page, pageSize, activeUsers });
}));

// --- Per-user IP history (see the IpLog model comment in schema.prisma —
// one row per distinct IP change, not one per request). ---
router.get('/users/:id/ip-log', asyncHandler(async (req, res) => {
  const logs = await prisma.ipLog.findMany({
    where: { userId: req.params.id },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.json({ logs });
}));

// --- Ban a user. Writes a persistent hashed-identifier record so a
// banned guest can't just re-verify a fresh ephemeral account with the
// same email a few minutes later, even after their old account/content
// is purged. ---
router.post('/users/:id/ban', asyncHandler(async (req, res) => {
  const { reason, category } = req.body;
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { banned: true, bannedAt: new Date(), banReason: reason || 'Policy violation' },
  });

  if (user.email) {
    await prisma.banRecord.upsert({
      where: { identifierHash: hashIdentifier(user.email) },
      create: { identifierHash: hashIdentifier(user.email), reason: reason || 'Policy violation', category },
      update: { reason: reason || 'Policy violation', category },
    });
  }

  res.json({ ok: true });
}));

router.post('/users/:id/unban', asyncHandler(async (req, res) => {
  // Note: this lifts the ban on the account itself but intentionally does
  // NOT remove the persistent BanRecord hash — that record exists
  // specifically to survive account deletion/expiry and stop re-verification
  // abuse, so clearing it is a separate, deliberate action, not a side
  // effect of unbanning one account.
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { banned: false, banReason: null },
  });
  res.json({ ok: true, user: { id: user.id, banned: user.banned } });
}));

// --- Image moderation: view any not-yet-hard-deleted image (soft-deleted
// or not) attached to a reported conversation. Every access is logged. ---
router.get('/images/:imageId', asyncHandler(async (req, res) => {
  const image = await prisma.image.findUnique({ where: { id: req.params.imageId } });
  if (!image || image.hardDeletedAt) {
    return res.status(404).json({ error: 'Image no longer available (permanently removed).' });
  }

  const bytes = await fetchObject(image.storagePath);
  if (!bytes) return res.status(404).json({ error: 'File missing from storage.' });

  await prisma.adminImageAccessLog.create({
    data: { imageId: image.id, adminId: req.user.id, reason: req.query.reason || 'report review' },
  });

  res.send(bytes);
}));

router.get('/images/:imageId/access-log', asyncHandler(async (req, res) => {
  const log = await prisma.adminImageAccessLog.findMany({
    where: { imageId: req.params.imageId },
    orderBy: { accessedAt: 'desc' },
  });
  res.json({ log });
}));

// --- Dashboard summary ---
router.get('/summary', asyncHandler(async (req, res) => {
  const [pendingVerifications, openReports, underageReports, bannedUsers, totalUsers, activeUsers] = await Promise.all([
    prisma.user.count({ where: { genderVerification: 'PENDING' } }),
    prisma.report.count({ where: { status: 'OPEN' } }),
    prisma.report.count({ where: { category: 'UNDERAGE_SUSPICION', status: { in: ['OPEN', 'IN_REVIEW'] } } }),
    prisma.user.count({ where: { banned: true } }),
    prisma.user.count(),
    // Same "seen in the last 5 minutes" window as /users/list — see that
    // route's comment for why this is approximate, not an exact concurrent
    // session count.
    prisma.user.count({ where: { lastSeenAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } } }),
  ]);
  res.json({ pendingVerifications, openReports, underageReports, bannedUsers, totalUsers, activeUsers });
}));

export default router;
