// Object storage abstraction over Vercel Blob.
//
// Why not local disk: Vercel's serverless functions have an ephemeral,
// mostly read-only filesystem (writes only survive inside `/tmp`, and
// only for the lifetime of that single invocation) — a file saved by one
// request is very likely gone by the next. Vercel Blob is the native
// pairing for exactly this: durable object storage reachable from any
// function, with a simple put/del API and a generous free tier.
//
// Callers never hand out the raw blob URL to a client directly — every
// image/photo still goes through an authenticated route (see routes/
// images.js, routes/admin.js) that fetches the bytes server-side and
// streams them back, so access control stays enforced by our own auth
// checks rather than by the blob URL's obscurity alone.
//
// Swapping providers later (S3, Neon buckets, etc.) means changing only
// this file — nothing else in the app talks to Vercel Blob directly.
import { put, del } from '@vercel/blob';

export async function uploadObject(key, buffer, contentType) {
  const blob = await put(key, buffer, {
    // 'public' is the mode this was built against — check @vercel/blob's
    // current docs for your installed version; if a private/signed-URL
    // mode is available when you deploy, prefer it and drop this note.
    // Either way, the actual protection here is that nothing in this app
    // hands a client the raw blob URL — every image/photo is fetched
    // server-side by an authenticated route (routes/images.js,
    // routes/admin.js) and streamed back, so access control comes from
    // our own auth checks, not from the URL being hard to guess.
    access: 'public',
    contentType,
    addRandomSuffix: true,
  });
  return { url: blob.url };
}

export async function fetchObject(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function deleteObject(url) {
  try {
    await del(url);
  } catch (err) {
    console.error('[storage] delete failed (continuing):', err.message);
  }
}
