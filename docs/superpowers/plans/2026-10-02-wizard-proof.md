# Public v2 — Wizard & Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat contact form with a one-question-per-screen start-a-project wizard (with a non-blocking background site audit), and add proof surfaces: live-linked portfolio cards, a Google reviews badge, and FAQ/trust copy.

**Architecture:** One new public route (`/start`) carrying a self-contained client wizard that submits to the existing `POST /api/public/contact`; the audit CTA links into the wizard pre-filled; `/contact` becomes a permanent redirect. Proof items are additive: one `siteUrl` column, three brand-Settings fields, and a content-file FAQ rendered server-side.

**Tech Stack:** Next.js 15 App Router, Prisma/SQLite, Zod, Vitest, existing shadcn components. **No new npm dependencies.**

## Global Constraints

- TypeScript strict; gates per task: `npx tsc --noEmit` exit 0, `npx eslint src scripts --max-warnings 0` exit 0, `npm test` green.
- SQLite: statuses/JSON as text; allowed-value lists in `src/lib/domain.ts`; JSON columns via `toJson`/`fromJsonArray`.
- No published prices anywhere; the trust line is "simple fixed quote, agreed before any work starts".
- The background audit NEVER blocks wizard submission — a slow or failed audit is omitted, never awaited.
- Brand facts (incl. reviews fields) come from `Settings.publicBrand`; the badge renders only when `googleRating` and `googleMapsUrl` are both set (no fabricated proof).
- Public payloads expose no LeadScout internals; the two public POST endpoints remain the only exposed ones.
- Shell is PowerShell on Windows; `curl` means `curl.exe`. Commit messages end `Co-Authored-By: Claude Code <noreply@anthropic.com>`.

---

### Task 1: Schema + brand v2 + Settings UI

**Files:**
- Modify: `prisma/schema.prisma` (`Inquiry`, `CaseStudy`), `src/lib/public/brand.ts`, `src/app/app/settings/settings-client.tsx`
- Migration: `public_v2_fields`

**Interfaces:**
- Produces: `Inquiry.businessType String?` · `CaseStudy.siteUrl String?` · `PublicBrand` gains `googleRating: string`, `googleReviewCount: number`, `googleMapsUrl: string` (defaults `""`, `0`, `""`); `DEFAULT_BRAND` updated to match. Tasks 3–4 consume these.

- [ ] **Step 1: Schema + migration (stop any running dev/worker node processes first — SQLite lock)**

In `prisma/schema.prisma`, add to `model Inquiry` (after `company`):

```prisma
  businessType    String?
```

and to `model CaseStudy` (after `businessId`):

```prisma
  siteUrl         String?
```

Then: `npx prisma migrate dev --name public_v2_fields` — expect one migration adding both nullable columns.

- [ ] **Step 2: Extend the brand schema** — in `src/lib/public/brand.ts` add to `publicBrandSchema`:

```ts
  googleRating: z.string().max(10).default(""),
  googleReviewCount: z.number().int().min(0).max(100_000).default(0),
  googleMapsUrl: z.string().max(300).default(""),
```

and to `DEFAULT_BRAND`:

```ts
  googleRating: "",
  googleReviewCount: 0,
  googleMapsUrl: "",
```

Extend the existing brand tests (`src/lib/public/brand.test.ts`): the "fills missing optional fields" expectation now includes the three new fields with their defaults; the fallback tests still pass unchanged.

- [ ] **Step 3: Settings UI** — in `src/app/app/settings/settings-client.tsx`, extend the brand card's input grid with:

```tsx
{[["googleRating", "Google rating (e.g. 5.0)"], ["googleReviewCount", "Google review count"], ["googleMapsUrl", "Google Maps URL"]] as const}
```

rendered as three more rows in the same `([key, label] as const).map(...)` pattern already in that card. `googleReviewCount` needs `type="number"` and numeric state — keep the existing string-state pattern and coerce on save: `patch({ publicBrand: { ...brand, googleReviewCount: Number(brand.googleReviewCount) || 0 } }, "brand", "Brand saved")`.

- [ ] **Step 4: Gates + commit**

