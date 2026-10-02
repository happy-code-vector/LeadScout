# Public v2 — start-a-project wizard and proof

Date: 2026-10-02. Status: approved in conversation (user: "okay" to the package). Spec section: spec.md → "Client-facing site" → "Start-a-project wizard and proof (public v2)". Phases 14–15.

## Decision log

- **No Stripe / no self-serve checkout** — user decision. Pricing is discussed on a free call; invoice sent after. No published prices anywhere; a trust line replaces the pricing section.
- **Old flat `/contact` removed** — 301 to `/start`; the wizard is the single conversion surface (with `/audit` feeding into it).
- **Geo landing pages deferred** — the murasaki `/long-island-websites` pattern (one template per market) is only worth building when ad campaigns exist to point at it.
- **Background audit on the wizard's website step, strictly non-blocking** — a slow or failed audit must never prevent or delay submission; it only personalizes the end screen and enriches the Inquiry.
- **Inquiry gains `businessType`** rather than overloading `company`/`message`; source stays `CONTACT_FORM` (the wizard *is* the contact form).
- **Reviews badge gated on configuration** — renders only when rating + Maps URL are set in Settings (no fabricated proof; hard rule 2 spirit).
- **No screenshots in portfolio v1** — `siteUrl` live links only; the deployed site is the proof.

## Components

1. **`/start` wizard** (`src/app/(public)/start/`): client component, one question per screen (type chips + free text → website yes/no + URL → business name → contact name → email → phone? → message?), back navigation, honeypot + mount-time time-trap. URL step fires `POST /api/public/audit` in the background; its id (if ready at submit) rides the existing `auditReportId`. Submit → existing `POST /api/public/contact` extended with `businessType`. Entry points: `/start`, `/start?url=&report=`, landing CTA, `/contact` → 301.
2. **Portfolio cards**: `CaseStudy.siteUrl String?` (one migration with `Inquiry.businessType`); editor field; `/results` + teaser cards link out (`target="_blank" rel="noreferrer"`).
3. **Reviews badge**: `publicBrand` gains `googleRating`, `googleReviewCount`, `googleMapsUrl`; Settings card fields; landing + wizard end screen rendering.
4. **FAQ + trust copy**: `CONTENT.faq` array + pricing trust line; landing section before the closing CTA.

## Verification per phase (in spec.md phases 14–15)

- 14: full wizard e2e (Inquiry created with businessType + linked report; prefill via audit CTA; non-blocking audit; `/contact` 301; anti-spam intact).
- 15: live-linked cards, gated badge, FAQ section render.
