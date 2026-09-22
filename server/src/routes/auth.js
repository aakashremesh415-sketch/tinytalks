import { Router } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import { prisma } from '../db.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { hashIdentifier } from '../lib/hash.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { uploadObject, deleteObject } from '../lib/storage.js';
import { normalizeTags } from '../lib/locationTags.js';
import { checkDailyLimit, remainingToday } from '../lib/dailyLimit.js';
import { generateRandomName } from '../lib/randomName.js';
import { isOffensiveName } from '../lib/profanity.js';

const router = Router();

const NAME_CHANGE_LIMIT = 3;
const AVATAR_CHANGE_LIMIT = 3;

// Memory, not disk — Vercel's filesystem is ephemeral. The photo goes
// straight to Vercel Blob (see lib/storage.js); only an admin, through
// the authenticated /admin/verifications/:userId/photo route, ever sees
// it again.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

// --- Guest accounts ---
// Ephemeral, no email/password. Requires the 18+ self-attestation
// checkbox (this is a baseline consent gate, NOT the image-sharing
// verification — that still requires OTP + age-estimation separately).
router.post('/guest', asyncHandler(async (req, res) => {
  const { ageConfirmed } = req.body;
  if (!ageConfirmed) {
    return res.status(400).json({ error: 'You must confirm you are 18 or older to continue.' });
  }

  const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const user = await prisma.user.create({
    data: {
      accountType: 'GUEST',
      // Every guest gets a friendly random name up front (see
      // lib/randomName.js) instead of showing up to their chat partner as
      // a bare "Anonymous" — they can change it any time from Settings,
      // subject to the same daily rate limit as any other name change.
      displayName: generateRandomName(),
      ageConfirmed: true,
      ageConfirmedAt: new Date(),
      expiresAt,
      // Gender filter is a "premium" feature that's free for everyone
      // while payments aren't wired up yet — an admin can gate this
      // later by flipping it per-user or adding a billing check here.
      premiumGenderFilter: true,
    },
  });

  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
}));

// --- Regular account signup ---
// Email/password only. The gender-verification photo (reviewed by an
// admin — see routes/admin.js) is submitted afterwards, once the account
// exists, via POST /gender-photo below — this lets someone create an
// account first and take/upload the photo as a separate step (from a
// phone camera or laptop webcam), rather than blocking signup on it.
// That photo is unrelated to the age-estimation selfie used to unlock
// image sharing (routes/verification.js), which a different vendor
// processes and which no admin ever reviews.
router.post('/signup', asyncHandler(async (req, res) => {
  const { email, password, displayName, ageConfirmed, genderClaimed } = req.body;

  if (!ageConfirmed || ageConfirmed === 'false') {
    return res.status(400).json({ error: 'You must confirm you are 18 or older to continue.' });
  }
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const identifierHash = hashIdentifier(email);
  const banned = await prisma.banRecord.findUnique({ where: { identifierHash } });
  if (banned) {
    return res.status(403).json({ error: 'This account is not permitted to register.' });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: 'Email already registered.' });

  const trimmedName = typeof displayName === 'string' ? displayName.trim().slice(0, 40) : '';
  if (trimmedName && isOffensiveName(trimmedName)) {
    return res.status(400).json({ error: "That display name isn't allowed. Please choose another." });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      accountType: 'REGULAR',
      email,
      passwordHash,
      // Same as guest signup: fall back to an auto-generated random name
      // rather than leaving it blank, so nobody starts out as "Anonymous".
      displayName: trimmedName || generateRandomName(),
      ageConfirmed: true,
      ageConfirmedAt: new Date(),
      genderClaimed: genderClaimed || 'UNSPECIFIED',
      genderVerification: 'NONE',
      premiumGenderFilter: true,
    },
  });

  const token = signToken(user);
  res.status(201).json({ token, user: publicUser(user) });
}));

// --- Gender-verification photo, submitted after signup/login ---
// Authenticated, separate step so it can happen right after account
// creation OR any later time someone logs back in without having done it
// yet. Overwrites a previous submission (e.g. after an admin rejection).
router.post('/gender-photo', requireAuth, upload.single('genderPhoto'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'A photo is required.' });
  }

  const { url: genderPhotoUrl } = await uploadObject(
    `verification/${uuid()}.bin`,
    req.file.buffer,
    req.file.mimetype
  );

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: {
      genderPhotoPath: genderPhotoUrl,
      genderVerification: 'PENDING',
      genderReviewedBy: null,
      genderReviewedAt: null,
    },
  });

  res.json({ user: publicUser(user) });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) return res.status(401).json({ error: 'Invalid credentials' });
  if (user.banned) return res.status(403).json({ error: 'Account banned', reason: user.banReason });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  // Backfill for any account created before guest/signup started
  // auto-assigning a name — so a returning user with no name set yet
  // stops appearing to strangers as a bare "Anonymous" too.
  const withName = user.displayName ? user : await prisma.user.update({
    where: { id: user.id },
    data: { displayName: generateRandomName() },
  });

  const token = signToken(withName);
  res.json({ token, user: publicUser(withName) });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  res.json({ user: publicUser(req.user) });
}));