`npx tsc --noEmit` · `npm test` · `npx eslint src scripts --max-warnings 0` all clean.

```powershell
git add -A
git commit -m "feat: public v2 schema (businessType, siteUrl, reviews brand fields)"
```

---

### Task 2: Contact endpoint accepts businessType (TDD)

**Files:**
- Modify: `src/lib/public/inquiries.ts`, `src/app/api/public/contact/route.ts`
- Test: `src/lib/public/inquiries.test.ts`

**Interfaces:**
- Produces: `InquiryInput` gains `businessType?: string`; `POST /api/public/contact` persists `businessType` (or null). Task 3's wizard sends it.

- [ ] **Step 1: Failing tests** — add to `src/lib/public/inquiries.test.ts`:

```ts
it("accepts and preserves an optional business type", () => {
  const r = validateInquiryInput({ ...good, businessType: "Contractor or home services" }, 5_000);
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.value.businessType).toBe("Contractor or home services");
});
it("rejects an over-long business type", () => {
  expect(validateInquiryInput({ ...good, businessType: "x".repeat(61) }, 5_000).ok).toBe(false);
});
```

- [ ] **Step 2: Run — expect FAIL** (`npx vitest run src/lib/public`)

- [ ] **Step 3: Implement** — in `payloadSchema` add `businessType: z.string().trim().max(60).optional(),`; in the route's `prisma.inquiry.create` data add `businessType: result.value.businessType || null,`.

Additionally, extend `POST /api/public/audit`'s success payload so the wizard can personalize its end screen (verdict + top finding are already public on the report page — no internals): in `src/app/api/public/audit/route.ts`, return

```ts
  return NextResponse.json({
    id: report.id,
    websiteClass: result.websiteClass,
    finding: result.findings[0] ?? null,
  });
```

(`result` is the `runLightAudit` return already in scope; the Task-10 tests don't assert the response shape beyond `id`, so no test churn — verify with a live POST in Task 3's e2e.)

