# tinytalks.live

An anonymous, end-to-end encrypted chat platform: guest or verified
accounts, gender-filtered matching, self-destructing image sharing gated
behind ID-free age verification, and a real moderation/ticketing system
for the admin side.

This is a working MVP scaffold, not a polished production deploy. Read
[SAFETY_AND_LIMITATIONS.md](./SAFETY_AND_LIMITATIONS.md) before launching
this anywhere real users can reach it.

## What's here

```
server/   Express + Socket.io + Prisma API
client/   React + Vite + Tailwind frontend
brand/    Logo files and brand guide
docs/     Terms & Conditions (original, not copied from any other site)
```

## Quick start

### 1. Server

```bash
cd server
npm install
cp .env.example .env        # edit values as needed — defaults work for local dev
npx prisma generate
npx prisma migrate dev --name init
npm run dev                 # http://localhost:4000
```

On first boot it creates an admin account from `ADMIN_BOOTSTRAP_EMAIL` /
`ADMIN_BOOTSTRAP_PASSWORD` in `.env` — log in with those, then change the
password (there's no in-app change-password flow yet — update it directly
in the database or add one before relying on this in production).

**A note on `npx prisma generate`:** this downloads a query-engine binary
from `binaries.prisma.sh`. That host was blocked by this sandbox's network
policy while building this, so the Prisma-dependent parts couldn't be
runtime-tested here — everything else (server boot, routing, error
handling, the full client) was. This step needs a normal internet
connection and should just work in your own environment.

**Email OTP** works out of the box with zero setup: with no `SMTP_HOST`
configured, it uses a free Ethereal (nodemailer sandbox) test inbox and
prints a preview link to the server console instead of sending real email.
Set real SMTP credentials in `.env` when you're ready to send actual
emails.

**Age-estimation vendor**: not configured by default, on purpose — see
`server/src/lib/ageEstimation.js`. Until you set
`AGE_ESTIMATION_PROVIDER`/`AGE_ESTIMATION_API_KEY`/`AGE_ESTIMATION_API_URL`
to a real facial age-estimation + liveness vendor (Yoti, Persona, Veriff,
Incode, etc.), image sharing stays disabled for everyone — that's the
intended safe default, not a bug.

### 2. Client

```bash
cd client
npm install
npm run dev                 # http://localhost:5173
```

The dev server proxies `/api` to `http://localhost:4000` (see
`vite.config.js`). For production, build with `npm run build` and serve
`dist/` behind whatever you use for the API (or point it at a deployed
API origin).

## Switching the database to Postgres (e.g. Neon)

The schema (`server/prisma/schema.prisma`) already targets SQLite for a
zero-setup local dev experience. To use Postgres instead:

1. Change the datasource:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. Set `DATABASE_URL` in `.env` to your Postgres connection string (e.g.
   from `neon projects create` / `neon connection-string`, or any other
   Postgres host).
3. Re-run `npx prisma generate && npx prisma migrate dev`.

Nothing else in the app needs to change — all the route code goes through
Prisma, not raw SQL.

## Architecture notes

- **End-to-end encryption**: `tweetnacl`'s `nacl.box` (X25519 +
  XSalsa20-Poly1305). Keys are generated client-side and never leave the
  browser; the server only ever stores/relays ciphertext. This is solid
  for an MVP but doesn't have forward secrecy/key ratcheting like Signal —
  get a security review before treating this as production-grade for
  sensitive use.
- **Matching**: in-memory queue in `server/src/sockets/chat.js`. Fine for
  one server process; move to a shared store (Redis) before running more
  than one instance.
- **Image retention**: see `server/src/jobs/retention.js` — soft-delete
  from chat at 2 days, hard-delete at 7 days unless the user deletes it
  themselves (which is immediate). Admins can access a not-yet-hard-deleted
  image for report review; every access is logged
  (`AdminImageAccessLog`).
- **Ban evasion**: banning writes a hashed identifier to `BanRecord`,
  which is independent of the `User` row it came from — so it survives
  guest-account purges and re-registration attempts.
- **Reliability**: every async Express route is wrapped in
  `asyncHandler` and every async Socket.io handler in `safeHandler` (see
  `server/src/lib/asyncHandler.js` and `server/src/sockets/chat.js`) so a
  single failed request/message can't crash the whole process and drop
  every connected user — verified by smoke-testing a forced error against
  a running instance during development.

## What to do before real users touch this

See [SAFETY_AND_LIMITATIONS.md](./SAFETY_AND_LIMITATIONS.md) for the full
list — the short version: wire up a real age-estimation vendor, have a
lawyer review `docs/TERMS_AND_CONDITIONS.md` and add a Privacy Policy,
add rate limiting beyond OTP, and get the encryption scheme reviewed.
