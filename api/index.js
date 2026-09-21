// Vercel's entry point. Every request under /api/* is routed here by the
// rewrite in vercel.json, and Express's own routing inside app.js takes
// it from there — this file's only job is to hand the request to that
// same Express app instead of calling app.listen() the way local dev
// does (see server/src/index.js).
import app from '../server/src/app.js';
import { bootstrapAdmin } from '../server/src/lib/bootstrapAdmin.js';

export default async function handler(req, res) {
  try {
    await bootstrapAdmin(); // no-ops after the first successful run per warm container
  } catch (err) {
    // A bootstrap failure (e.g. a transient DB hiccup) should never take
    // down every other request — log it and let the actual request
    // proceed; Express's own error handling in app.js takes it from here.
    console.error('[bootstrap] failed, continuing without blocking the request:', err);
  }
  app(req, res);
}
