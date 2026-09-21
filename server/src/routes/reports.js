import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';

const router = Router();

// Categories mirror the kind of taxonomy chitchat-style platforms use for
// reports — written fresh for tinytalks, not copied text.
export const REPORT_CATEGORIES = [
  'HARASSMENT_OR_ABUSE',
  'UNDERAGE_SUSPICION',
  'NUDITY_OR_SEXUAL_CONTENT',
  'SPAM_OR_SCAM',
  'IMPERSONATION_OR_FAKE_PROFILE',
  'GENDER_MISREPRESENTATION',
  'THREATS_OR_VIOLENCE',
  'HATE_SPEECH',
  'OTHER',
];

router.get('/categories', (req, res) => res.json({ categories: REPORT_CATEGORIES }));

router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const { reportedUserId, conversationId, category, description } = req.body;

  if (!reportedUserId || !category) {
    return res.status(400).json({ error: 'reportedUserId and category are required.' });
  }
  if (!REPORT_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'Unknown category.' });
  }

  // UNDERAGE_SUSPICION reports are the most safety-critical — flag them
  // for immediate admin attention rather than the normal queue order.
  const report = await prisma.report.create({
    data: {
      reporterId: req.user.id,
      reportedUserId,
      conversationId: conversationId || null,
      category,
      description: description || '',
      status: 'OPEN',
    },
  });

  if (category === 'UNDERAGE_SUSPICION') {
    console.warn(`[SAFETY] Underage-suspicion report filed: report=${report.id} against user=${reportedUserId}`);
  }

  res.status(201).json({ report });
}));

router.get('/mine', requireAuth, asyncHandler(async (req, res) => {
  const reports = await prisma.report.findMany({
    where: { reporterId: req.user.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ reports });
}));

export default router;
