// Vercel's entry point. Every request under /api/* is routed here by the
// rewrite in vercel.json, and Express's own routing inside app.js takes
// it from there — this file's only job is to hand the request to that
// same Express app instead of calling app.listen() the way local dev
// does (see server/src/index.js).
import app from '../server/src/app.js';
import { bootstrapAdmin } from '../server/src/lib/bootstrapAdmin.js';

export default async function handler(req, res) {
  await bootstrapAdmin(); // no-ops after the first successful run per warm container
  app(req, res);
}
