import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { randomCode, hashCode } from '../lib/hash.js';
import { sendOtpEmail } from '../lib/mailer.js';
import { asyncHandler } from '../lib/asyncHandler.js';

const router = Router();

const requestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many code requests. Try again later.' },
});

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again later.' },
});

// Request a one-time code by email. Works for both guest and regular
// accounts — guests supply an email just for this verification step; it
// is only used to send the code and to compute the ban-evasion hash, and
// is not otherwise attached to their (ephemeral, auto-purged) profile.
router.post('/request', requireAuth, requestLimiter, asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email is required.' });
  }

  const code = randomCode(6);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.otpCode.create({
    data: {
      userId: req.user.id,
      codeHash: hashCode(code),
      purpose: 'image_verification',
      expiresAt,
    },
  });

  // Stash which email this attempt used so /verify can hash+check it
  // against the ban list without storing the raw email long-term.
  req.app.locals.otpEmailByUser = req.app.locals.otpEmailByUser || new Map();
  req.app.locals.otpEmailByUser.set(req.user.id, email);

  const { previewUrl } = await sendOtpEmail(email, code);
  res.json({ ok: true, devPreviewUrl: previewUrl || undefined });
}));

router.post('/verify', requireAuth, verifyLimiter, asyncHandler(async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code is required.' });

  const latest = await prisma.otpCode.findFirst({
    where: { userId: req.user.id, purpose: 'image_verification', consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!latest || latest.expiresAt < new Date()) {
    return res.status(400).json({ error: 'Code expired or not found. Request a new one.' });
  }
  if (latest.attempts >= 5) {
    return res.status(429).json({ error: 'Too many incorrect attempts. Request a new code.' });
  }

  if (hashCode(code) !== latest.codeHash) {
    await prisma.otpCode.update({ where: { id: latest.id }, data: { attempts: { increment: 1 } } });
    return res.status(400).json({ error: 'Incorrect code.' });
  }

  await prisma.otpCode.update({ where: { id: latest.id }, data: { consumedAt: new Date() } });
  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: {
      otpVerified: true,
      imageVerifiedAt: req.user.ageEstimationPassed ? new Date() : req.user.imageVerifiedAt,
    },
  });

  res.json({ ok: true, otpVerified: true, imageVerified: Boolean(updated.otpVerified && updated.ageEstimationPassed) });
}));

export default router;
