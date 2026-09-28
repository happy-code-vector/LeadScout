# LeadScout: build spec

A web app that finds small local businesses with no website or an outdated one, scores them by how likely they are to buy a website, and runs outreach in either manual or automatic mode. The owner builds the websites personally. The first market is New York City, and the design must extend to any US city without code changes.

This file is the source of truth. Build phase by phase (see "Build phases"). Stop at the end of each phase, run its acceptance checks, and report results before continuing.

---

## Stack

- Next.js 15 (App Router) + TypeScript (strict), Tailwind + shadcn/ui
- SQLite + Prisma (a single `data/leadscout.db` file — zero external services)
- Background jobs: a built-in queue — a `Job` table polled by a separate worker process (`npm run worker`); idempotent jobs, retried with backoff
- Website audits: `undici` fetch + `cheerio` (no headless browser by default); Playwright is optional, only for screenshots
- Email: Nodemailer (SMTP send) + `imapflow` (reply and bounce detection)
- Postal mail (optional): Lob API
- Validation: Zod. Tests: Vitest.
- Local dev: `npm run dev` + `npm run worker`; no Docker, no external services. Deploy target: Railway or Render (web + worker sharing a persistent volume that holds the SQLite file).

## Hard rules

1. Do not scrape Google Maps HTML. Its selectors change constantly and scraping breaks Google's terms. Discovery uses the Google Places API (New) behind a `DiscoveryProvider` interface, so another provider can be added later.
2. Mock mode is required. If `GOOGLE_PLACES_API_KEY` is unset, the Places client serves fixture data from `fixtures/places/*.json`. The whole app must be usable end to end with no paid keys.
3. Phone outreach is never automated. There are no auto-dialed calls, no prerecorded messages, and no automated SMS to scraped numbers, because US TCPA rules restrict them. The phone channel creates call tasks that the owner dials manually from the Call Queue.
4. Every email follows CAN-SPAM:
   - The sender's physical postal address appears in the footer.
   - Every email has a working one-click unsubscribe link and a `List-Unsubscribe` + `List-Unsubscribe-Post` header.
   - Unsubscribes are honored immediately through a global suppression list.
   - Subject lines are not deceptive.
   - A campaign cannot start until the sender name and postal address are set in Settings.
5. Respect Google Maps Platform caching terms, and keep refresh costs low:
   - Store `place_id` indefinitely.
   - Refresh Places-sourced fields, including coordinates, through Place Details (Enterprise: 1,000 free per month, then $20 per 1,000) only for businesses whose lead status is between `QUEUED` and `PROPOSAL`, when their data is older than 30 days.
   - For every other business, clear the Places-sourced fields after 30 days and keep only `placeId`, the audit, and the score. The next discovery run refills them.
6. All secrets come from env vars. Never commit `.env`.
7. Scoring weights, category propensities, rate limits, and templates live in the database and can be edited in the UI. Do not hardcode them.

---

## Data model (Prisma)

