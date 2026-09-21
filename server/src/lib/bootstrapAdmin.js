import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';

let bootstrapped = false;

// Idempotent (checks for an existing row before creating), so it's safe
// to call on every cold start rather than needing a one-time "on server
// start" hook — Vercel serverless functions don't really have one of
// those the way a persistent process does. `bootstrapped` just avoids
// re-querying on every request within the same warm container.
export async function bootstrapAdmin() {
  if (bootstrapped) return;
  bootstrapped = true;

  const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!email) return;

  const existing = await prisma.user.findUnique({ where: { email } });

  // Someone may have already signed up with this email as a REGULAR
  // account before ADMIN_BOOTSTRAP_EMAIL was set to it — promote them in
  // place rather than skipping, and never touch their existing password.
  if (existing) {
    if (existing.accountType !== 'ADMIN') {
      await prisma.user.update({
        where: { id: existing.id },
        data: { accountType: 'ADMIN', genderVerification: 'APPROVED' },
      });
      console.log(`[bootstrap] Promoted existing account ${email} to ADMIN.`);
    }
    return;
  }

  if (!password) return; // can't create a brand-new account without one

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
  console.log(`[bootstrap] Created admin account for ${email}. Log in at /api/auth/login, then change the password.`);
}
