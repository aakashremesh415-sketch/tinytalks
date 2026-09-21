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
  const { publicKey } = req.body;
  if (!publicKey) return res.status(400).json({ error: 'publicKey is required.' });

  const key = await prisma.publicKey.create({
    data: { userId: req.user.id, publicKey },
  });
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

export default router;
