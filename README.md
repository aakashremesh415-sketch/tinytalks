# tinytalks.live

An anonymous, end-to-end encrypted chat platform: guest or verified
accounts, gender-filtered matching, self-destructing image sharing gated
behind ID-free age verification, and a real moderation/ticketing system
for the admin side. Built to deploy on **Vercel**, with **Neon** (Postgres),
**Pusher Channels** (realtime), and **Vercel Blob** (file storage).

This is a working MVP, not a polished production deploy. Read
[SAFETY_AND_LIMITATIONS.md](./SAFETY_AND_LIMITATIONS.md) before launching
this anywhere real users can reach it.

## What's here

```
api/index.js   Vercel serverless function entry point (imports server/src/app.js)
server/        Express app + Prisma schema + all route logic
client/        React + Vite + Tailwind frontend
brand/         Logo files and brand guide
docs/          Terms & Conditions (original, not copied from any other site)
vercel.json    Build, rewrites, and cron config for the whole deploy
```

This is an npm workspaces monorepo — one `npm install` at the repo root
installs both `server/` and `client/`'s dependencies into a single root
`node_modules`, which is what lets `api/index.js` (at the repo root)
import `server/src/app.js` directly without needing its own copy of
Express, Prisma, etc.

## Why this architecture

Vercel serverless functions are stateless and short-lived — they can't
hold a Socket.io connection open, keep a `node-cron` timer running, or
write to local disk and expect the file to still be there on the next
request. So, compared to a plain Node/Express deploy, three things are
different here on purpose:

- **Realtime is Pusher Channels, not Socket.io.** Matching a partner and
  relaying messages both happen as ordinary POST requests
  (`/api/queue/join`, `/api/messages/send`); the server pushes an event to
  Pusher, and Pusher's own infrastructure holds the live connection to
  each browser. See `server/src/lib/pusher.js`.
- **Images and verification photos go to Vercel Blob, not local disk.**
  See `server/src/lib/storage.js` — swap this file if you'd rather use
  S3 or another provider.
- **The retention cron is a Vercel Cron job hitting an API route, not
  `node-cron`.** See `server/src/routes/cron.js` and the `crons` entry in
  `vercel.json`. It runs once a day, which is plenty of precision for
  2-day/7-day retention windows.
- **Prisma connects through Neon's pooled endpoint** (the `-pooler`
  hostname), not a direct connection — see `server/src/db.js`. Neon's
  own connection pooling in front of Postgres is what makes a plain
  `PrismaClient` safe to use from many short-lived serverless
  invocations at once, without needing Prisma's own (still preview,
  as of 5.x) driver-adapter machinery.

## Deploying to Vercel

### 1. Set up Neon (database)

```bash
npm i -g neon@latest
neon login
neon projects create --name tinytalks   # or link an existing project
neon connection-string production --pooled          # → DATABASE_URL
```

### 2. Set up Pusher (realtime)

Create a free app at pusher.com → Channels. Its "App Keys" tab has
`app_id`, `key`, `secret`, and `cluster` — these become
`PUSHER_APP_ID` / `PUSHER_KEY` / `PUSHER_SECRET` / `PUSHER_CLUSTER`, and
`key`/`cluster` again as `VITE_PUSHER_KEY` / `VITE_PUSHER_CLUSTER` for the
client.

### 3. Import the repo into Vercel

In the Vercel dashboard: **Add New → Project**, import this GitHub repo.
Vercel should detect the root `vercel.json` and use its `buildCommand` /
`outputDirectory` / `installCommand` automatically — you don't need to
override the framework preset.

### 4. Attach Vercel Blob storage

Project → **Storage** tab → **Create Database** → **Blob**. This sets
`BLOB_READ_WRITE_TOKEN` on the project automatically.

### 5. Set environment variables

Project → **Settings** → **Environment Variables**:

