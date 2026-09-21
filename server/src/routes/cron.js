import { Router } from 'express';
import { prisma } from '../db.js';
import { deleteObject } from '../lib/storage.js';

const router = Router();

// Retention rules, exactly as specified — this used to run as three
// node-cron jobs inside a long-lived process; on Vercel there is no
// long-lived process, so the same logic runs as a plain HTTP endpoint
// that Vercel Cron hits on a schedule (see vercel.json `crons`).
//
// Guard: only Vercel's own cron scheduler (or you, manually, with the
// same secret) can trigger this — otherwise anyone who found the URL
// could force-purge data. Vercel Cron sends `Authorization: Bearer
// $CRON_SECRET` automatically when CRON_SECRET is set as an env var on
// the project; set the same value for CRON_SECRET here.
function requireCronSecret(req, res, next) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return res.status(500).json({ error: 'CRON_SECRET is not configured on the server.' });
  }
  const header = req.headers.authorization || '';
  if (header !== `Bearer ${expected}`) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  next();
}

router.get('/retention', requireCronSecret, async (req, res) => {
  const now = new Date();
  const results = { softDeletedImages: 0, hardDeletedImages: 0, purgedGuests: 0, errors: [] };

  try {
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const toHide = await prisma.image.findMany({
      where: { deletedFromChatAt: null, uploadedAt: { lte: twoDaysAgo } },
    });
    for (const img of toHide) {
      await prisma.image.update({ where: { id: img.id }, data: { deletedFromChatAt: now } });
    }
    results.softDeletedImages = toHide.length;
  } catch (err) {
    results.errors.push(`soft-delete: ${err.message}`);
  }

  try {
    const toPurge = await prisma.image.findMany({
      where: { hardDeletedAt: null, hardDeleteAt: { lte: now } },
    });
    for (const img of toPurge) {
      await deleteObject(img.storagePath);
      await prisma.image.update({ where: { id: img.id }, data: { hardDeletedAt: now } });
    }
    results.hardDeletedImages = toPurge.length;
  } catch (err) {
    results.errors.push(`hard-delete: ${err.message}`);
  }

  try {
    const expiredGuests = await prisma.user.findMany({
      where: { accountType: 'GUEST', expiresAt: { lte: now } },
      select: { id: true },
    });
    for (const g of expiredGuests) {
      await prisma.user.delete({ where: { id: g.id } });
    }
    results.purgedGuests = expiredGuests.length;
  } catch (err) {
    results.errors.push(`guest-purge: ${err.message}`);
  }

  console.log('[cron/retention]', JSON.stringify(results));
  res.json({ ok: results.errors.length === 0, ...results });
});

export default router;