- [ ] **Step 4: Run — expect PASS**; full gates.

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "feat: contact endpoint accepts businessType"
```

---

### Task 3: The `/start` wizard + route rewiring

**Files:**
- Create: `src/app/(public)/start/page.tsx`, `src/app/(public)/start/wizard.tsx`
- Delete: `src/app/(public)/contact/page.tsx`, `src/app/(public)/contact/contact-form.tsx`, `src/app/(public)/audit/[id]/cta-form.tsx`
- Modify: `next.config.ts` (redirect), `src/components/public-shell.tsx` (nav), `src/app/(public)/page.tsx` (landing CTA), `src/app/(public)/audit/[id]/page.tsx` (CTA → link), `src/app/app/inquiries/page.tsx` + `inquiries-client.tsx` (businessType badge)

**Interfaces:**
- Consumes: `POST /api/public/contact` (now with `businessType`, `auditReportId`, `elapsedMs`, honeypot), `POST /api/public/audit` → `{id}`, Task 1 schema.
- Produces: `/start` accepting optional `?url=&report=` search params (server-side prefill, no `useSearchParams`); wizard default-exports nothing else other tasks depend on.

- [ ] **Step 1: `src/app/(public)/start/page.tsx`** (server — prefill via searchParams + prisma):

```tsx
import { prisma } from "@/lib/db";
import { fromJsonArray } from "@/lib/domain";
import { getBrand } from "@/lib/public/brand";
import { Wizard } from "./wizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Start a project" };

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; report?: string }>;
}) {
  const params = await searchParams;
  const brand = await getBrand();
  let prefill: { url?: string; report?: string; reportClass?: string; reportFinding?: string } = {};
  if (params.url) prefill.url = params.url;
  if (params.report) {
    const report = await prisma.auditReport.findUnique({
      where: { id: params.report },
      select: { id: true, url: true, websiteClass: true, findings: true },
    });
    if (report) {
      prefill.report = report.id;
      prefill.url = prefill.url ?? report.url;
      prefill.reportClass = report.websiteClass;
      prefill.reportFinding = fromJsonArray(report.findings)[0] ?? undefined;
    }
  }
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <Wizard
        prefill={prefill}
        reviews={
          brand.googleRating && brand.googleMapsUrl
            ? { rating: brand.googleRating, count: brand.googleReviewCount, url: brand.googleMapsUrl }
            : null
        }
      />
    </div>
  );
}
```

- [ ] **Step 2: `src/app/(public)/start/wizard.tsx`** (client — the whole flow):

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const BUSINESS_TYPES = [
  "Restaurant or café",
  "Contractor or home services",
  "Retail shop",
  "Health, beauty or fitness",
  "Professional services",
  "Something else",
] as const;

interface Prefill {
  url?: string;
  report?: string;
  reportClass?: string;
  reportFinding?: string;
}
interface Reviews {
  rating: string;
  count: number;
  url: string;
}

interface Answers {
  businessType: string;
  whatDoYouDo: string;
  hasWebsite: "" | "yes" | "no";
  website: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  message: string;
}

const EMPTY: Answers = {
  businessType: "", whatDoYouDo: "", hasWebsite: "", website: "",
  businessName: "", contactName: "", email: "", phone: "", message: "",
};

const STEPS = ["business", "website", "name-of-business", "your-name", "email", "phone", "message"] as const;

/** Verdict copy for the personalized end screen (public-safe). */
function verdictLine(cls?: string): string | null {
  if (!cls) return null;
  switch (cls) {
    case "DEAD": return "your current site couldn't be reached";
    case "PARKED": return "your domain is parked";
    case "SOCIAL_OR_DIRECTORY": return "that's a social page, not your own website";
    case "OUTDATED": return "your site needs updating";
    case "OK": return "your site is in decent shape — we'd make it better";
    default: return null;
  }
}

export function Wizard({ prefill, reviews }: { prefill: Prefill; reviews: Reviews | null }) {
  const loadedAt = useRef(Date.now());
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Answers>({
    ...EMPTY,
    hasWebsite: prefill.url ? "yes" : "",
    website: prefill.url ?? "",
  });
  // Background audit of the visitor's URL (never blocking; best-effort).
  const [audit, setAudit] = useState<{ id?: string; websiteClass?: string; finding?: string } | null>(
    prefill.report ? { id: prefill.report, websiteClass: prefill.reportClass, finding: prefill.reportFinding } : null,
  );
  const auditInFlight = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function fireBackgroundAudit(url: string) {
    if (auditInFlight.current || audit?.id || !url.trim()) return;
    auditInFlight.current = true;
    fetch("/api/public/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("audit failed"))))
      .then((j: { id?: string; websiteClass?: string; finding?: string | null }) => {
        if (j.id) setAudit({ id: j.id, websiteClass: j.websiteClass, finding: j.finding ?? undefined });
      })
      .catch(() => { /* audit is optional enrichment — ignore */ })
      .finally(() => { auditInFlight.current = false; });
  }

  // Firing when the visitor leaves the website step gives the audit the rest
  // of the wizard (typically 30s+) to finish; submit re-fires as a fallback.
  function next() {
    if (step === 1 && a.hasWebsite === "yes") fireBackgroundAudit(a.website);
    setStep(step + 1);
  }

  const canNext =
    (step === 0 && (a.businessType !== "" || a.whatDoYouDo.trim() !== "")) ||
    (step === 1 && a.hasWebsite !== "") ||
    (step === 2 && a.businessName.trim() !== "") ||
    (step === 3 && a.contactName.trim() !== "") ||
    (step === 4 && a.email.includes("@")) ||
    step === 5 || step === 6;

  async function submit() {
    setSubmitting(true);
    setError(null);
    fireBackgroundAudit(a.website); // fallback if the visitor skipped past step 1 quickly
    // Bounded, non-blocking courtesy wait: a slow audit is omitted (spec).
    if (auditInFlight.current) {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
    try {
      const res = await fetch("/api/public/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: a.contactName,
          email: a.email,
          phone: a.phone || undefined,
          company: a.businessName,
          website: a.website || undefined,
          businessType: a.businessType || undefined,
          message: a.message || undefined,
          company_extra: "",
          source: "CONTACT_FORM",
          auditReportId: audit?.id ?? undefined,
          elapsedMs: Date.now() - loadedAt.current,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "submission failed");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    const verdict = verdictLine(audit?.websiteClass);
    return (
      <div className="space-y-6 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Thanks, {a.contactName}.</h1>
        <p className="text-muted-foreground">
          Your project request is in. We&apos;ll reply within one business day to set up a free
          15-minute call — pricing is a simple fixed quote, agreed before any work starts.
        </p>
        {verdict && (
          <p className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
            From your free site check: {verdict}
            {audit?.finding ? ` — “${audit.finding}”` : ""}. That&apos;s the first thing we&apos;d fix.
          </p>
        )}
        {reviews && (
          <p className="text-sm">
            <a href={reviews.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
              ★ {reviews.rating} from {reviews.count} Google reviews
            </a>
          </p>
        )}
      </div>
    );
  }

  const questions: Record<number, React.ReactNode> = {
    0: (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">What kind of business do you run?</h1>
        <div className="mt-6 flex flex-wrap gap-2">
          {BUSINESS_TYPES.map((t) => (
            <button
              key={t} type="button"
              onClick={() => setA({ ...a, businessType: t })}
              className={`rounded-full border px-4 py-2 text-sm transition-colors ${a.businessType === t ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-1">
          <Label htmlFor="w-what" className="text-xs">What do you do? (a few words, optional)</Label>
          <Input id="w-what" value={a.whatDoYouDo} maxLength={120}
            onChange={(e) => setA({ ...a, whatDoYouDo: e.target.value })} placeholder="e.g. emergency plumbing" />
        </div>
      </>
    ),
    1: (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">Does your business have a website right now?</h1>
        <div className="mt-6 flex gap-3">
          {(["yes", "no"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setA({ ...a, hasWebsite: v })}
              className={`rounded-full border px-6 py-2 text-sm capitalize transition-colors ${a.hasWebsite === v ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
              {v === "yes" ? "Yes, we have one" : "No, this is our first"}
            </button>
          ))}
        </div>
        {a.hasWebsite === "yes" && (
          <div className="mt-4 grid gap-1">
            <Label htmlFor="w-url" className="text-xs">What&apos;s the web address? (we&apos;ll run a free check on it)</Label>
            <Input id="w-url" value={a.website} maxLength={300} inputMode="url" placeholder="yourbusiness.com"
              onChange={(e) => setA({ ...a, website: e.target.value })} />
          </div>
        )}
      </>
    ),
    2: (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">What&apos;s your business called?</h1>
        <Input className="mt-6" value={a.businessName} maxLength={120} required autoFocus
          onChange={(e) => setA({ ...a, businessName: e.target.value })} />
      </>
    ),
    3: (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">And your first name?</h1>
        <Input className="mt-6" value={a.contactName} maxLength={120} required autoFocus
          onChange={(e) => setA({ ...a, contactName: e.target.value })} />
      </>
    ),
    4: (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">What&apos;s the best email for you?</h1>
        <p className="mt-2 text-sm text-muted-foreground">We&apos;ll reply here within one business day.</p>
        <Input className="mt-6" type="email" value={a.email} maxLength={200} required autoFocus
          onChange={(e) => setA({ ...a, email: e.target.value })} />
      </>
    ),
    5: (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">And the best number to reach you?</h1>
        <p className="mt-2 text-sm text-muted-foreground">Optional — handy if a quick call is easier.</p>
        <Input className="mt-6" type="tel" value={a.phone} maxLength={40} autoFocus
          onChange={(e) => setA({ ...a, phone: e.target.value })} />
      </>
    ),
    6: (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">What do you want your website to do?</h1>
        <p className="mt-2 text-sm text-muted-foreground">Optional — anything you already know.</p>
        <Textarea className="mt-6" rows={4} maxLength={4000} value={a.message}
          onChange={(e) => setA({ ...a, message: e.target.value })} />
      </>
    ),
  };

  return (
    <div>
      <div className="mb-8 flex gap-1.5" aria-hidden="true">
        {STEPS.map((s, i) => (
          <div key={s} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>
      <input type="text" name="company_extra" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      {questions[step]}
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button>
        {step < STEPS.length - 1 ? (
          <Button disabled={!canNext} onClick={next}>Next →</Button>
        ) : (
          <Button disabled={!canNext || submitting} onClick={() => void submit()}>
            {submitting ? "Sending…" : "Send my project request"}
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rewire routes**

- `next.config.ts`: add to the redirects array: `{ source: "/contact", destination: "/start", permanent: true }`.
- Delete `src/app/(public)/contact/` (both files) and `src/app/(public)/audit/[id]/cta-form.tsx`.
- `src/app/(public)/audit/[id]/page.tsx`: replace the CTA card's `<CtaForm …/>` usage and its import with a link block:

```tsx
      <div className="mt-10 rounded-xl border bg-muted/30 p-6">
        <h2 className="font-semibold">Want this fixed?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {brand.name} rebuilds sites like this for a simple fixed quote, agreed on a free call before any work starts.
        </p>
        <a
          href={`/start?url=${encodeURIComponent(report.url)}&report=${report.id}`}
          className="mt-4 inline-flex items-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Start a project →
        </a>
      </div>
```

- `src/components/public-shell.tsx`: nav + footer "Contact" links → `{ href: "/start", label: "Start a project" }` (footer link text may stay short: "Start a project").
- `src/app/(public)/page.tsx`: the founder-section CTA `<Link href="/contact" …>Get in touch</Link>` → `href="/start"`.
- Manager inquiries list: in `src/app/app/inquiries/page.tsx` add `businessType: i.businessType ?? ""` to the row mapping; in `inquiries-client.tsx` add to the row interface `businessType: string;` and render, next to the source badge: `{i.businessType && <Badge variant="outline" className="ml-1">{i.businessType}</Badge>}`.

- [ ] **Step 4: Verify**

Gates clean. Short-lived dev server e2e:
- `GET /start` → 200; `GET /contact` → 308 → `/start` 200; `GET /start?url=example.com` → 200 (prefilled).
- `POST /api/public/contact` with `{name, email, company, businessType: "Contractor or home services", elapsedMs: 5000}` → `{ok:true}`; Inquiry row shows `businessType` and `status NEW`; delete the row after.
- `POST /api/public/audit` for `example.com` → `{id}`; `GET /audit/<id>` → page contains `Start a project →` linking to `/start?url=…&report=…`.

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "feat: start-a-project wizard replaces contact form"
```

---

### Task 4: Proof — portfolio links, reviews badge, FAQ

**Files:**
- Create: `src/components/public/reviews-badge.tsx`
- Modify: `src/content/public-site.ts`, `src/app/(public)/page.tsx` (badge + FAQ section), `src/app/(public)/results/page.tsx` (linked cards), `src/app/app/case-studies/case-studies-client.tsx` (+`page.tsx` mapping: `siteUrl`), `src/app/(public)/start/page.tsx` (reuse badge component)

**Interfaces:**
- Consumes: Task 1 brand fields + `CaseStudy.siteUrl`.
- Produces: `<ReviewsBadge brand={PublicBrand} />` (server component, renders `null` unless `googleRating` and `googleMapsUrl` are set); `CONTENT.faq: readonly { q: string; a: string }[]` and `CONTENT.pricingTrust: string`.

- [ ] **Step 1: Badge component** (`src/components/public/reviews-badge.tsx`):

```tsx
import type { PublicBrand } from "@/lib/public/brand";

export function ReviewsBadge({ brand, className = "" }: { brand: PublicBrand; className?: string }) {
  if (!brand.googleRating || !brand.googleMapsUrl) return null;
  return (
    <a
      href={brand.googleMapsUrl}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline ${className}`}
    >
      <span className="text-amber-500">★</span>
      <span>
        {brand.googleRating}
        {brand.googleReviewCount > 0 ? ` from ${brand.googleReviewCount} Google reviews` : " on Google"}
      </span>
    </a>
  );
}
```

Use it in `/start/page.tsx`'s success card in place of the inline reviews link (pass brand through to the Wizard as the existing `reviews` prop — simpler: keep the existing prop and leave the badge for landing/results; either is acceptable, pick one and note it in the report).

- [ ] **Step 2: Content** — add to `src/content/public-site.ts`:

```ts
  pricingTrust: "Simple fixed quote, agreed on a free call before any work starts. No surprises.",
  faq: [
    { q: "What's included?", a: "A custom-built website — design, build, launch — that works beautifully on phones, plus your own domain. We set up your contact form so customers can reach you any hour." },
    { q: "Who actually builds it?", a: "One person, start to finish — the same person you talk to on the call. No handoffs, no junior team." },
    { q: "How much does it cost?", a: "Every business is a little different, so we agree a simple fixed quote on a free 15-minute call before any work starts. No surprises after that." },
    { q: "What happens after I send my project request?", a: "We reply within one business day to set up a short call. You get an honest assessment and a clear next step — no pressure." },
    { q: "I already have a website.", a: "Great — run the free site check first. You'll see exactly what it's doing well and what it's quietly getting wrong, and we can talk about a rebuild or just the fixes." },
  ],
```

- [ ] **Step 3: Landing badge + FAQ section** — in `src/app/(public)/page.tsx`: after the hero CTA buttons render `<ReviewsBadge brand={brand} className="mt-6 justify-center" />` (server-side, brand is already loaded); before the founder section add:

```tsx
      <section className="border-t">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Questions, answered</h2>
          <p className="mt-2 text-sm text-muted-foreground">{CONTENT.pricingTrust}</p>
          <div className="mt-8 space-y-3">
            {CONTENT.faq.map((f) => (
              <details key={f.q} className="rounded-lg border px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium">{f.q}</summary>
                <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
```

- [ ] **Step 4: Linked portfolio cards** — `src/app/app/case-studies/page.tsx`: add `siteUrl: s.siteUrl ?? ""` to the row mapping and the `StudyRow` interface. `case-studies-client.tsx`: add a "Live site URL" input to edit rows and the add form (`name="siteUrl"`, `maxLength={300}`, `defaultValue={s.siteUrl}`). `actions.ts` `caseStudySchema`: add `siteUrl: z.string().trim().max(300).optional()` and store `siteUrl: siteUrl ?? null` (same hidden-input round-trip pattern as `businessId`). Public `results/page.tsx` + the landing teaser in `page.tsx`: when `s.siteUrl` is set, wrap the card in `<a href={s.siteUrl} target="_blank" rel="noreferrer" className="block rounded-xl border p-6 transition-colors hover:bg-muted/40">` and show the domain (`new URL(s.siteUrl).hostname`) under the title; otherwise render the existing plain card.

- [ ] **Step 5: Verify + commit**

Gates clean. Dev-server e2e: PATCH brand with `{publicBrand:{name:"AppHub LLC",googleRating:"5.0",googleReviewCount:23,googleMapsUrl:"https://maps.google.com/?q=x",tagline:"",email:"",phone:"",address:""}}` → landing shows ★ badge + FAQ section; create a published case study with `siteUrl` via prisma → `/results` card links out and shows the domain; unset `googleRating` (PATCH with `""`) → badge disappears. Clean up test rows (delete the case study; restore brand to previous values or leave the test values only if the DB had none — default is empty, so PATCH back to empty).

```powershell
git add -A
git commit -m "feat: proof surfaces — portfolio links, reviews badge, FAQ"
```

---

## Final verification

1. Gates: `npm test`, `npx tsc --noEmit`, `npx eslint src scripts --max-warnings 0`, `npx prisma migrate status`.
2. Unsigned route matrix: `/` (landing with badge + FAQ) · `/start` 200 · `/contact` → 308 → `/start` · `/audit` 200 · `/results` 200 · `/app/leads` gated.
3. Wizard e2e: full run → Inquiry with businessType (+ linked report when a URL was given) · `/contact` submissions still rate-limited · honeypot still rejects.
4. `npm run build` passes.
