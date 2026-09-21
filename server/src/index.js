// Local development entry point only. Vercel doesn't use this file — it
// uses /api/index.js at the repo root instead, which imports the same
// app.js and exports it as a serverless function rather than calling
// .listen(). Keeping them separate means local dev behaves like a normal
// long-running server (helpful for testing) while production behaves
// like the serverless function it actually is.
import app from './app.js';
import { bootstrapAdmin } from './lib/bootstrapAdmin.js';

const PORT = process.env.PORT || 4000;

bootstrapAdmin()
  .then(() => {
    app.listen(PORT, () => console.log(`tinytalks server listening on :${PORT} (local dev mode)`));
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
