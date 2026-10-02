# Public face design — client-facing site for LeadScout

Date: 2026-10-02. Status: approved in brainstorming; spec section added to `spec.md` (Client-facing site). Competitive reference: murasaki.ai (Tokyo studio site — landing + `/seo` service page + `/supareel` product-as-lead-magnet + legal page).

## Decision log

- **Same app, same domain** (`scout.pacificexcellent.com`): public site takes the root; manager tools move under `/app/*`. A future dedicated domain is a Caddy block away, no renames needed.
- **Brand: AppHub LLC**, stored in Settings (`publicBrand`) — swappable without code changes.
- **Scope: full package** — marketing pages + free audit tool + inbound pipeline + results wall.
- **Architecture: Approach 2 (clean split)** — every manager page behind `/app`; public owns the root namespace. Chosen over the minimal-move option to match the back-of-house/client-facing mental model and make any later domain split trivial.

## What does not change

The automation engine (discovery, audit, scoring, outreach, IMAP, postal) is untouched. The public face is a new feeder and presentation layer over the same SQLite database and worker.

## Architecture

- `src/app/(public)/` route group: `page.tsx` (landing), `audit/page.tsx`, `audit/[id]/page.tsx` (report), `results/page.tsx`, `contact/page.tsx`. Own layout: marketing header + footer, no sidebar.
- `src/app/app/`: all existing manager pages, moved with `git mv` (URLs `/app/leads`, `/app/discover`, …). `next.config` redirects map every old path 301 → new. The manager AppShell wraps this group only.
- APIs stay at `/api/*` (avoids rewriting ~20 client fetches). The public island is `/api/public/audit` and `/api/public/contact`. Middleware: protect `/app/**` and `/api/**` except `public`, `auth`, `dev`; `/u/[token]` public as ever.
- `/signin`, `/signup`, `/dev/*` unchanged.

## Brand

`Settings.publicBrand` JSON `{ name, tagline, email, phone, address, socials }`, seeded "AppHub LLC". Landing/contact/footer read from it. Long-form copy lives in `src/content/public-site.ts` (one file).

## Audit tool

Flow: URL in (no email) → `POST /api/public/audit` → SSRF-guarded synchronous light audit (homepage + sitemap only; no contact-page crawl, no Wayback; same classify module) → `AuditReport` row (unguessable cuid, noindex) → redirect to `/audit/[id]` with verdict + plain-English findings → CTA form (name, email, optional phone) → `Inquiry(AUDIT_CTA)` linked to the report; auto-match the URL's host against `Business.websiteUri` and store `businessId` when it hits.

Security: http/https and ports 80/443 only; DNS resolve and block private/loopback/link-local/CGNAT ranges; redirects followed manually with per-hop re-validation; per-IP sliding window (5/hour) + global daily cap (in-memory — single web process on the VPS); no LeadScout internals (tiers, scores, placeIds) in any public page or payload.

## Inbound pipeline

`Inquiry` model (see spec data model delta). Sources: `CONTACT_FORM`, `AUDIT_CTA`. Anti-spam: honeypot field + time-trap. Manager UI: `/app/inquiries` list + Dashboard card. Convert action: create Business with `placeId: "inbound:<cuid>"`, Contact (source `INBOUND`), Lead at `QUEUED` with the audit summary in notes, Inquiry → `CONVERTED`. Inbound leads are never enrolled in cold sequences.

## Case studies

`CaseStudy` model; CRUD at `/app/case-studies`; "create from lead" on WON lead details prefills from the business. Public `/results` renders published, ordered. Seeded with nothing (no mock data, per hard rule 2); landing hides its teaser while empty.

## Data model delta

- `Settings.publicBrand` (JSON string column).
- New: `AuditReport`, `Inquiry`, `CaseStudy`.
- `ContactSource` adds `INBOUND` (text value; domain.ts list).

## Testing

- Unit: SSRF guard (private ranges, localhost, CGNAT, redirect-hop re-validation), rate limiter windows, light-audit classification (reuse of tested classify), inquiry→convert (creates Business/Contact/Lead, statuses).
- Route: unsigned `/app/**` → signin redirect; public pages 200 unsigned; old paths 301.
- Manual e2e: audit a real outdated site → submit CTA → inquiry in `/app/inquiries` → convert → QUEUED lead with notes.

## Build phases

Phases 9–13 in `spec.md` (split → skeleton → audit tool → inbound → case studies), verified after each, committed per phase.
