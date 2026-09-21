// Vercel's entry point. Deliberately written as CommonJS (the .cjs
// extension forces that regardless of the "type" field in any
// package.json) and loads the actual Express app — which genuinely is
// an ES module, since server/package.json says "type": "module" — via
// dynamic import(). That's the fix Vercel's own runtime error suggests
// for ERR_REQUIRE_ESM: a static top-level `import`/`require` of an ES
// module from a CommonJS file crashes; dynamic import() works from
// either module system, so this file works no matter how Vercel's
// bundler decides to treat api/index on a given build.
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
