# LeadScout

Finds small local businesses with no website or an outdated one, scores them
by how likely they are to buy a website, and runs outreach in manual or
automatic mode. First market: New York City — extensible to any US city
without code changes.

The complete build spec lives in [`spec.md`](spec.md).

## Stack

- Next.js 15 (App Router) + TypeScript, Tailwind + shadcn/ui
- SQLite + Prisma (`data/leadscout.db` — zero external services)
- Built-in job queue (`Job` table) polled by a worker process
- Nodemailer (SMTP) + imapflow (replies/bounces), Handlebars templates
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

Dev secrets, e.g.:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Modes

- **Mock mode** (default): with no `GOOGLE_PLACES_API_KEY`, discovery serves
  fixture data from `fixtures/places/*.json` — the whole app works end to end
  with no paid keys.
- **Live mode**: set `GOOGLE_PLACES_API_KEY`. Billed requests are capped by
  `Settings.placesMonthlyRequestCap` (default 1,000/month, the free tier).

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js app |
| `npm run worker` | Background worker (jobs, schedulers) |
| `npm run db:migrate` | Create/apply Prisma migrations |
| `npm run db:seed` | Seed reference data (idempotent) |
| `npm test` | Vitest unit tests |

## Layout

```
src/
  app/          # routes (Dashboard, Discover, Leads, Campaigns, ...)
  components/   # shadcn/ui + app components
  lib/          # domain logic: discovery/, audit/, scoring/, outreach/
  db/           # Prisma client + seed
  worker/       # worker process + job handlers
data/           # leadscout.db (gitignored), chains.txt
prisma/         # schema + migrations
```