| Variable | Value |
|---|---|
| `DATABASE_URL` | from Neon, pooled connection string (hostname has `-pooler` in it) |
| `JWT_SECRET` | any long random string |
| `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` | your first admin login |
| `PUSHER_APP_ID` / `PUSHER_KEY` / `PUSHER_SECRET` / `PUSHER_CLUSTER` | from Pusher |
| `VITE_PUSHER_KEY` / `VITE_PUSHER_CLUSTER` | same key/cluster, exposed to the client build |
| `CRON_SECRET` | any long random string (Vercel sends it back automatically when calling the cron route) |
| `CLIENT_ORIGIN` | your deployed URL, e.g. `https://tinytalks.live` |
| `SMTP_*` | optional — see below |
| `AGE_ESTIMATION_*` | optional — see below |

`BLOB_READ_WRITE_TOKEN` is already set from step 4; you don't add it
manually.

### 6. Run the migration once

Locally (or in Codespaces), with `DATABASE_URL` pointing at the same
Neon database Vercel uses:

```bash
npm install
npm run prisma:migrate
```

This needs real internet access to `binaries.prisma.sh` for Prisma's
engine download — that's normal Prisma behavior, not specific to this
project.

### 7. Deploy

Push to the branch Vercel is watching (or click **Deploy** in the
dashboard). Vercel runs `npm install` → `npm run prisma:generate && npm
run build:client` → serves `client/dist` as the static site and
`api/index.js` as the API, with the cron job registered from
`vercel.json`.

## Local development (unchanged from before)

```bash
npm install                 # once, from the repo root — installs both workspaces
cd server && cp .env.example .env   # fill in Neon/Pusher/Blob values
npm run dev --workspace server      # http://localhost:4000

cd client && cp .env.example .env   # fill in VITE_PUSHER_KEY/CLUSTER
npm run dev --workspace client      # http://localhost:5173
```

The Vite dev server proxies `/api` straight through to `localhost:4000`
(no path rewriting — see `client/vite.config.js`), matching how the
`/api` prefix works in production.

**Email OTP** works with zero setup: with no `SMTP_HOST` configured, it
uses a free Ethereal (nodemailer sandbox) test inbox and prints a preview
link to the server console. Set real SMTP credentials when ready.

**Age-estimation vendor**: not configured by default, on purpose — see
`server/src/lib/ageEstimation.js`. Until you set
`AGE_ESTIMATION_PROVIDER`/`AGE_ESTIMATION_API_KEY`/`AGE_ESTIMATION_API_URL`
to a real facial age-estimation + liveness vendor (Yoti, Persona, Veriff,
Incode, etc.), image sharing stays disabled for everyone — that's the
intended safe default, not a bug.

## Known limits worth knowing about

- **Vercel function payload size**: serverless functions on Vercel cap
  request bodies (historically ~4.5MB). The image upload limit in
  `routes/images.js` is set to 15MB to match the original design intent,
  but you may need to raise Vercel's own limit (or lower the app's) to
  match your plan — check current Vercel docs for the exact figure on
  your plan.
- **Matching race condition**: `routes/queue.js` claims a waiting match
  with a delete-then-check pattern rather than a full serialized
  transaction — see the comment there. Fine for an MVP; worth hardening
  under real concurrent load.
- **Vercel Cron granularity**: the Hobby plan may restrict cron frequency;
  daily is what's configured and is enough for day-scale retention
  windows. Check your plan's current limits if you want a tighter cron.

## Architecture notes carried over from the original design

- **End-to-end encryption**: `tweetnacl`'s `nacl.box` (X25519 +
  XSalsa20-Poly1305), keys generated client-side and never sent to the
  server. Solid for an MVP; no forward secrecy/key ratcheting like
  Signal — get a security review before treating this as production-grade
  for sensitive use.
- **Image retention**: soft-delete from chat at 2 days, hard-delete at 7
  days unless the user deletes it themselves (immediate). Admins can
  access a not-yet-hard-deleted image for report review; every access is
  logged (`AdminImageAccessLog`).
- **Ban evasion**: banning writes a hashed identifier to `BanRecord`,
  independent of the `User` row, so it survives guest-account purges and
  re-registration attempts.
- **Reliability**: every async Express route is wrapped in
  `asyncHandler` (`server/src/lib/asyncHandler.js`) so a single failed
  request can't crash the whole function.

See [SAFETY_AND_LIMITATIONS.md](./SAFETY_AND_LIMITATIONS.md) for the full
pre-launch checklist.
