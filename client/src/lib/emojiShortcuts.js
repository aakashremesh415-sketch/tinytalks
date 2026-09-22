// Converts familiar text shortcuts — classic emoticons (":)", "<3") and
// Slack/Discord-style ":shortcode:" tokens — into real emoji as the person
// types, the way most chat apps do. Purely a client-side text transform: the
// server only ever sees (and encrypts) whatever the final string is, so this
// has no effect on the E2E encryption layer.
const SHORTCUTS = {
  // Longer/more specific emoticons first so they never get shadowed by a
  // shorter one that happens to be a prefix (handled by sorting below too).
  ":'-(": '😢',
  ":'(": '😢',
  '>:(': '😠',
  ':-)': '🙂',
  ':-D': '😄',
  ':-(': '😢',
  ';-)': '😉',
  ':-P': '😛',
  ':-p': '😛',
  ':-O': '😮',
  ':-/': '😕',
  ':-*': '😘',
  'B-)': '😎',
  ':)': '🙂',
  ':D': '😄',
  ':(': '😢',
  ';)': '😉',
  ':P': '😛',
  ':p': '😛',
  ':O': '😮',
  ':o': '😮',
  ':/': '😕',
  ':*': '😘',
  'B)': '😎',
  'xD': '😆',
  'XD': '😆',
  '<3': '❤️',
  '</3': '💔',

  // :shortcode: style — always unambiguous since both colons must be typed.
  ':thumbsup:': '👍',
  ':+1:': '👍',
  ':thumbsdown:': '👎',
  ':-1:': '👎',
  ':smile:': '😄',
  ':smiley:': '😃',
  ':grin:': '😁',
  ':laughing:': '😆',
  ':joy:': '😂',
  ':rofl:': '🤣',
  ':wink:': '😉',
  ':blush:': '😊',
  ':slight_smile:': '🙂',
  ':heart:': '❤️',
  ':heart_eyes:': '😍',
  ':kiss:': '😘',
  ':cry:': '😢',
  ':sob:': '😭',
  ':sad:': '😞',
  ':angry:': '😠',
  ':rage:': '😡',
  ':thinking:': '🤔',
  ':shrug:': '🤷',
  ':facepalm:': '🤦',
  ':clap:': '👏',
  ':pray:': '🙏',
  ':wave:': '👋',
  ':fire:': '🔥',
  ':100:': '💯',
  ':tada:': '🎉',
  ':party:': '🥳',
  ':rocket:': '🚀',
  ':eyes:': '👀',
  ':ok_hand:': '👌',
  ':ok:': '👌',
  ':cool:': '😎',
  ':sunglasses:': '😎',
  ':star:': '⭐',
  ':check:': '✅',
  ':x:': '❌',
  ':poop:': '💩',
  ':skull:': '💀',
  ':ghost:': '👻',
  ':pizza:': '🍕',
  ':coffee:': '☕',
  ':beer:': '🍺',
  ':cake:': '🎂',
  ':gift:': '🎁',
  ':sun:': '☀️',
  ':moon:': '🌙',
};

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Sorted longest-key-first so e.g. ":-(" is tried before ":(" and never
// gets shadowed by the shorter alternation branch matching first.
const ENTRIES = Object.entries(SHORTCUTS).sort((a, b) => b[0].length - a[0].length);
const PATTERN = new RegExp(ENTRIES.map(([key]) => escapeRegex(key)).join('|'), 'g');
const LOOKUP = new Map(ENTRIES);

export function applyEmojiShortcuts(text) {
  if (!text) return text;
  return text.replace(PATTERN, (match) => LOOKUP.get(match) || match);
}
