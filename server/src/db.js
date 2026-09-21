import { PrismaClient } from '@prisma/client';

// Vercel reuses warm lambda containers between invocations, but a fresh
// module load (cold start, or `npm run dev` restart) would otherwise
// create a new PrismaClient every time. Cache on `globalThis` so a warm
// container reuses the same client instead of opening extra connections.
const globalForPrisma = globalThis;

export const prisma = globalForPrisma.__tinytalksPrisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__tinytalksPrisma = prisma;
}
