// Shared normalization for user-supplied location tags (town/district/
// state, self-reported — never derived from IP or GPS). Keeps them small
// and consistent wherever they're written: profile updates, and the
// denormalized copy stored on WaitingQueueEntry for matching.
export function normalizeTags(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const tag = raw.trim().toLowerCase().slice(0, 40);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= 8) break;
  }
  return out;
}