- **Category**
  - `id`, `slug`, `name`
  - `textQuery` (e.g. "plumber"), `includedType` (a Google place type, nullable; verify each against Google's Places types table)
  - `propensity` (0–10), `active`, `createdAt`
- **Area**
  - `id`, `name`, `city`, `state`
  - `bbox` (south, west, north, east), `parentId` (nullable)
  - Seed the 5 NYC boroughs. Any US city can be added from the UI.
- **DiscoveryRun**
  - `id`, `categoryIds[]`, `areaIds[]`, `status`
  - `requestsUsed`, `placesFound`, `newPlaces`, `startedAt`, `finishedAt`, `error`
- **Business**
  - `id`, `placeId` (unique), `name`, `categoryId`
  - `address`, `borough`/`city`, `state`, `zip`, `lat`, `lng`
  - `phone`, `websiteUri`, `googleMapsUri`, `rating`, `reviewCount`, `businessStatus`, `primaryType`
  - `placesFetchedAt`, `isChain`, `createdAt`
- **WebsiteAudit**
  - `businessId`, `checkedAt`, `finalUrl`, `httpStatus`, `websiteClass`
    - `websiteClass` is one of: `NONE`, `SOCIAL_OR_DIRECTORY`, `DEAD`, `PARKED`, `OUTDATED`, `OK`
  - Signals: `copyrightYear`, `hasViewport`, `httpsOk`, `sitemapLastMod`, `waybackLastChange`, `hasContactPath`, `platform`
  - `findings[]`: human-readable, e.g. "Not mobile-friendly", "Copyright 2017"
  - `emailsFound[]`
- **Contact**
  - `businessId`, `type` (`EMAIL` | `PHONE` | `POSTAL`), `value`
  - `source` (`places` | `website` | `manual`), `verified`
- **Score**
  - `businessId`, `total`, `tier` (A/B/C/D)
  - `need`, `viability`, `reachability`, `categoryFit`, `reasons[]`, `computedAt`
- **Lead**
  - `businessId` (unique), `status`, `notes`, `lastActivityAt`
  - `status` is one of: `NEW`, `QUEUED`, `CONTACTED`, `REPLIED`, `MEETING`, `PROPOSAL`, `WON`, `LOST`, `DO_NOT_CONTACT`
- **Campaign**
  - `id`, `name`, `mode` (`MANUAL` | `AUTO`)
  - `channelOrder[]` (default `[EMAIL, POSTAL, PHONE]`)
  - `filters` (json: tiers, categories, areas, website classes)
  - `sequenceId`, `mailboxId`, `dailyLimit`, `sendWindow` (e.g. 9:00–16:00 recipient local, weekdays), `status`
- **Sequence**, **SequenceStep**
  - Step fields: `order`, `channel`, `delayDays`, `templateId`
- **Template**
  - `id`, `name`, `channel`, `subject`, `body` (Handlebars)
  - `variant` label, used for A/B tests
- **Mailbox**
  - SMTP/IMAP host, port, and user, with an encrypted password (AES-256-GCM, key from `ENCRYPTION_KEY`)
  - `dailyLimit`, `warmupStartDate`
- **OutreachEvent**
  - `leadId`, `campaignId`, `channel`, `templateId`, `status`, `messageId`, `occurredAt`, `meta`
  - `status` is one of: `SCHEDULED`, `SENT`, `BOUNCED`, `REPLIED`, `UNSUBSCRIBED`, `FAILED`
- **CallTask**
  - `leadId`, `campaignId`, `dueAt`, `script`, `outcome`, `notes`
  - `outcome` is one of: `NO_ANSWER`, `VOICEMAIL`, `INTERESTED`, `NOT_INTERESTED`, `CALL_BACK`, `DO_NOT_CALL`
- **Suppression**: `value` (email / phone / placeId), `reason`, `createdAt`
- **Settings** (single row)
  - `senderName`, `senderPostalAddress`, `scoringWeights` (json)
  - `placesMonthlyRequestCap` (default 1000, which keeps usage in the free tier), `auditConcurrency`
- **ApiUsage**: `month`, `sku`, `count`, with a unique index on `(month, sku)`
- **Job**: `type`, `payload` (JSON string), `status` (`PENDING` | `RUNNING` | `DONE` | `FAILED`), `runAt`, `attempts`, `maxAttempts`, `lastError`

SQLite has no enum, array, or json column types, so those fields are stored as text. `src/lib/domain.ts` is the single source of truth for the allowed values (Zod-validated) and for the JSON encode/decode helpers.

---

## Pipeline

### 1. Discovery (Places API, New)

- Endpoint: `POST https://places.googleapis.com/v1/places:searchText`
- Send `X-Goog-Api-Key` and `X-Goog-FieldMask` with exactly these fields:
  `places.id,places.displayName,places.formattedAddress,places.addressComponents,places.location,places.types,places.primaryType,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.businessStatus,places.googleMapsUri,nextPageToken`
- Request only these fields, because the field mask sets the price tier.
- Body: `textQuery` (the category's textQuery), `includedType` when set, `pageSize: 20`, and a `locationRestriction.rectangle` equal to the tile's bounding box.
- Text Search caps results at 60 per query (3 pages). To cover a whole borough, use quadtree tiling, split into two passes so that no money is spent on tiles that turn out to be saturated:
  - Probe pass (free):
    - Run the same query with field mask `places.id,nextPageToken` only. This bills as "Text Search Essentials (IDs Only)", which has unlimited free usage.
    - If a tile returns 60 IDs, it is saturated. Split it into 4 subtiles and recurse, with a minimum tile size of about 300 m.
    - Otherwise, the tile is a leaf.
  - Fetch pass (billed):
    - Run the full Enterprise field mask only on leaf tiles.
    - Skip a leaf tile entirely when every probed ID is already in the database with `placesFetchedAt` under 30 days old.
- Billing: the full field mask bills as "Text Search Enterprise". Each request returns up to 20 places. The first 1,000 requests each month are free, then $35 per 1,000.
- Upsert by `placeId`. Skip anything with `businessStatus != OPERATIONAL`.
- Budget guard:
  - Count billed requests per calendar month in a `ApiUsage` table (`month`, `sku`, `count`).
  - Before each billed request, check that `count < placesMonthlyRequestCap`. Stop the run cleanly with status `CAP_REACHED` when the cap is reached.
  - The Discover page shows requests used, the cap, and estimated spend: `max(0, used − 1000) × $0.035`.
- Chain detection: set `isChain` when the same normalized name appears at 3 or more places, or matches `data/chains.txt` (seed it with common national brands).

### 2. Enrichment (website audit)

Classify `websiteUri` into `websiteClass`:

- `NONE`: no `websiteUri`.
- `SOCIAL_OR_DIRECTORY`: the host is facebook.com, instagram.com, yelp.com, linktr.ee, nextdoor.com, business.site, sites.google.com, or similar. business.site pages were shut down by Google in 2024, so these listings effectively have no website.
- `DEAD`: DNS failure, connection error, a 4xx/5xx response, or an invalid TLS certificate with no HTTP fallback.
- `PARKED`: the page matches parked-domain or for-sale patterns (GoDaddy, Sedo, "this domain is for sale", etc.).
- `OUTDATED` or `OK`: decided by the following signals:
  - `copyrightYear`: the highest 4-digit year near "©" or "copyright".
  - `hasViewport`: whether a `<meta name="viewport">` tag exists.
  - `httpsOk`: whether HTTPS works.
  - `sitemapLastMod`: the latest `lastmod` in `/sitemap.xml`.
  - `waybackLastChange`: from the Wayback CDX API (`collapse=digest`, most recent capture where the content changed).
  - `hasContactPath`: whether a contact form, a `tel:` link, or a `mailto:` link exists.
  - `platform`: a guess from generator meta and asset paths.
  - Mark `OUTDATED` when the outdated-signal points below reach 15 or more.

Email extraction:

- Take `mailto:` links and address regex matches from the homepage and from `/contact`, `/contact-us`, and `/about`.
- Drop image filenames and addresses that belong to the website builder's platform domain.
- Do not guess address patterns. Guessed addresses bounce and damage the sending domain.

Concurrency and politeness:

- Run up to `auditConcurrency` audits at once (default 8), with a 10 s timeout per request.
- Respect robots.txt for pages beyond the homepage.
- Re-audit every 90 days.

### 3. Scoring: the definition of a high-probability prospect

`total = need (0–50) + viability (0–25) + reachability (0–15) + categoryFit (0–10)`. Every input is a field the pipeline actually collects.

**Exclusions** (no score; excluded from campaigns):
- Not operational
- `isChain`
- On the suppression list
- Lead status is `DO_NOT_CONTACT`

**Need (0–50).** How badly the business needs a website:

| Website class | Points |
|---|---|
| `NONE` | 50 |
| `SOCIAL_OR_DIRECTORY`, `DEAD`, `PARKED` | 45 |
| `OUTDATED` / `OK` | Sum of the outdated signals below, capped at 40 |

Outdated signals:

| Signal | Points |
|---|---|
| Copyright year ≤ current year − 3 | +15 |
| No viewport meta tag | +10 |
| Sitemap or Wayback shows the last change was more than 24 months ago | +10 |
| No working HTTPS | +8 |
| No contact path | +5 |

**Viability (0–25).** Whether the business is active and can pay, using review count as a proxy for an established, busy business:

| Reviews | Points |
|---|---|
| 0 | 4 |
| 1–9 | 12 |
| 10–49 | 20 |
| 50–199 | 25 |
| 200+ | 18 (often already has an agency) |

- Rating of 4.0 or higher: +0 (keep the neutral value).
- Rating below 3.0: −5.

**Reachability (0–15).** Verified email 8, phone 6, postal address 1. Cap the total at 15.

**Category fit (0–10).** The category's `propensity` value.

**Tiers:**

| Tier | Total | Meaning |
|---|---|---|
| A | 75+ | Contact first |
| B | 60–74 | Good prospect |
| C | 45–59 | Only when A/B are exhausted |
| D | below 45 | Hidden by default |

`reasons[]` contains plain-English strings shown in the UI, for example: "No website", "Site not mobile-friendly, copyright 2018", "38 Google reviews, active business", "Email found on site".

All point values live in `Settings.scoringWeights`. Rescore everything whenever the weights change.

**Calibration.** The Analytics page shows reply rate and win rate by tier, by category, and by website class, so the weights can be tuned from real outcomes.

### 4. Outreach

**Manual mode.** A campaign selects leads by filters and produces:
- A lead list in the UI
- A CSV export with every contact field and the score reasons
- A printable call sheet

Nothing is sent. The owner logs activity by hand.

**Auto mode.** For each lead in a running campaign:

1. Walk `channelOrder` and start with the first channel whose data exists:
   - `EMAIL` needs a verified or website-sourced email that is not suppressed.
   - `POSTAL` needs an address and a configured `LOB_API_KEY`.
   - `PHONE` needs a phone number.
2. Run that channel's sequence steps. Default sequence:
   - Email on day 0
   - Follow-up email on day 4
   - Final email on day 9
3. If there is still no reply, fall through to the next available channel:
   - Postal: a postcard, if enabled.
   - Phone: create a `CallTask` due on the next business day, with the call script template rendered.
4. Stop all remaining steps immediately on any of: reply, bounce, unsubscribe, a call outcome of `NOT_INTERESTED` or `DO_NOT_CALL`, or a manual status change.
   - `DO_NOT_CALL` also writes the phone number to the suppression list.
5. Most businesses with no website have no email, so in practice they go straight to postal or phone. This is expected behavior, not an error.

**Sending rules:**
- Send only inside `sendWindow`, in America/New_York for NYC. For other areas, derive the timezone from the area's state.
- Space sends 2–6 minutes apart, with randomized jitter.
- Per mailbox, send at most `min(dailyLimit, warmup ramp)`. The warmup ramp starts at 10/day and adds 5/day up to `dailyLimit` (default 40).
- The campaign `dailyLimit` also applies.
- Never contact the same `placeId` from two campaigns within 30 days.

**Templates:**
- Handlebars variables: `businessName`, `category`, `neighborhood`, `reviewCount`, `rating`, `topFinding` (the first audit finding, e.g. "your site doesn't display well on phones"), `senderName`, `unsubscribeUrl`, `senderPostalAddress`.
- The template editor shows a live preview against a real lead.
- Seed these templates:
  - `No website`, a 3-step email sequence
  - `Outdated website`, a 3-step email sequence that references `topFinding`
  - `Postcard`, front and back
  - `Call script`, with an opener, a reason for the call (tailored to the website class), 3 discovery questions, a close (book a 15-min call), and objection handling for "too expensive", "I get enough work from referrals", and "send me info"
- Templates carry a `variant` label so they can be A/B tested. Analytics reports reply rate per variant.

**Reply and bounce tracking:**
- Poll IMAP every 5 minutes for each mailbox.
- Match replies to sent messages by `In-Reply-To`/`References` → `messageId`. On a match, set lead status `REPLIED`, stop the sequence, and show the lead in the Dashboard inbox.
- Detect bounces from DSN messages. On a bounce, mark the email unverified and add it to the suppression list.

**Unsubscribe endpoint:**
- `GET` and `POST /u/[token]`, where the token is a signed JWT carrying the leadId and email.
- It adds the address to the suppression list and returns a plain confirmation page. It needs no login.

---

## UI pages

1. **Dashboard**:
   - Leads by tier
   - Emails sent today against the limit
   - Call tasks due today
   - New replies
   - Pipeline funnel
2. **Discover**:
   - Category multi-select and area multi-select (with "Add city" to create an Area from a name + bbox)
   - Estimated request count before starting
   - Run button, with live progress for requests used, places found, and new places
3. **Leads**:
   - Server-paginated table: name, category, area, website class badge, score + tier, top reason, contact icons, and status
   - Filters for every one of those columns
   - Bulk actions: add to campaign, set status, export CSV, mark do-not-contact
4. **Lead detail**:
   - Business data with a Google Maps link and a website link
   - Audit findings
   - Score breakdown bars with reasons
   - Contact list, where contacts can be added manually
   - Activity timeline and notes
   - Status pipeline control
5. **Campaigns**:
   - Create or edit: mode, filters (with a live count of matching leads), channel order (drag to reorder), sequence, mailbox, limits, and send window
   - Start, pause, and stop controls
   - Per-campaign stats
6. **Call Queue**:
   - Today's tasks, each with a `tel:` click-to-call link, the rendered script, one-click outcome buttons, and notes
7. **Templates**:
   - CRUD with live preview and variant labels
8. **Categories**:
   - CRUD: name, textQuery, includedType, propensity, active
   - Seed 15 categories:

   | Category | Propensity |
   |---|---|
   | Plumber | 9 |
   | Electrician | 9 |
   | HVAC contractor | 9 |
   | Roofing contractor | 9 |
   | General contractor | 8 |
   | Painter | 8 |
   | Locksmith | 8 |
   | Landscaper | 8 |
   | Cleaning service | 8 |
   | Auto repair | 8 |
   | Moving company | 7 |
   | Hair salon / barber | 6 |
   | Nail salon | 6 |
   | Florist | 6 |
   | Restaurant | 5 |

9. **Analytics**:
   - Reply, meeting, and win rates by tier, category, website class, and template variant
   - Places API requests used this month against the cap
10. **Settings**:
    - Sender identity and postal address (required before any campaign starts)
    - Mailboxes, with a "Send test email" button
    - Scoring weights, with a "Rescore all" button
    - Places request cap and audit concurrency
    - Connection status for Places, SMTP/IMAP, and Lob

There is no auth in phase 1 (single user, local). Before deploying, add Auth.js with an email magic link.

---

## Environment variables (`.env.example`)

```
DATABASE_URL="file:../data/leadscout.db"
GOOGLE_PLACES_API_KEY=            # empty = mock mode
LOB_API_KEY=                      # optional; empty disables postal channel
ENCRYPTION_KEY=                   # 32-byte base64, for mailbox passwords
UNSUBSCRIBE_JWT_SECRET=
APP_BASE_URL=http://localhost:3000
```

Mailbox credentials are entered in the UI, not in env vars.

---

## Build phases (stop and verify after each)

1. **Scaffold.**
   - Build: Next.js app, Prisma schema, seed script (categories, NYC boroughs, templates, default settings), app shell with navigation.
   - Accept when: `npm i && npm run db:migrate && npm run db:seed && npm run dev` works and every page renders.
2. **Discovery.**
   - Build: Places client with mock mode, quadtree tiler, worker jobs, chain detection, Discover page.
   - Accept when: a mock run of Plumber × Brooklyn populates businesses, and unit tests pass for the tiler's subdivision logic and the request cap.
3. **Enrichment.**
   - Build: website classifier, audit signals, email extraction, re-audit schedule.
   - Accept when: tests pass against HTML fixtures, with one fixture per website class.
4. **Scoring + Leads UI.**
   - Build: scoring module (pure function, 100% unit-tested), rescore job, Leads table, Lead detail.
   - Accept when: the tier distribution appears on the Dashboard and the score reasons read naturally.
5. **Outreach.**
   - Build: templates, sequences, campaigns (manual and auto), mailbox sender with warmup and limits, suppression, unsubscribe endpoint, Call Queue, CSV export.
   - Accept when: an auto campaign against the dev SMTP sink (an in-repo `npm run maildump` server with an inbox page) sends in-window, respects limits, and stops on unsubscribe.
6. **Replies + Analytics.**
   - Build: IMAP poller, bounce handling, Analytics page.
   - Accept when: a simulated reply (a "send reply" action on the dev sink inbox, fed through the same handler as IMAP) moves the lead to `REPLIED` and halts its sequence.
7. **Postal (optional)** and **Places 30-day refresh job.**
8. **Deploy prep.**
   - Build: Auth.js, Railway/Render config for web + worker with a persistent volume for the SQLite file, and a README with setup steps.

## Conventions

- Keep domain logic in `src/lib/{discovery,audit,scoring,outreach}` as pure, tested modules. Route handlers and jobs stay thin.
- Every job is idempotent and safe to retry.
- Log to stdout as structured JSON.
- Commit at the end of each phase with a descriptive message.
