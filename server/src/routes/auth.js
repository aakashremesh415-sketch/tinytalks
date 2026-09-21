import { Router } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { prisma } from '../db.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { hashIdentifier } from '../lib/hash.js';
import { asyncHandler } from '../lib/asyncHandler.js';

const router = Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: 'uploads/verification',
    filename: (req, file, cb) => cb(null, `${uuid()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
});

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
// Email/password + a selfie for gender verification (reviewed by an
// admin — see routes/admin.js). This selfie is ONLY used for gender
// review; it is separate from the age-estimation selfie used to unlock
// image sharing (routes/verification.js), which is processed by the
// age-estimation vendor and is not what an admin reviews.
router.post('/signup', upload.single('genderPhoto'), asyncHandler(async (req, res) => {
  const { email, password, displayName, ageConfirmed, genderClaimed } = req.body;

  if (!ageConfirmed || ageConfirmed === 'false') {
    return res.status(400).json({ error: 'You must confirm you are 18 or older to continue.' });
  }
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'A photo is required for gender verification.' });
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
      genderPhotoPath: req.file.path,
      genderVerification: 'PENDING',
      premiumGenderFilter: true,
    },
  });

  const token = signToken(user);
  res.status(201).json({ token, user: publicUser(user) });
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
    expiresAt: user.expiresAt,
    createdAt: user.createdAt,
  };
}

export default router;
