// Realtime layer, replacing Socket.io.
//
// Why: Socket.io needs a long-lived, stateful connection between a
// specific client and a specific server process. Vercel serverless
// functions are the opposite of that — they spin up per request, run for
// at most a few seconds to a couple minutes, and don't keep anything in
// memory between invocations. Pusher Channels externalizes the "hold a
// persistent connection open" problem to a managed service: our
// serverless functions just POST an event to Pusher over regular HTTP
// whenever something happens (a match found, a message sent), and
// Pusher's own infrastructure — not ours — holds the actual live
// connection to each browser.
//
// Every notification targets the RECIPIENT's own private channel,
// private-user-<userId> — mirroring exactly what the old Socket.io code
// did (emit to the partner's specific socket, never broadcast). That
// means the sender never receives an echo of their own message/match and
// there's no shared "conversation channel" or socket-exclusion logic to
// manage — one channel per user, and you only ever notify the other
// participant.
import Pusher from 'pusher';

export const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER || 'us2',
  useTLS: true,
});

export function userChannel(userId) {
  return `private-user-${userId}`;
}

// One shared presence channel every logged-in client joins purely to get
// a live online/offline roster — Pusher tracks channel membership for us
// (subscription_succeeded gives the initial member list; member_added/
// member_removed fire in realtime as people connect/disconnect), so
// there's no polling or "last seen" column to maintain server-side.
// Carries no sensitive data (see pusherAuth.js's presence payload), so
// unlike userChannel it's fine for every authenticated user to join.
export const PRESENCE_CHANNEL = 'presence-online-users';

export async function notifyUser(userId, event, payload) {
  try {
    await pusher.trigger(userChannel(userId), event, payload);
  } catch (err) {
    console.error('[pusher] notifyUser failed (continuing):', err.message);
  }
}
