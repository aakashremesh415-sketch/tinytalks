import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { pusher, userChannel } from '../lib/pusher.js';

const router = Router();
const SIGNAL_TYPES = new Set(['invite', 'accept', 'reject', 'hangup']);
const CALL_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REALTIME_TOKEN_TTL_SECONDS = 60 * 60;
const FRAME_ROOM_TTL_SECONDS = 2 * 60 * 60;
const METERED_REQUEST_TIMEOUT_MS = 10_000;
const METERED_CHANNEL_PREFIX = 'tinytalks/conversations';

function meteredSettings() {
  const appName = process.env.METERED_APP_NAME?.trim();
  const secretKey = process.env.METERED_SECRET_KEY;
  if (!appName || !secretKey) {
    throw new Error('METERED_APP_NAME and METERED_SECRET_KEY must be configured.');
  }
  if (!/^[a-z0-9-]+$/i.test(appName)) {
    throw new Error('METERED_APP_NAME must be a valid Metered app name.');
  }
  return { appName, secretKey };
}

async function meteredRequest(endpoint, body) {
  const { appName, secretKey } = meteredSettings();
  const url = new URL(`/api/v1/${endpoint}`, `https://${appName}.metered.live`);
  url.searchParams.set('secretKey', secretKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), METERED_REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    console.error(`[metered] ${endpoint} request failed with status ${response.status}.`);
    throw new Error(`Metered ${endpoint} request failed.`);
  }
  return response.json();
}

async function authorizeConversationCall(conversationId, userId, res) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { participantAId: true, participantBId: true },
  });
  if (!conversation) {
    res.status(404).json({ error: 'Conversation not found.' });
    return null;
  }
  if (![conversation.participantAId, conversation.participantBId].includes(userId)) {
    res.status(403).json({ error: 'Not a participant in this conversation.' });
    return null;
  }

  const partnerId = conversation.participantAId === userId
    ? conversation.participantBId
    : conversation.participantAId;
  const block = await prisma.blockedUser.findFirst({
    where: {
      OR: [
        { blockerId: userId, blockedId: partnerId },
        { blockerId: partnerId, blockedId: userId },
      ],
    },
    select: { id: true },
  });
  if (block) {
    res.status(403).json({ error: 'Calls and realtime chat are unavailable in this conversation.' });
    return null;
  }
  return conversation;
}

function frameRoomName(callId) {
  return `call-${callId}`;
}

async function createFrameAccessToken(roomName) {
  const expirationDate = new Date(Date.now() + FRAME_ROOM_TTL_SECONDS * 1000);
  const result = await meteredRequest('token', { roomName, expirationDate: expirationDate.toISOString() });
  if (typeof result?.token !== 'string' || !result.token) {
    throw new Error('Metered did not return a room access token.');
  }
  return result.token;
}

router.post('/:conversationId/realtime-token', requireAuth, asyncHandler(async (req, res) => {
  const conversation = await authorizeConversationCall(req.params.conversationId, req.user.id, res);
  if (!conversation) return;

  const appName = process.env.METERED_APP_NAME?.trim();
  const keyId = process.env.METERED_REALTIME_SK_ID;
  const signingSecret = process.env.METERED_REALTIME_SK;
  if (!appName || !keyId || !signingSecret) {
    return res.status(500).json({ error: 'Metered realtime credentials are not configured on the server.' });
  }
  if (!/^[a-z0-9-]+$/i.test(appName)) {
    return res.status(500).json({ error: 'METERED_APP_NAME must be a valid Metered app name.' });
  }

  const channel = `${METERED_CHANNEL_PREFIX}/${req.params.conversationId}`;
  const token = jwt.sign({
    sub: req.user.id,
    channels: [channel],
    permissions: ['publish', 'subscribe', 'presence'],
    peerMetadata: {
      username: req.user.displayName || 'Anonymous',
      avatarUrl: req.user.avatarUrl || null,
    },
    exp: Math.floor(Date.now() / 1000) + REALTIME_TOKEN_TTL_SECONDS,
  }, signingSecret, {
    algorithm: 'HS256',
    header: { kid: keyId },
  });

  res.set('Cache-Control', 'no-store');
  res.json({ token, channel });
}));

