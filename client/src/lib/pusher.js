import Pusher from 'pusher-js';

let client = null;

// Auth for private channels goes through our own API (which checks the
// JWT and that the requested channel actually belongs to this user —
// see server/src/routes/pusherAuth.js) rather than Pusher's default
// same-origin cookie auth, since we're a token-based API.
export function connectPusher(token) {
  if (client) client.disconnect();
  client = new Pusher(import.meta.env.VITE_PUSHER_KEY, {
    cluster: import.meta.env.VITE_PUSHER_CLUSTER || 'us2',
    channelAuthorization: {
      endpoint: '/api/pusher/auth',
      headers: { Authorization: `Bearer ${token}` },
      transport: 'ajax',
    },
  });
  return client;
}

export function getPusher() {
  return client;
}

export function userChannel(userId) {
  return `private-user-${userId}`;
}

// Mirrors server/src/lib/pusher.js's PRESENCE_CHANNEL — a single shared
// channel every logged-in client joins to get a live online/offline
// roster via Pusher's own presence-channel membership events, rather
// than polling or maintaining a "last seen" column.
export const PRESENCE_CHANNEL = 'presence-online-users';
