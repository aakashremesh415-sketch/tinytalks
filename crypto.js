// Client-side end-to-end encryption using tweetnacl (X25519 + XSalsa20-Poly1305,
// i.e. nacl.box). The server only ever stores/relays ciphertext, nonce, and
// public keys — it never has access to plaintext or private keys.
//
// This is a straightforward "asymmetric box per message" scheme: each
// participant has a long-lived X25519 keypair for the session; a sender
// derives a shared secret from (their private key, recipient's public key)
// and encrypts with a fresh random nonce per message. This gives real
// confidentiality between the two participants against the server, but —
// unlike Signal's double ratchet — it does not provide forward secrecy if
// a device's private key is later compromised. Good enough for an MVP;
// worth hardening (key rotation / ratcheting) before high-stakes production
// use, ideally with a security review.

import nacl from 'tweetnacl';
import util from 'tweetnacl-util';

const KEY_STORAGE = 'tt_keypair_v1';

// localStorage (not sessionStorage): the chat sidebar lets people reopen
// old conversations across visits, and decrypting those requires the same
// keypair that was active when the messages were sent. That means the key
// now persists until the user clears site data or switches devices/
// browsers — same trade-off most E2E apps make (Signal, WhatsApp): history
// is only readable from a device that held the key at the time. Nothing
// here is ever sent to the server; only the public half is ever published.
export function loadOrCreateKeyPair() {
  const stored = localStorage.getItem(KEY_STORAGE);
  if (stored) {
    const parsed = JSON.parse(stored);
    return {
      publicKey: util.decodeBase64(parsed.publicKey),
      secretKey: util.decodeBase64(parsed.secretKey),
    };
  }
  const pair = nacl.box.keyPair();
  localStorage.setItem(
    KEY_STORAGE,
    JSON.stringify({
      publicKey: util.encodeBase64(pair.publicKey),
      secretKey: util.encodeBase64(pair.secretKey),
    })
  );
  return pair;
}

export function publicKeyToBase64(publicKey) {
  return util.encodeBase64(publicKey);
}

export function encryptText(plaintext, mySecretKey, theirPublicKeyB64) {
  const theirPublicKey = util.decodeBase64(theirPublicKeyB64);
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const messageUint8 = util.decodeUTF8(plaintext);
  const box = nacl.box(messageUint8, nonce, theirPublicKey, mySecretKey);
  return {
    ciphertext: util.encodeBase64(box),
    nonce: util.encodeBase64(nonce),
  };
}

export function decryptText(ciphertextB64, nonceB64, theirPublicKeyB64, mySecretKey) {
  const ciphertext = util.decodeBase64(ciphertextB64);
  const nonce = util.decodeBase64(nonceB64);
  const theirPublicKey = util.decodeBase64(theirPublicKeyB64);
  const opened = nacl.box.open(ciphertext, nonce, theirPublicKey, mySecretKey);
  if (!opened) return null;
  return util.encodeUTF8(opened);
}

// Encrypts an arbitrary binary blob (used for images before upload).
export function encryptBytes(bytes, mySecretKey, theirPublicKeyB64) {
  const theirPublicKey = util.decodeBase64(theirPublicKeyB64);
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const box = nacl.box(bytes, nonce, theirPublicKey, mySecretKey);
  return { ciphertext: box, nonce: util.encodeBase64(nonce) };
}

export function decryptBytes(ciphertextBytes, nonceB64, theirPublicKeyB64, mySecretKey) {
  const nonce = util.decodeBase64(nonceB64);
  const theirPublicKey = util.decodeBase64(theirPublicKeyB64);
  return nacl.box.open(ciphertextBytes, nonce, theirPublicKey, mySecretKey);
}
