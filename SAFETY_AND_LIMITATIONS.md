# Safety design notes and pre-launch checklist

This document exists because tinytalks handles anonymous chat and image
sharing between strangers — a category of product where the safety
architecture matters as much as the feature set. Read this before pointing
real users at a deployment.

## Why image sharing is gated the way it is

tinytalks never collects government ID from anyone, for any reason.
Instead, image sharing (self-destructing photos) is locked behind two
independent checks:

1. **Email OTP** — proves a reachable, real identifier, and gives a
   stable hash to check future accounts against if this identifier is
   ever banned.
2. **Facial age-estimation with liveness detection**, via a third-party
   vendor — proves a real, live person of an estimated age, without ID.

Both are required. Neither is a placeholder for the other. **The
age-estimation piece specifically should not be replaced with a
homegrown/free alternative** — reliable liveness detection (telling a
real face apart from a photo held up to a camera) is a hard biometric ML
problem, and a version without it would look like a safety gate while
providing none of the protection, which is worse than not having the
feature. `server/src/lib/ageEstimation.js` is an adapter you wire a real
vendor into (Yoti, Persona, Veriff, Incode, etc.); until you do, it
runs in "sandbox" mode and always fails closed, so image sharing stays
off for everyone rather than silently open.

## Ban evasion

Guest accounts are ephemeral by design (auto-purged after 2 days), which
would normally make banning meaningless — ban an account, and the same
person just makes a new one. `BanRecord` exists specifically to solve
this: it stores a one-way hash of the email used at verification time,
independent of the `User` row, so it survives account deletion and blocks
re-verification with the same identifier. Keep this in mind if you ever
add new account-creation paths — they should all check against
`BanRecord` before letting verification succeed.

## Retention and moderation, as implemented

- Guest accounts (and everything tied to them) are permanently deleted
  2 days after creation.
- Images are hidden from the chat UI 2 days after upload if the sender
  hasn't deleted them; the underlying file is permanently deleted 7 days
  after upload unless deleted sooner. Deleting an image yourself removes
  it immediately.
- Admins can view a not-yet-hard-deleted image during a report
  investigation; every such access is written to `AdminImageAccessLog`.
  This exists so image access is auditable, not just possible.
- `UNDERAGE_SUSPICION` reports are flagged distinctly in logs
  (`console.warn('[SAFETY] ...')`) — route this to a real alerting
  channel (PagerDuty, Slack webhook, whatever you use) before launch, so
  these don't sit in a normal queue with everything else.

## Before this touches real users

- [ ] Wire a real age-estimation vendor into `ageEstimation.js` and test
      its liveness detection against spoofing attempts (a photo of a
      photo, a video replay) before trusting it.
- [ ] Have a lawyer review `docs/TERMS_AND_CONDITIONS.md` for your
      jurisdiction, and write a full Privacy Policy to go with it.
- [ ] Decide on and implement a real CSAM-reporting pipeline (NCMEC
      CyberTipline API integration in the US, or your jurisdiction's
      equivalent) — the Terms mention this commitment; the code doesn't
      yet automate it.
- [ ] Get the E2E encryption scheme (`client/src/lib/crypto.js`,
      `tweetnacl`'s `nacl.box`) reviewed by someone with applied
      cryptography experience. It's real encryption, not a toy, but it
      lacks forward secrecy/ratcheting, and key management (what happens
      when a user's `sessionStorage` clears, multi-device use, etc.)
      needs a real design pass.
- [ ] The matchmaking queue lives in Postgres (`WaitingQueueEntry`) so it
      already survives across serverless invocations, but the "claim a
      match" step (`routes/queue.js`) isn't a fully serialized
      transaction — under real concurrent load, harden it with a proper
      `SELECT ... FOR UPDATE` or equivalent to close the race window
      described in that file's comments.
- [ ] Add a real password-reset and change-password flow — neither exists
      yet.
- [ ] Rate-limit more than just OTP (matching, message sending, report
      filing) to blunt abuse/spam.
- [ ] Confirm Vercel Blob's access model matches your threat model —
      `lib/storage.js` currently uses `access: 'public'` (an unguessable
      URL, never handed to a client directly — every image/photo is
      fetched server-side by an authenticated route), since that's what
      was available when this was built. If a private/signed-URL mode
      exists on your installed version, prefer it.
- [ ] Load-test the matching/messaging path (`routes/queue.js`,
      `routes/messages.js`) and image upload path before any real traffic
      — Pusher's free tier caps concurrent connections and daily
      messages, so check those limits against expected usage too.
