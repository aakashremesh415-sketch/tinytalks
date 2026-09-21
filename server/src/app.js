import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import authRoutes from './routes/auth.js';
import otpRoutes from './routes/otp.js';
import verificationRoutes from './routes/verification.js';
import reportRoutes from './routes/reports.js';
import adminRoutes from './routes/admin.js';
import imageRoutes from './routes/images.js';
import keyRoutes from './routes/keys.js';
import queueRoutes from './routes/queue.js';
import messageRoutes from './routes/messages.js';
import pusherAuthRoutes from './routes/pusherAuth.js';
import cronRoutes from './routes/cron.js';

// Last-resort safety net: every request handler above should already
// catch its own errors (asyncHandler), but this stops any error that
// slips through from silently killing the process. On Vercel a crashed
// invocation only affects that one request anyway, but this still keeps
// local `npm run dev` from dying the same way it used to before the
// asyncHandler pass.
process.on('unhandledRejection', (err) => {
  console.error('[fatal-guard] Unhandled rejection (this should have been caught closer to its source):', err);
});
process.on('uncaughtException', (err) => {
  console.error('[fatal-guard] Uncaught exception (this should have been caught closer to its source):', err);
});

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json());

// Everything is mounted under /api so that, on Vercel, a single rewrite
// (`/api/(.*)` → this function) forwards the whole path straight through
// and Express's own routing takes it from there — no path-rewriting
// needed between local dev and production. See vite.config.js: the dev
// proxy forwards /api unmodified too, for the same reason.
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/otp', otpRoutes);
app.use('/api/verification', verificationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/keys', keyRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/pusher', pusherAuthRoutes);
app.use('/api/cron', cronRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
