import { Router } from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { notifyUser } from '../lib/pusher.js';
import { uploadObject, fetchObject, deleteObject } from '../lib/storage.js';

const router = Router();

// Same reasoning as images.js: Vercel's filesystem is ephemeral, so the
// encrypted audio blob goes straight to memory and then Vercel Blob.
// 10MB is generous for a voice note (well over a minute at typical
// compressed bitrates) without inviting people to smuggle large files in.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Send a voice note. Like images, this is single-device only (see the
// comment on the VoiceNote model in schema.prisma for why erase-on-listen
// and multi-device fan-out don't mix) — the uploaded bytes are expected to
// already be E2E-encrypted client-side (nacl.box, same as images) against
// the partner's currently-registered key, not a per-device fan-out. Not
// gated behind image/age verification — voice doesn't carry the same risk
// profile that gate exists for.
router.post('/', requireAuth, upload.single('audio'), asyncHandler(async (req, res) => {
  const { conversationId, nonce, senderPubKey, durationSec } = req.body;

  if (!conversationId || !nonce || !senderPubKey) {
    return res.status(400).json({ error: 'conversationId, nonce and senderPubKey are required.' });
  }
  if (!req.file) return res.status(400).json({ error: 'Audio file is required.' });

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || ![conversation.participantAId, conversation.participantBId].includes(req.user.id)) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }

  const { url } = await uploadObject(`voice-notes/${uuid()}.bin`, req.file.buffer, 'application/octet-stream');

  const uploadedAt = new Date();
  const hardDeleteAt = new Date(uploadedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  const parsedDuration = Number.parseInt(durationSec, 10);

  const message = await prisma.message.create({
    data: {
      conversationId,
      senderId: req.user.id,
      ciphertext: '',
      nonce,
      senderPubKey,
      kind: 'voice',
      voiceNote: {
        create: {
          storagePath: url,
          uploadedAt,
          hardDeleteAt,
          durationSec: Number.isFinite(parsedDuration) ? parsedDuration : null,
        },
      },
    },
    include: { voiceNote: true },
  });

  const partnerId = conversation.participantAId === req.user.id
    ? conversation.participantBId
    : conversation.participantAId;

  await notifyUser(partnerId, 'message:new', {
    id: message.id,
    conversationId,
    senderId: req.user.id,
    nonce,
    senderPubKey,
    kind: 'voice',
    voiceNoteId: message.voiceNote.id,
    durationSec: message.voiceNote.durationSec,
    createdAt: message.createdAt,
  });

  res.status(201).json({ messageId: message.id, voiceNote: publicVoiceNote(message.voiceNote) });
}));

// Fetches the encrypted audio bytes to decrypt and play client-side.
// Finishing playback (the client calls this once, when the recipient
// actually opens/plays it) erases it immediately — the blob AND the row —
// rather than soft-deleting and waiting for a cron sweep. The sender can
// still fetch their own sent note back (e.g. to confirm it went out
// alright) without consuming it, same convention as images' ONE_TIME view.
router.get('/:voiceNoteId/listen', requireAuth, asyncHandler(async (req, res) => {
  const note = await prisma.voiceNote.findUnique({
    where: { id: req.params.voiceNoteId },
    include: { message: { include: { conversation: true } } },
  });
  if (!note) return res.status(404).json({ error: 'Not found or already removed.' });

  const conv = note.message.conversation;
  if (![conv.participantAId, conv.participantBId].includes(req.user.id)) {
    return res.status(403).json({ error: 'Not a participant in this conversation.' });
  }

  const bytes = await fetchObject(note.storagePath);
  if (!bytes) return res.status(410).json({ error: 'Voice note no longer exists.' });

  const isRecipient = req.user.id !== note.message.senderId;
  if (isRecipient) {
    // Erase now, after the bytes are already read into memory for this
    // response — the recipient gets to hear it once, and the row itself
    // (not just the blob) is gone from the database afterward, same as
    // the client asked for. The Message row stays (kind stays 'voice'),
    // just with no VoiceNote attached any more, so history can still show
    // "voice note — played" instead of the entry vanishing outright.
    await deleteObject(note.storagePath).catch(() => {});
    await prisma.voiceNote.delete({ where: { id: note.id } }).catch(() => {});
  }

  res.setHeader('Content-Type', 'application/octet-stream');
  res.send(bytes);
}));

export function publicVoiceNote(note) {
  return {
    id: note.id,
    durationSec: note.durationSec,
    uploadedAt: note.uploadedAt,
  };
}

export default router;
