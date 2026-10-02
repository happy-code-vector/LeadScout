# LeadScout

Finds small local businesses with no website or an outdated one, scores them
by how likely they are to buy a website, and runs outreach in manual or
automatic mode. First market: New York City — extensible to any US city
without code changes.

The complete build spec lives in [`spec.md`](spec.md).

## Stack

- Next.js 15 (App Router) + TypeScript (strict), Tailwind + shadcn/ui
- SQLite + Prisma (`data/leadscout.db` — zero external services)
- Built-in job queue (`Job` table) polled by a worker process
- Nodemailer (SMTP send) + imapflow (reply/bounce polling)
- Zod validation, Vitest tests

## Local setup

```bash
npm i
cp .env.example .env        # then fill ENCRYPTION_KEY + UNSUBSCRIBE_JWT_SECRET
npm run db:migrate          # creates data/leadscout.db
npm run db:seed             # categories, NYC boroughs, templates, settings
npm run dev                 # web UI at http://localhost:3000
npm run worker              # background jobs (separate terminal)
```

Dev secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Modes

- **Live only.** Discovery requires `GOOGLE_PLACES_API_KEY`. Without a key,
  the Discover page and Settings flag it clearly and runs refuse to start —
  no fixture or sample data is ever served at runtime. Billed requests are
  capped by `Settings → Places monthly request cap` (default 1,000/month,
  the free tier); runs stop cleanly with `CAP_REACHED`.
- `fixtures/sites/*.html` exists only for the unit-test suite (`npm test`);
  it is never read by the running app.

## Testing email flows locally

```bash
npm run maildump             # SMTP sink on :1025, inbox JSON on :8025
```

Add a mailbox in **Settings** with SMTP host `localhost`, port `1025`
(any user/password). Sent campaigns land in the sink; watch them at
**/dev/inbox**, where *Send reply* and *Simulate bounce* run the real
reply/bounce handler (the same one IMAP uses in production).

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js app |
| `npm run worker` | Background worker (jobs, outreach ticks, IMAP polling) |
| `npm run maildump` | Local SMTP sink for testing campaigns |
| `npm run db:migrate` | Create/apply Prisma migrations |
| `npm run db:seed` | Seed reference data (idempotent) |
| `npm test` | Vitest unit tests |
| `npm run start:all` | Deploy entrypoint: migrate + seed + web + worker |

## Compliance guardrails (built in)

- No Google Maps HTML scraping — Places API (New) behind a provider interface.
- No mock data at runtime: a missing Places key disables discovery and is
  flagged in the UI rather than papered over with fixtures.
- Phone outreach is never automated — campaigns only create manual call
  tasks (TCPA).
- Every email carries the sender's postal address, a working one-click
  unsubscribe link, and `List-Unsubscribe`/`List-Unsubscribe-Post` headers;
  unsubscribes suppress globally and immediately. Campaigns cannot start
  until sender identity is set.
- Places caching terms: pipeline leads are refreshed through Place Details
  after 30 days; everything else keeps only `placeId`, audit, and score past
  30 days (the retention sweep).

## Deploying

Single-service deployment (web + worker share one SQLite file, so they must
share one machine/volume):

1. **Render (recommended)** — push the repo, then *New → Blueprint* and pick
   this repo; [`render.yaml`](render.yaml) defines the service with a 1 GB
   persistent disk at `/opt/data` and `start:all` as the start command.
   Set `APP_BASE_URL`, `ENCRYPTION_KEY`, `UNSUBSCRIBE_JWT_SECRET`,
   `ROOT_EMAIL` + `ROOT_PASSWORD`, and optionally
   `GOOGLE_PLACES_API_KEY` / `LOB_API_KEY`
   in the dashboard. Migrations and seeding run automatically on boot.
2. **Railway** — create one service from the repo with start command
   `npm run start:all`, attach a volume mounted at `/opt/data`, and set
   `DATABASE_URL="file:/opt/data/leadscout.db"` plus the env vars above.

Auth (deploy-only): set `AUTH_ENABLED=true`, a long `AUTH_SECRET`, and
`ROOT_EMAIL` + `ROOT_PASSWORD` — `start:all` seeds that root account on first
boot (afterward the in-app password always wins and the env values are
ignored). Sign-in is email/password. Anyone can request access at `/signup`;
accounts stay `PENDING` until a root approves them under **Access**
(`/app/admin/users`). Passwords are changed in Settings → Account. The
unsubscribe endpoint (`/u/…`) always stays public. When deploying this
change over an older install, set a fresh `AUTH_SECRET` — it invalidates
any pre-migration sessions, so deleted or still-pending users lose access
immediately.

## Layout

```
src/
  app/          # routes (Dashboard, Discover, Leads, Campaigns, Call Queue,
                # Templates, Categories, Analytics, Settings) + API handlers
  components/   # shadcn/ui + app components
  lib/
    discovery/  # Places client (mock + live), quadtree tiler, budget guard
    audit/      # website classifier, signals, email extraction
    scoring/    # pure scorer, weights, rescore
    outreach/   # engine, sender, imap, replies, unsubscribe, postal
  db/           # Prisma client + seed
  worker/       # worker process + job handlers
scripts/        # maildump (dev sink), start-all (deploy)
data/           # leadscout.db (gitignored), chains.txt, maildump.jsonl (gitignored)
fixtures/       # site HTML fixtures used only by the unit-test suite
prisma/         # schema + migrations
```
