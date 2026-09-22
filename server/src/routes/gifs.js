import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';

const router = Router();

// Giphy's own publicly-documented "beta" API key — Giphy publishes this
// specifically so apps can integrate GIF search before signing up for
// their own key. It's shared across everyone who hasn't set GIPHY_API_KEY
// and is rate-limited accordingly, so it's fine for trying this out, but
// swap in your own free key (developers.giphy.com) before real traffic.
const GIPHY_KEY = process.env.GIPHY_API_KEY || 'dc6zaTOxFJmzC';
const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';

function shape(results) {
  return (results || []).map((g) => ({
    id: g.id,
    title: g.title || 'GIF',
    // fixed_width_small for the picker grid (fast to load many at once),
    // fixed_width for what actually gets sent/rendered in the thread.
    previewUrl: g.images?.fixed_width_small?.url || g.images?.fixed_width?.url || g.images?.original?.url,
    url: g.images?.fixed_width?.url || g.images?.original?.url,
  })).filter((g) => g.url);
}

// Both routes fail soft (empty list, 200) rather than surfacing a 500 to
// the composer over a flaky third-party API or an exhausted shared key —
// sending a GIF just becomes unavailable for a moment, same as if the
// picker had no results. Each fetch to Giphy carries its own timeout (same
// AbortController pattern as lookupIpLocation in middleware/auth.js) —
// without one, a slow or unresponsive Giphy call had nothing forcing it to
// fail, so the request (and the picker's "Loading…" state) could hang far
// longer than anyone would wait, all the way out to Vercel's function
// timeout instead of failing fast into the normal empty-results state.
async function fetchGiphy(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(url, { signal: controller.signal });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.meta?.msg || `Giphy responded ${r.status}`);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

router.get('/trending', requireAuth, asyncHandler(async (req, res) => {
  try {
    const data = await fetchGiphy(`${GIPHY_BASE}/trending?api_key=${GIPHY_KEY}&limit=24&rating=pg-13`);
    res.json({ gifs: shape(data.data) });
  } catch (err) {
    console.error('[gifs] trending fetch failed (continuing):', err.message);
    res.json({ gifs: [] });
  }
}));

router.get('/search', requireAuth, asyncHandler(async (req, res) => {
  const q = (req.query.q || '').toString().trim().slice(0, 100);
  if (!q) return res.json({ gifs: [] });
  try {
    const data = await fetchGiphy(`${GIPHY_BASE}/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=24&rating=pg-13`);
    res.json({ gifs: shape(data.data) });
  } catch (err) {
    console.error('[gifs] search fetch failed (continuing):', err.message);
    res.json({ gifs: [] });
  }
}));

export default router;
