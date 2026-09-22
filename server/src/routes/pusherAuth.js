import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { pusher, userChannel, PRESENCE_CHANNEL } from '../lib/pusher.js';

const router = Router();

// Pusher's client SDK calls this endpoint whenever it needs permission to
// subscribe to a private or presence channel. We only ever grant a
// user's own private-user-<id> channel — never someone else's — so a
// user can't eavesdrop on another user's matches or messages just by
// guessing a channel name. The one exception is the shared presence
// channel (see lib/pusher.js), which every authenticated user may join —
// its only purpose is a live online/offline roster, never sensitive data.
router.post('/auth', requireAuth, asyncHandler(async (req, res) => {
  const { socket_id: socketId, channel_name: channelName } = req.body;
  if (!socketId || !channelName) {
    return res.status(400).json({ error: 'socket_id and channel_name are required.' });
  }

  if (channelName === PRESENCE_CHANNEL) {
    const presenceData = {
      user_id: req.user.id,
      user_info: { displayName: req.user.displayName || 'Anonymous' },
    };
    return res.send(pusher.authorizeChannel(socketId, channelName, presenceData));
  }

  if (channelName !== userChannel(req.user.id)) {
    return res.status(403).json({ error: 'Not authorized for this channel.' });
  }

  res.send(pusher.authorizeChannel(socketId, channelName));
}));

export default router;
