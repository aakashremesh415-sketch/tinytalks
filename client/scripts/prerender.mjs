#!/usr/bin/env node
// Post-build step: injects the homepage's real marketing copy (headline,
// "how it works", FAQ — see src/content/LandingSeoContent.jsx) as static
// HTML into dist/index.html's <div id="root"></div>, so crawlers and
// link-preview bots that don't execute JavaScript see actual text instead
// of an empty page. Real browsers are unaffected: main.jsx calls
// ReactDOM.createRoot(...).render(...), which replaces #root's contents
// outright rather than hydrating against them, so there's no mismatch to
// worry about — this snapshot is only ever seen for the brief moment
// before the real app loads, or by clients that never run JS at all.
//
// This intentionally does NOT touch <head> (title/meta/OG/JSON-LD) —
// those are hand-written directly in index.html as the reliable static
// baseline (see the comment there) precisely so a bug in this script can
// never leave the site without correct meta tags. If anything below
// fails, we log a warning and exit 0 rather than fail the build — a
// missing SEO snapshot is a regression worth noticing, not a reason to
// block every deploy.
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const clientRoot = path.resolve(__dirname, '..');
  const indexPath = path.join(clientRoot, 'dist/index.html');
  const require = createRequire(import.meta.url);

  const esbuild = require('esbuild');
  const bundlePath = path.join(clientRoot, 'node_modules/.tmp-prerender-seo-content.cjs');

  // Node can't parse JSX directly, so bundle just this one presentational
  // component down to plain CommonJS with esbuild (already a transitive
  // dependency of vite — nothing new to install). react / react-dom stay
  // external and get resolved by the `require` below, from this project's
  // real node_modules, so we render with the exact same React the app ships.
  esbuild.buildSync({
    entryPoints: [path.join(clientRoot, 'src/content/LandingSeoContent.jsx')],
    bundle: true,
    outfile: bundlePath,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime'],
  });

  try {
    const { default: LandingSeoContent } = require(bundlePath);
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');

    const html = renderToStaticMarkup(React.createElement(LandingSeoContent));

    const marker = '<div id="root"></div>';
    const indexHtml = readFileSync(indexPath, 'utf8');
    if (!indexHtml.includes(marker)) {
      console.warn('[prerender] Could not find the expected `<div id="root"></div>` marker in dist/index.html — skipping SEO snapshot (build output unaffected).');
      return;
    }

    writeFileSync(indexPath, indexHtml.replace(marker, `<div id="root">${html}</div>`));
    console.log(`[prerender] Injected ${html.length} bytes of static homepage markup into dist/index.html for crawlers.`);
  } finally {
    try { rmSync(bundlePath, { force: true }); } catch {}
  }
}

main().catch((err) => {
  console.warn('[prerender] Skipping SEO snapshot due to an error (build output unaffected):', err?.message || err);
});
