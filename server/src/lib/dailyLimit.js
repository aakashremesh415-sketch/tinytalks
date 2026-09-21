// Rolling 24h counter for rate-limited profile edits (display name,
// avatar) — the common "N changes left today" pattern. Not tied to
// calendar midnight on purpose: simpler, and avoids a burst right at UTC
// rollover.
const WINDOW_MS = 24 * 60 * 60 * 1000;

function isExpired(windowStart) {
  return !windowStart || Date.now() - new Date(windowStart).getTime() > WINDOW_MS;
}

// Call when actually applying a change. Returns whether it's allowed, how
// many are left after this one, and the { count, windowStart } patch to
// persist alongside the rest of the update.
export function checkDailyLimit(count, windowStart, limit) {
  const current = isExpired(windowStart) ? 0 : count;
  if (current >= limit) {
    return { allowed: false, remaining: 0, patch: null };
  }
  return {
    allowed: true,
    remaining: limit - current - 1,
    patch: isExpired(windowStart) ? { count: 1, windowStart: new Date() } : { count: current + 1, windowStart },
  };
}

// Read-only: how many changes are left right now, for display (e.g. on
// GET /me), without consuming one.
export function remainingToday(count, windowStart, limit) {
  return isExpired(windowStart) ? limit : Math.max(0, limit - count);
}
