import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';

const router = Router();

// E2E encryption key exchange. The client generates an X25519 keypair
// (tweetnacl, box.keyPair()) locally and NEVER sends the private key
// anywhere. It publishes only the public key here so the other side of a
// conversation can compute a shared secret with nacl.box.before().
router.post('/publish', requireAuth, asyncHandler(async (req, res) => {
  const { publicKey, deviceId } = req.body;
  if (!publicKey) return res.status(400).json({ error: 'publicKey is required.' });

  // deviceId (a stable id the client generates once and keeps in
  // localStorage) lets this be an upsert — the same browser calling
  // /publish again on every visit updates its one row instead of piling
  // up a fresh one forever, and is what makes "every registered device"
  // in /all a real, bounded list rather than an ever-growing key history.
  if (deviceId) {
    const key = await prisma.publicKey.upsert({
      where: { userId_deviceId: { userId: req.user.id, deviceId } },
      update: { publicKey },
      create: { userId: req.user.id, deviceId, publicKey },
    });
    return res.status(201).json({ id: key.id });
  }

  // Back-compat for any client build that hasn't picked up deviceId yet.
  const key = await prisma.publicKey.create({ data: { userId: req.user.id, publicKey } });
  res.status(201).json({ id: key.id });
}));

router.get('/:userId/latest', requireAuth, asyncHandler(async (req, res) => {
  const key = await prisma.publicKey.findFirst({
    where: { userId: req.params.userId },
    orderBy: { createdAt: 'desc' },
  });
  if (!key) return res.status(404).json({ error: 'No public key published for this user yet.' });
  res.json({ publicKey: key.publicKey });
}));

// Every currently-registered device's public key for a user — used to fan
// a message out to all of them (see routes/messages.js /send), not just
// whichever one happens to be "latest". No relationship/friendship check:
// public keys are, by design, public — knowing one doesn't let you decrypt
// anything without the matching private key, which never leaves its device.
router.get('/:userId/all', requireAuth, asyncHandler(async (req, res) => {
  const keys = await prisma.publicKey.findMany({
    where: { userId: req.params.userId, deviceId: { not: null } },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ devices: keys.map((k) => ({ deviceId: k.deviceId, publicKey: k.publicKey })) });
}));

export default router;
