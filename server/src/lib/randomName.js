// Server-side random display-name generator, used to auto-assign a name
// at account creation (guest signup, and as a fallback for any account
// that somehow still has none) so nobody ever appears to a stranger as a
// bare "Anonymous". Mirrors client/src/lib/randomName.js (used there for
// the instant-reroll 🎲 button in Signup/Settings) so the vocabulary and
// style match everywhere the name can be generated. Every word here is
// deliberately wholesome/mood-or-nature-themed — never anything that
// could combine into something offensive, so generated names never need
// to go through lib/profanity.js the way user-TYPED names do.
const ADJECTIVES = [
  'Quiet', 'Silent', 'Curious', 'Bright', 'Gentle', 'Bold', 'Lucky', 'Mellow',
  'Swift', 'Calm', 'Wandering', 'Hidden', 'Cosmic', 'Velvet', 'Amber',
  'Midnight', 'Golden', 'Silver', 'Electric', 'Dreamy', 'Rustic', 'Nimble',
  'Breezy', 'Sunny', 'Misty', 'Frosty', 'Chill', 'Witty', 'Jolly', 'Merry',
];
const NOUNS = [
  'Falcon', 'River', 'Comet', 'Maple', 'Panther', 'Otter', 'Lantern',
  'Harbor', 'Ember', 'Willow', 'Tiger', 'Nebula', 'Sparrow', 'Canyon',
  'Meadow', 'Orbit', 'Fox', 'Aurora', 'Cedar', 'Wren', 'Cloud', 'Ridge',
  'Dune', 'Reef', 'Pebble', 'Lagoon', 'Summit', 'Grove', 'Brook', 'Voyager',
];

export function generateRandomName() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 900 + 100); // 100-999
  return `${adj}${noun}${num}`;
}
