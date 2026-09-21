import { Router } from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import { prisma } from '../db.js';
import { requireAuth, requireImageVerified } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { notifyUser } from '../lib/pusher.js';
import { uploadObject, fetchObject, deleteObject } from '../lib/storage.js';

const router = Router();

// Vercel's filesystem is ephemeral, so images go straight to memory and
// then to Vercel Blob — never touch local disk.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Send a self-destruct image into a conversation. The uploaded bytes are
// expected to already be end-to-end encrypted client-side (nacl.box, same
// scheme as text messages) — what lands in Blob storage is an opaque
// ciphertext blob, meaningless without the recipient's private key.
router.post('/', requireAuth, requireImageVerified, upload.single('image'), asyncHandler(async (req, res) => {
  const { conversationId, nonce, senderPubKey, viewMode } = req.body;

  if (!conversationId || !nonce || !senderPubKey) {
    return res.status(400).json({ error: 'conversationId, nonce and senderPubKey are required.' });
  }
  if (!['TIMED_10S', 'ONE_TIME'].includes(viewMode)) {
    return res.status(400).json({ error: 'viewMode must be TIMED_10S or ONE_TIME.' });
  }
  if (!req.file) return res.status(400).json({ error: 'Image file is required.' });

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || ![conversation.participantAId, conversation.participantBId].includes(req.user.id)) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }

  const { url } = await uploadObject(`images/${uuid()}.bin`, req.file.buffer, 'application/octet-stream');

  const uploadedAt = new Date();
  const hardDeleteAt = new Date(uploadedAt.getTime() + 7 * 24 * 60 * 60 * 1000);

  const message = await prisma.message.create({
    data: {
      conversationId,
      senderId: req.user.id,
      ciphertext: '',
      nonce,
      senderPubKey,
      kind: 'image',
      image: {
        create: { storagePath: url, viewMode, uploadedAt, hardDeleteAt },
      },
    },
    include: { image: true },
  });

  const partnerId = conversation.participantAId === req.user.id
    ? conversation.participantBId
    : conversation.participantAId;

  await notifyUser(partnerId, 'message:new', {
    id: message.id,
    conversationId,
    nonce,
    senderPubKey,
    kind: 'image',
    imageId: message.image.id,
    viewMode: message.image.viewMode,
    createdAt: message.createdAt,
  });

  res.status(201).json({ messageId: message.id, image: publicImage(message.image) });
}));

// Recipient (or sender) fetches the encrypted image bytes to decrypt and
// display client-side. Opening it consumes the one-time/timed view.
router.get('/:imageId/view', requireAuth, requireImageVerified, asyncHandler(async (req, res) => {
  const image = await prisma.image.findUnique({
    where: { id: req.params.imageId },
    include: { message: { include: { conversation: true } } },
  });
  if (!image) return res.status(404).json({ error: 'Not found or already removed.' });

  const conv = image.message.conversation;
  if (![conv.participantAId, conv.participantBId].includes(req.user.id)) {
    return res.status(403).json({ error: 'Not a participant in this conversation.' });
  }
  if (image.deletedFromChatAt) return res.status(410).json({ error: 'This image is no longer available.' });

  const bytes = await fetchObject(image.storagePath);
  if (!bytes) return res.status(410).json({ error: 'Image file no longer exists.' });

  if (!image.firstViewedAt) {
    await prisma.image.update({ where: { id: image.id }, data: { firstViewedAt: new Date() } });
  }
  if (image.viewMode === 'ONE_TIME' && req.user.id !== image.message.senderId) {
    await prisma.image.update({ where: { id: image.id }, data: { viewedComplete: true } });
  }

  res.setHeader('Content-Type', 'application/octet-stream');
  res.send(bytes);
}));

// Explicit user delete — per the retention rule, deleting it yourself
// removes it immediately rather than waiting out the week-long grace
// window used for images the user never explicitly deletes.
router.delete('/:imageId', requireAuth, asyncHandler(async (req, res) => {
  const image = await prisma.image.findUnique({
    where: { id: req.params.imageId },
    include: { message: true },
  });
  if (!image) return res.status(404).json({ error: 'Not found.' });
  if (image.message.senderId !== req.user.id) {
    return res.status(403).json({ error: 'Only the sender can delete this image.' });
  }

  await deleteObject(image.storagePath);

  await prisma.image.update({
    where: { id: image.id },
    data: { deletedByUser: true, deletedFromChatAt: new Date(), hardDeletedAt: new Date() },
  });

  res.json({ ok: true });
}));

export function publicImage(image) {
  return {
    id: image.id,
    viewMode: image.viewMode,
    uploadedAt: image.uploadedAt,
    viewedComplete: image.viewedComplete,
    available: !image.deletedFromChatAt,
  };
}

export default router;
