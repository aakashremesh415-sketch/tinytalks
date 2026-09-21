// Client-side random display-name generator — no server round trip needed.
// Deliberately whimsical/anonymous-sounding, never anything identifying.
const ADJECTIVES = [
  'Quiet', 'Silent', 'Curious', 'Bright', 'Gentle', 'Bold', 'Lucky', 'Mellow',
  'Swift', 'Calm', 'Wandering', 'Hidden', 'Cosmic', 'Velvet', 'Amber',
  'Midnight', 'Golden', 'Silver', 'Electric', 'Dreamy', 'Rustic', 'Nimble',
];
const NOUNS = [
  'Falcon', 'River', 'Comet', 'Maple', 'Panther', 'Otter', 'Lantern',
  'Harbor', 'Ember', 'Willow', 'Tiger', 'Nebula', 'Sparrow', 'Canyon',
  'Meadow', 'Orbit', 'Fox', 'Aurora', 'Cedar', 'Wren', 'Cloud', 'Ridge',
];

export function generateRandomName() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 900 + 100); // 100-999
  return `${adj}${noun}${num}`;
}
