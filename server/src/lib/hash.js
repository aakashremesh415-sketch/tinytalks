import crypto from 'crypto';

// One-way normalize+hash for identifiers we need to remember for abuse
// prevention (e.g. a banned guest's email) WITHOUT keeping the raw
// identifier around once the account/content it belongs to is purged.
export function hashIdentifier(raw) {
  const normalized = String(raw || '').trim().toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export function randomCode(length = 6) {
  const digits = '0123456789';
  let out = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) out += digits[bytes[i] % 10];
  return out;
}

export function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}
