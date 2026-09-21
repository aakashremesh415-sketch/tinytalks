import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import bcrypt from 'bcryptjs';

import { prisma } from './db.js';
import authRoutes from './routes/auth.js';
import otpRoutes from './routes/otp.js';
import verificationRoutes from './routes/verification.js';
import reportRoutes from './routes/reports.js';
import adminRoutes from './routes/admin.js';
import imageRoutes from './routes/images.js';
import keyRoutes from './routes/keys.js';
import { registerChatSockets } from './sockets/chat.js';
import { startRetentionJobs } from './jobs/retention.js';

// Last-resort safety net: every request/socket-handler path above should
// already catch its own errors (asyncHandler / safeHandler), but this
// stops any error that slips through from silently killing the process
// and every connected user's session along with it.
process.on('unhandledRejection', (err) => {
  console.error('[fatal-guard] Unhandled rejection (this should have been caught closer to its source):', err);
});
process.on('uncaughtException', (err) => {
  console.error('[fatal-guard] Uncaught exception (this should have been caught closer to its source):', err);
});

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/auth', authRoutes);
app.use('/otp', otpRoutes);
app.use('/verification', verificationRoutes);
app.use('/reports', reportRoutes);
app.use('/admin', adminRoutes);
app.use('/images', imageRoutes);
app.use('/keys', keyRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: process.env.CLIENT_ORIGIN || '*' },
});
registerChatSockets(io);
app.locals.io = io;

async function bootstrapAdmin() {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!email || !password) return;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return;

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      accountType: 'ADMIN',
      email,
      passwordHash,
      displayName: 'Admin',
      ageConfirmed: true,
      ageConfirmedAt: new Date(),
      genderVerification: 'APPROVED',
    },
  });
  console.log(`[bootstrap] Created admin account for ${email}. Log in at /auth/login, then change the password.`);
}

const PORT = process.env.PORT || 4000;
bootstrapAdmin()
  .then(() => startRetentionJobs())
  .then(() => {
    server.listen(PORT, () => console.log(`tinytalks server listening on :${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
