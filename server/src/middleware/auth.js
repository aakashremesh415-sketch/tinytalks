import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';

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
