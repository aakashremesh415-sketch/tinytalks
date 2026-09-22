import { createContext, useContext, useEffect, useState } from 'react';
import { connectPusher, userChannel, PRESENCE_CHANNEL } from './pusher.js';
import { getStoredToken } from './api.js';
import { useAuth } from './auth.jsx';

const RealtimeContext = createContext(null);

// Owns the single Pusher connection for the whole logged-in session, and is
// mounted once at the app root (see main.jsx) — NOT per-route.
//
// Chat.jsx used to open its own connection on mount and tear it down on
// unmount. That meant simply navigating away from /chat (to Settings, say)
// disconnected the socket entirely: this user's presence-channel membership
// dropped, so anyone chatting with them would see them go "offline" — and,
// worse, would see a false "disconnected" system notice in the thread —
// even though they never actually left the app or ended anything. Living
// here instead, the connection (and this user's online status) survives
// route changes and only ever drops on a real logout or tab close.
export function RealtimeProvider({ children }) {
  const { user } = useAuth();
  const [onlineUserIds, setOnlineUserIds] = useState(() => new Set());
  const [userChannelObj, setUserChannelObj] = useState(null);
  // Flips true once the initial presence roster has arrived, so consumers
  // that diff onlineUserIds over time (Chat.jsx's disconnect/reconnect
  // notices) can tell "here's who was already online" apart from a real
  // member_added transition, which would otherwise look identical.
  const [presenceReady, setPresenceReady] = useState(false);

  useEffect(() => {
    if (!user) {
      setOnlineUserIds(new Set());
      setUserChannelObj(null);
      setPresenceReady(false);
      return;
    }

    const token = getStoredToken();
    const pusher = connectPusher(token);
    const channel = pusher.subscribe(userChannel(user.id));
    const presence = pusher.subscribe(PRESENCE_CHANNEL);
    setUserChannelObj(channel);

    // Pusher tracks channel membership for us: subscription_succeeded hands
    // back the initial roster, member_added/member_removed fire live as
    // people connect/disconnect — no polling or "last seen" column needed.
    presence.bind('pusher:subscription_succeeded', (members) => {
      const ids = new Set();
      members.each((m) => ids.add(m.id));
      setOnlineUserIds(ids);
      setPresenceReady(true);
    });
    presence.bind('pusher:member_added', (member) => {
      setOnlineUserIds((prev) => new Set(prev).add(member.id));
    });
    presence.bind('pusher:member_removed', (member) => {
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        next.delete(member.id);
        return next;
      });
    });

    return () => {
      presence.unbind_all();
      pusher.unsubscribe(PRESENCE_CHANNEL);
      pusher.unsubscribe(userChannel(user.id));
      pusher.disconnect();
      setUserChannelObj(null);
      setPresenceReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return (
    <RealtimeContext.Provider value={{ onlineUserIds, userChannel: userChannelObj, presenceReady }}>
      {children}
    </RealtimeContext.Provider>
  );
}

// Pages bind their OWN listeners to the shared channel this returns (and
// unbind them, by reference, on their own unmount) — they never subscribe,
// unsubscribe or disconnect it themselves, since its lifecycle belongs to
// the provider above for as long as the user is logged in.
export function useRealtime() {
  return useContext(RealtimeContext) || { onlineUserIds: new Set(), userChannel: null, presenceReady: false };
}
