// Local-only cache of plaintext for messages *you* sent. The server never
// stores plaintext, and nacl.box's shared secret needs the recipient's
// public key to decrypt your own outgoing ciphertext — which isn't the
// value stored per-message (that's the sender's key, for the recipient's
// benefit). So re-viewing your own old messages from the chat history
// sidebar depends on this local echo, keyed by the real message id the
// server assigns. If you sent a message from a different device/browser,
// it won't be in this cache there — history shows a plain fallback label
// instead of pretending to decrypt something it can't.
const KEY = 'tt_sent_cache_v1';
const MAX_ENTRIES = 500;

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export function cacheSentPlaintext(messageId, plaintext) {
  try {
    const cache = readCache();
    cache[messageId] = plaintext;
    const keys = Object.keys(cache);
    if (keys.length > MAX_ENTRIES) {
      keys.slice(0, keys.length - MAX_ENTRIES).forEach((k) => delete cache[k]);
    }
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Best-effort convenience cache — ignore quota errors etc.
  }
}

export function getCachedSentPlaintext(messageId) {
  return readCache()[messageId] || null;
}
