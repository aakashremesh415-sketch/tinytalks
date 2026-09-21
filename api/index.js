// Vercel's entry point. Deliberately plain CommonJS (no top-level
// `import`/`export`, and the repo root has no "type": "module" — Vercel
// doesn't recognize a .cjs extension as a valid Serverless Function file
// at all, so this can't be forced via extension the way it normally
// would be) — and it loads the actual Express app, which genuinely is
// an ES module (server/package.json says "type": "module"), via dynamic
// import(). That's the fix for ERR_REQUIRE_ESM: a static top-level
// `import`/`require` of an ES module from a CommonJS file crashes;
// dynamic import() works from either module system.
let appPromise;
let bootstrapPromise;

function getApp() {
  if (!appPromise) {
    appPromise = import('../server/src/app.js').then((m) => m.default);
  }
  return appPromise;
}

function getBootstrapAdmin() {
  if (!bootstrapPromise) {
    bootstrapPromise = import('../server/src/lib/bootstrapAdmin.js').then((m) => m.bootstrapAdmin);
  }
  return bootstrapPromise;
}

module.exports = async function handler(req, res) {
  const [app, bootstrapAdmin] = await Promise.all([getApp(), getBootstrapAdmin()]);
  try {
    await bootstrapAdmin(); // no-ops after the first successful run per warm container
  } catch (err) {
    // A bootstrap failure (e.g. a transient DB hiccup) should never take
    // down every other request — log it and let the actual request
    // proceed; Express's own error handling in app.js takes it from here.
    console.error('[bootstrap] failed, continuing without blocking the request:', err);
  }
  app(req, res);
};