router.post('/:conversationId/frame-room', requireAuth, asyncHandler(async (req, res) => {
  const conversation = await authorizeConversationCall(req.params.conversationId, req.user.id, res);
  if (!conversation) return;

  const { callId } = req.body;
  if (!CALL_ID_RE.test(callId || '')) {
    return res.status(400).json({ error: 'A valid callId is required.' });
  }

  let appName;
  try {
    ({ appName } = meteredSettings());
  } catch (error) {
    console.error('[calls] Metered server configuration is incomplete:', error.message);
    return res.status(500).json({ error: 'METERED_APP_NAME and METERED_SECRET_KEY must be configured on the server.' });
  }
  const roomName = frameRoomName(callId);
  const expireUnixSec = Math.floor(Date.now() / 1000) + FRAME_ROOM_TTL_SECONDS;
  let accessToken;
  try {
    await meteredRequest('room', {
      roomName,
      privacy: 'private',
      maxParticipants: 2,
      autoJoin: true,
      enableRequestToJoin: false,
      enableChat: false,
      enableScreenSharing: false,
      audioOnlyRoom: true,
      joinVideoOn: false,
      joinAudioOn: true,
      expireUnixSec,
      ejectAtRoomExp: true,
    });
    accessToken = await createFrameAccessToken(roomName);
  } catch (error) {
    console.error('[calls] Metered room provisioning failed:', error);
    return res.status(502).json({ error: 'Could not prepare the Metered call room. Check the Metered server configuration and try again.' });
  }

  res.set('Cache-Control', 'no-store');
  res.json({
    roomURL: `${appName}.metered.live/${roomName}`,
    accessToken,
  });
}));

router.post('/:conversationId/frame-token', requireAuth, asyncHandler(async (req, res) => {
  const conversation = await authorizeConversationCall(req.params.conversationId, req.user.id, res);
  if (!conversation) return;

  const { callId } = req.body;
  if (!CALL_ID_RE.test(callId || '')) {
    return res.status(400).json({ error: 'A valid callId is required.' });
  }

  let accessToken;
  try {
    accessToken = await createFrameAccessToken(frameRoomName(callId));
  } catch (error) {
    console.error('[calls] Metered access-token request failed:', error);
    return res.status(502).json({ error: 'Could not authorize this Metered call. Check the Metered server configuration and try again.' });
  }
  const { appName } = meteredSettings();
  res.set('Cache-Control', 'no-store');
  res.json({
    roomURL: `${appName}.metered.live/${frameRoomName(callId)}`,
    accessToken,
  });
}));

router.post('/:conversationId/signal', requireAuth, asyncHandler(async (req, res) => {
  const { callId, type } = req.body;
  if (!CALL_ID_RE.test(callId || '') || !SIGNAL_TYPES.has(type)) {
    return res.status(400).json({ error: 'A valid callId and signal type are required.' });
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: req.params.conversationId },
    select: { participantAId: true, participantBId: true },
  });
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
  if (![conversation.participantAId, conversation.participantBId].includes(req.user.id)) {
    return res.status(403).json({ error: 'Not a participant in this conversation.' });
  }

  const partnerId = conversation.participantAId === req.user.id
    ? conversation.participantBId
    : conversation.participantAId;
  const block = await prisma.blockedUser.findFirst({
    where: {
      OR: [
        { blockerId: req.user.id, blockedId: partnerId },
        { blockerId: partnerId, blockedId: req.user.id },
      ],
    },
    select: { id: true },
  });
  if (block) return res.status(403).json({ error: 'Calls are unavailable in this conversation.' });

  const payload = {
    conversationId: req.params.conversationId,
    callId,
    type,
    fromUserId: req.user.id,
    fromDisplayName: req.user.displayName || 'Anonymous',
  };
  await pusher.trigger(userChannel(partnerId), 'call:signal', payload);
  if (type === 'accept') {
    await pusher.trigger(userChannel(req.user.id), 'call:claimed', {
      conversationId: req.params.conversationId,
      callId,
      fromUserId: req.user.id,
    });
  } else if (type === 'reject' || type === 'hangup') {
    await pusher.trigger(userChannel(req.user.id), 'call:closed', {
      conversationId: req.params.conversationId,
      callId,
      fromUserId: req.user.id,
    });
  }
  res.json({ ok: true });
}));

export default router;
