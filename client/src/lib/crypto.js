// This app used to be end-to-end encrypted client-side (tweetnacl,
// X25519 + XSalsa20-Poly1305 — nacl.box), with the rest of this file
// containing the per-device keypair and encrypt/decrypt helpers that made
// that work. That's been removed: messages are now stored and readable
// directly by the server (see the note on Message.text in
// server/prisma/schema.prisma). All that's left here is the device id
// helper below, which was never part of the encryption scheme itself —
// it's just a stable per-browser identifier used for the X-Device-Id
// header (see api.js) and is unrelated to whether messages are encrypted.

const DEVICE_ID_STORAGE = 'tt_device_id_v1';

// A stable id for this browser, generated once and kept in localStorage.
// Nothing about it is secret; it's just an identifier, sent on every
// request (see api.js).
export function getOrCreateDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_STORAGE);
  if (!id) {
    id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_ID_STORAGE, id);
  }
  return id;
}
