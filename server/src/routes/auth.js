import { Router } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import { prisma } from '../db.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { hashIdentifier } from '../lib/hash.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { uploadObject } from '../lib/storage.js';
import { normalizeTags } from '../lib/locationTags.js';

const router = Router();

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

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      accountType: 'REGULAR',
      email,
      passwordHash,
      displayName: displayName || null,
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

  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  res.json({ user: publicUser(req.user) });
}));

// Self-service profile edits: display name (freely editable, including
// via the client's random-name generator) and location tags (self-reported
// town/district/state, used only to prefer nearby matches in the queue).
router.patch('/me', requireAuth, asyncHandler(async (req, res) => {
  const data = {};

  if (typeof req.body.displayName === 'string') {
    data.displayName = req.body.displayName.trim().slice(0, 40) || null;
  }
  if (Array.isArray(req.body.locationTags)) {
    data.locationTags = normalizeTags(req.body.locationTags);
  }
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'Nothing to update.' });
  }

  const user = await prisma.user.update({ where: { id: req.user.id }, data });
  res.json({ user: publicUser(user) });
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
    expiresAt: user.expiresAt,
    createdAt: user.createdAt,
  };
}

export default router;