// Self-service profile edits: display name (freely editable, including
// via the client's random-name generator, rate-limited like a change to
// avoid abuse), and location tags / interests (self-reported, used only
// to prefer — never require — similar matches in the queue).
router.patch('/me', requireAuth, asyncHandler(async (req, res) => {
  const data = {};

  if (typeof req.body.displayName === 'string') {
    const nextName = req.body.displayName.trim().slice(0, 40) || null;
    if (nextName !== req.user.displayName) {
      if (nextName && isOffensiveName(nextName)) {
        return res.status(400).json({ error: "That display name isn't allowed. Please choose another." });
      }
      const { allowed, patch } = checkDailyLimit(req.user.nameChangeCount, req.user.nameChangeWindowStart, NAME_CHANGE_LIMIT);
      if (!allowed) {
        return res.status(429).json({ error: `You've reached today's name change limit (${NAME_CHANGE_LIMIT}/day).` });
      }
      data.displayName = nextName;
      data.nameChangeCount = patch.count;
      data.nameChangeWindowStart = patch.windowStart;
    }
  }
  if (Array.isArray(req.body.locationTags)) {
    data.locationTags = normalizeTags(req.body.locationTags);
  }
  if (Array.isArray(req.body.interests)) {
    data.interests = normalizeTags(req.body.interests);
  }
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'Nothing to update.' });
  }

  const user = await prisma.user.update({ where: { id: req.user.id }, data });
  res.json({ user: publicUser(user) });
}));

// Avatar: same rate limit as display name, same "reviewed before
// displaying" spirit as the gender-verification photo, except there's no
// human review queue for this one yet — it's auto-published. Worth adding
// real moderation before opening this up beyond a small user base.
router.patch('/me/avatar', requireAuth, upload.single('avatar'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'An image is required.' });

  const { allowed, patch } = checkDailyLimit(req.user.avatarChangeCount, req.user.avatarChangeWindowStart, AVATAR_CHANGE_LIMIT);
  if (!allowed) {
    return res.status(429).json({ error: `You've reached today's avatar change limit (${AVATAR_CHANGE_LIMIT}/day).` });
  }

  const { url } = await uploadObject(`avatars/${req.user.id}-${Date.now()}.bin`, req.file.buffer, req.file.mimetype);
  if (req.user.avatarUrl) deleteObject(req.user.avatarUrl).catch(() => {});

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { avatarUrl: url, avatarChangeCount: patch.count, avatarChangeWindowStart: patch.windowStart },
  });
  res.json({ user: publicUser(user) });
}));

router.delete('/me/avatar', requireAuth, asyncHandler(async (req, res) => {
  if (!req.user.avatarUrl) return res.json({ user: publicUser(req.user) });

  const { allowed, patch } = checkDailyLimit(req.user.avatarChangeCount, req.user.avatarChangeWindowStart, AVATAR_CHANGE_LIMIT);
  if (!allowed) {
    return res.status(429).json({ error: `You've reached today's avatar change limit (${AVATAR_CHANGE_LIMIT}/day).` });
  }

  deleteObject(req.user.avatarUrl).catch(() => {});
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { avatarUrl: null, avatarChangeCount: patch.count, avatarChangeWindowStart: patch.windowStart },
  });
  res.json({ user: publicUser(user) });
}));

router.patch('/change-password', requireAuth, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!req.user.passwordHash) {
    return res.status(400).json({ error: "Guest accounts don't have a password to change." });
  }
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }
  const ok = await bcrypt.compare(currentPassword || '', req.user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash } });
  res.json({ ok: true });
}));

// Self-serve account deletion. Cascades through Prisma's onDelete: Cascade
// on every relation (messages, conversations, reports, keys, blocks), so
// this is a real, permanent delete — not a soft-disable.
router.delete('/me', requireAuth, asyncHandler(async (req, res) => {
  if (req.user.accountType === 'ADMIN') {
    return res.status(400).json({ error: "Admin accounts can't be deleted from here." });
  }
  if (req.user.passwordHash) {
    const ok = await bcrypt.compare(req.body?.password || '', req.user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Incorrect password.' });
  }

  if (req.user.avatarUrl) deleteObject(req.user.avatarUrl).catch(() => {});
  if (req.user.genderPhotoPath) deleteObject(req.user.genderPhotoPath).catch(() => {});

  await prisma.user.delete({ where: { id: req.user.id } });
  res.json({ ok: true });
}));

export function publicUser(user) {
  return {
    id: user.id,
    accountType: user.accountType,
    email: user.email,
    displayName: user.displayName,
    genderClaimed: user.genderClaimed,
    genderVerification: user.genderVerification,
    otpVerified: user.otpVerified,
    ageEstimationPassed: user.ageEstimationPassed,
    imageVerified: Boolean(user.otpVerified && user.ageEstimationPassed),
    premiumGenderFilter: user.premiumGenderFilter,
    locationTags: user.locationTags || [],
    interests: user.interests || [],
    avatarUrl: user.avatarUrl || null,
    nameChangesRemaining: remainingToday(user.nameChangeCount, user.nameChangeWindowStart, NAME_CHANGE_LIMIT),
    avatarChangesRemaining: remainingToday(user.avatarChangeCount, user.avatarChangeWindowStart, AVATAR_CHANGE_LIMIT),
    banned: user.banned,
    banReason: user.banReason || null,
    expiresAt: user.expiresAt,
    createdAt: user.createdAt,
  };
}

export default router;
