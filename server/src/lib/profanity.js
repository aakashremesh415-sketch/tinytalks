// Lightweight, dependency-free offensive-name filter for user-TYPED
// display names (signup, and PATCH /me). This is deliberately not a
// general chat-moderation system — reports/blocks already exist for
// behavior — it exists because a display name is the one piece of
// content tinytalks shows to every stranger someone is matched with,
// unmoderated and immediately, so it gets its own gate before it's ever
// saved. Auto-generated names (lib/randomName.js) are drawn from a
// curated wholesome word list and never need to pass through this.
//
// This is intentionally simple: normalize obvious leetspeak substitutions,
// then substring-match against a curated blocklist. Like every lightweight
// word filter, it can have false positives on unusual real words/names
// (the classic "Scunthorpe problem") and false negatives on creative
// evasions — it's a first line of defense, not a guarantee. A rejected
// name just means the person picks another one; nothing else happens.
const BLOCKLIST = [
  // profanity
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'pussy', 'cunt',
  'whore', 'slut', 'twat', 'wanker', 'motherfucker', 'dickhead',
  // slurs / hate speech (kept generic on purpose in these code comments —
  // the list below is what actually gets matched)
  'nigger', 'nigga', 'faggot', 'retarded', 'tranny',
  'chink', 'spic', 'kike', 'gook', 'wetback', 'coon',
  // sexual violence / exploitation / extremism
  'rapist', 'pedophile', 'nazi', 'hitler', 'kkk', 'terrorist',
];

// Common character substitutions used to dodge naive filters (0 -> o, etc).
const SUBSTITUTIONS = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };

function normalize(input) {
  const lowered = String(input).toLowerCase();
  const substituted = lowered.replace(/[013457@$]/g, (ch) => SUBSTITUTIONS[ch] ?? ch);
  return substituted.replace(/[^a-z]/g, ''); // strip spaces/digits/punctuation entirely
}

export function isOffensiveName(input) {
  if (!input) return false;
  const normalized = normalize(input);
  if (!normalized) return false;
  return BLOCKLIST.some((word) => normalized.includes(word));
}
