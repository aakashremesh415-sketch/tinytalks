import cron from 'node-cron';
import fs from 'fs';
import { prisma } from '../db.js';

// Retention rules, exactly as specified:
//  - An image is soft-deleted from the chat UI 2 days after upload,
//    UNLESS the user already deleted it themselves (in which case it was
//    hard-deleted immediately — see routes/images.js DELETE handler).
//  - If the user never deletes it, it stays available to admins for
//    moderation/report review for up to a week from upload, then the
//    file and row are permanently removed.
//  - Guest accounts (and everything tied to them) are purged 2 days
//    after creation.

export function startRetentionJobs() {
  // Every 15 minutes: soft-delete images from chat display at +2 days.
  cron.schedule('*/15 * * * *', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const toHide = await prisma.image.findMany({
      where: { deletedFromChatAt: null, uploadedAt: { lte: twoDaysAgo } },
    });
    for (const img of toHide) {
      await prisma.image.update({ where: { id: img.id }, data: { deletedFromChatAt: new Date() } });
    }
    if (toHide.length) console.log(`[retention] Soft-deleted ${toHide.length} image(s) from chat at 2-day mark.`);
  });

  // Every hour: hard-delete anything past its hardDeleteAt (the 7-day
  // grace window for undeleted images, or immediate for user-deleted ones
  // that somehow weren't cleaned up synchronously).
  cron.schedule('0 * * * *', async () => {
    const now = new Date();
    const toPurge = await prisma.image.findMany({
      where: { hardDeletedAt: null, hardDeleteAt: { lte: now } },
    });
    for (const img of toPurge) {
      if (fs.existsSync(img.storagePath)) {
        try { fs.unlinkSync(img.storagePath); } catch (e) { console.error('[retention] file delete failed', e.message); }
      }
      await prisma.image.update({ where: { id: img.id }, data: { hardDeletedAt: now } });
    }
    if (toPurge.length) console.log(`[retention] Hard-deleted ${toPurge.length} image(s) past the 7-day window.`);
  });

  // Every hour: purge expired guest accounts and everything cascaded
  // from them (messages, images, keys). Their ban-evasion hash (if any)
  // lives in BanRecord, which is untouched by this cascade.
  cron.schedule('30 * * * *', async () => {
    const now = new Date();
    const expiredGuests = await prisma.user.findMany({
      where: { accountType: 'GUEST', expiresAt: { lte: now } },
      select: { id: true },
    });
    for (const g of expiredGuests) {
      await prisma.user.delete({ where: { id: g.id } });
    }
    if (expiredGuests.length) console.log(`[retention] Purged ${expiredGuests.length} expired guest account(s).`);
  });

  console.log('[retention] Cron jobs scheduled: image soft-delete (15m), hard-delete (1h), guest purge (1h).');
}
