import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';

// Best-effort client IP extraction. Vercel (and any proxy in front of this
// app) sets X-Forwarded-For to "client, proxy1, proxy2..." — the first hop
// is the actual visitor; req.socket.remoteAddress is the fallback for local
// dev, where there's no proxy in front of Express at all.
function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const first = String(xff).split(',')[0].trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress || null;
}

// Admin-only activity/IP tracking (see the User.lastIp/lastSeenAt and IpLog
// comments in schema.prisma, and routes/admin.js for the only place this is
// ever read back). Fire-and-forget on purpose — this rides along on every
// authenticated request, so it must never add latency or fail the request
// it's piggybacking on. Throttled so a chatty client doesn't turn into a
// write on every single API call: the denormalized lastIp/lastSeenAt pair
// only updates once the previous stamp is a few minutes stale (or the IP
// itself changed), and a new IpLog row is only appended when the IP
// actually changed from whatever was last recorded for this user.
const ACTIVITY_THROTTLE_MS = 5 * 60 * 1000;
function trackActivity(req, user) {
  const ip = getClientIp(req);
  if (!ip) return;
  const stale = !user.lastSeenAt || Date.now() - new Date(user.lastSeenAt).getTime() > ACTIVITY_THROTTLE_MS;
  const ipChanged = user.lastIp !== ip;
  if (stale || ipChanged) {
    prisma.user.update({ where: { id: user.id }, data: { lastIp: ip, lastSeenAt: new Date() } }).catch(() => {});
  }
  if (ipChanged) {
    prisma.ipLog.create({ data: { userId: user.id, ip, userAgent: req.headers['user-agent'] || null } }).catch(() => {});
  }
}

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, accountType: user.accountType },
    process.env.JWT_SECRET,
    { expiresIn: user.accountType === 'GUEST' ? '2d' : '30d' }
  );
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });
    if (user.banned) return res.status(403).json({ error: 'Account banned' });
    if (user.expiresAt && user.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Guest session expired' });
    }
    req.user = user;
    // Which of this account's devices is making the request — see
    // client/src/lib/api.js (sent on every request) and
    // client/src/lib/crypto.js (getOrCreateDeviceId, generated once per
    // browser). Used to pick the right per-device MessageCopy when
    // fetching history (routes/messages.js). Older clients that predate
    // multi-device support simply won't send this header; those requests
    // just fall back to a message's legacy single-copy fields.
    req.deviceId = req.headers['x-device-id'] || null;
    trackActivity(req, user);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.accountType !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Gate for anything image-related: must have passed BOTH email OTP and
// facial age-estimation. See lib/ageEstimation.js for why both are needed
// and why neither can be skipped in favor of a free/DIY replacement.
export function requireImageVerified(req, res, next) {
  if (!req.user.otpVerified || !req.user.ageEstimationPassed) {
    return res.status(403).json({
      error: 'Image sharing requires email verification and age verification first.',
      otpVerified: req.user.otpVerified,
      ageEstimationPassed: req.user.ageEstimationPassed,
    });
  }
  next();
}
