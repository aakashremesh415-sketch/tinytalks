import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';

// In-memory matchmaking queue. Fine for an MVP single-process deployment;
// move to a shared store (Redis) if you ever run more than one server
// process.
const waitingQueue = []; // [{ socketId, userId, genderClaimed, wantsGenderFilter, desiredGender }]
const socketToUser = new Map(); // socketId -> userId
const userToSocket = new Map(); // userId -> socketId
const socketToConversation = new Map(); // socketId -> conversationId

// socket.io does not catch a rejected promise from an async event
// handler either — same crash risk as Express async routes. Wrap each
// handler so a DB error just logs and emits an error event instead of
// taking down every connected user's session.
function safeHandler(socket, fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (err) {
      console.error('[socket] handler error:', err);
      const maybeAck = args[args.length - 1];
      if (typeof maybeAck === 'function') maybeAck({ error: 'Something went wrong. Please try again.' });
      else socket.emit('error:generic', { error: 'Something went wrong. Please try again.' });
    }
  };
}

export function registerChatSockets(io) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.banned) return next(new Error('unauthorized'));
      socket.user = user;
      next();
    } catch (e) {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socketToUser.set(socket.id, socket.user.id);
    userToSocket.set(socket.user.id, socket.id);

    socket.on('queue:join', safeHandler(socket, async ({ desiredGender } = {}) => {
      removeFromQueue(socket.user.id);

      // Gender filter is a premium feature (free for now, pre-payments —
      // premiumGenderFilter is just a flag an admin can flip on/off).
      const canFilter = socket.user.premiumGenderFilter && desiredGender && desiredGender !== 'ANY';

      const candidateIndex = waitingQueue.findIndex((w) => {
        if (w.userId === socket.user.id) return false;
        // If either side wants a gender filter, both sides' claimed
        // genders must satisfy the other's request.
        const otherWantsFilter = w.desiredGender && w.desiredGender !== 'ANY' && w.canFilter;
        if (canFilter && w.genderClaimed !== desiredGender) return false;
        if (otherWantsFilter && socket.user.genderClaimed !== w.desiredGender) return false;
        return true;
      });

      if (candidateIndex === -1) {
        waitingQueue.push({
          socketId: socket.id,
          userId: socket.user.id,
          genderClaimed: socket.user.genderClaimed,
          desiredGender,
          canFilter,
        });
        socket.emit('queue:waiting');
        return;
      }

      const [match] = waitingQueue.splice(candidateIndex, 1);
      const conversation = await prisma.conversation.create({
        data: { participantAId: socket.user.id, participantBId: match.userId },
      });

      socketToConversation.set(socket.id, conversation.id);
      socketToConversation.set(match.socketId, conversation.id);

      const matchSocket = io.sockets.sockets.get(match.socketId);
      socket.emit('queue:matched', { conversationId: conversation.id, partnerId: match.userId });
      matchSocket?.emit('queue:matched', { conversationId: conversation.id, partnerId: socket.user.id });
    }));

    socket.on('queue:leave', () => removeFromQueue(socket.user.id));

    // Relay of an already-E2E-encrypted message. The server never sees
    // plaintext: ciphertext/nonce were produced client-side with
    // nacl.box using the recipient's published public key.
    socket.on('message:send', safeHandler(socket, async ({ conversationId, ciphertext, nonce, senderPubKey, kind }, ack) => {
      const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
      if (!conversation) return ack?.({ error: 'Conversation not found' });
      if (![conversation.participantAId, conversation.participantBId].includes(socket.user.id)) {
        return ack?.({ error: 'Not a participant' });
      }

      const message = await prisma.message.create({
        data: {
          conversationId,
          senderId: socket.user.id,
          ciphertext,
          nonce,
          senderPubKey,
          kind: kind || 'text',
        },
      });

      const partnerId = conversation.participantAId === socket.user.id
        ? conversation.participantBId
        : conversation.participantAId;
      const partnerSocketId = userToSocket.get(partnerId);
      const partnerSocket = partnerSocketId && io.sockets.sockets.get(partnerSocketId);

      partnerSocket?.emit('message:new', {
        id: message.id,
        conversationId,
        ciphertext,
        nonce,
        senderPubKey,
        kind: message.kind,
        createdAt: message.createdAt,
      });

      ack?.({ ok: true, messageId: message.id });
    }));

    socket.on('conversation:end', ({ conversationId }) => {
      prisma.conversation.update({ where: { id: conversationId }, data: { endedAt: new Date() } }).catch(() => {});
      socketToConversation.delete(socket.id);
    });

    socket.on('disconnect', () => {
      removeFromQueue(socket.user.id);
      socketToUser.delete(socket.id);
      userToSocket.delete(socket.user.id);
      socketToConversation.delete(socket.id);
    });
  });
}

function removeFromQueue(userId) {
  const idx = waitingQueue.findIndex((w) => w.userId === userId);
  if (idx !== -1) waitingQueue.splice(idx, 1);
}

// Used by REST routes (e.g. image upload) that need to push a real-time
// event to a specific user's socket after finishing server-side work.
export function emitToUser(io, userId, event, payload) {
  const socketId = userToSocket.get(userId);
  const socket = socketId && io.sockets.sockets.get(socketId);
  socket?.emit(event, payload);
  return Boolean(socket);
}
