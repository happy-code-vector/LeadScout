# Public Face Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the client-facing public site (landing, free audit tool, contact, results) that feeds inbound leads into the existing LeadScout pipeline, with all manager pages moved under `/app/*`.

**Architecture:** One Next.js app, two faces. `(public)` route group at the root (no auth); manager pages move to `src/app/app/*` behind the existing session middleware plus permanent redirects. Public endpoints are exactly two POST routes (`/api/public/audit`, `/api/public/contact`) guarded by an SSRF filter, rate limits, and anti-spam traps. Inbound submissions become `Inquiry` rows convertible to normal leads.

**Tech Stack:** Next.js 15 App Router, Prisma/SQLite, Zod, Vitest, shadcn/ui components already in `src/components/ui`. **No new npm dependencies.**

## Global Constraints

- TypeScript strict; gates per task: `npx tsc --noEmit` exit 0, `npx eslint src scripts --max-warnings 0` exit 0, `npm test` green.
- SQLite has no enums/arrays/json: statuses live as text; the allowed-value lists live in `src/lib/domain.ts`; JSON columns are strings via `toJson`/`fromJsonArray` from `src/lib/domain.ts`.
- Spec hard rule 8: the only internet-exposed endpoints are `POST /api/public/audit` and `POST /api/public/contact`. No tiers, scores, or placeIds in any public page or JSON payload. SSRF guard: http/https, ports 80/443 only, private ranges blocked, redirects re-validated per hop.
- Brand facts come from `Settings.publicBrand` (seeded "AppHub LLC"); long copy lives in `src/content/public-site.ts`. Nothing brand-ish is hardcoded in components.
- Shell is PowerShell on Windows; `curl` in verification steps means `curl.exe`.
- Commit after every task with a descriptive message ending `Co-Authored-By: Claude Code <noreply@anthropic.com>`.
- Existing automation modules (`src/lib/{discovery,audit,scoring,outreach}`) are reused, not modified, except reading exports.

---

### Task 1: Move manager routes under `/app` and split the layouts

**Files:**
- Move: `src/app/page.tsx` → `src/app/app/page.tsx`; `src/app/{discover,leads,campaigns,call-queue,templates,categories,analytics,settings,admin}` → same names under `src/app/app/`
- Create: `src/app/app/layout.tsx`, `src/app/(public)/layout.tsx`, `src/app/(public)/page.tsx` (temporary), `src/components/public-shell.tsx` (temporary simple version)
- Modify: `src/app/layout.tsx` (strip AppShell/auth), `src/components/app-shell.tsx` (nav prefixes + site link), link/revalidate fixes listed in Step 5

**Interfaces:**
- Consumes: `auth()` from `@/auth`, `AppShell` from `@/components/app-shell`
- Produces: manager pages under `/app/*`; `src/app/app/layout.tsx` exporting `AppLayout` (default export) that later tasks render inside; public group `src/app/(public)/*` whose full shell/landing arrive in Tasks 4–5

- [ ] **Step 1: Move the manager directories**

```powershell
cd e:\Projects\Arasheed\LeadScout
New-Item -ItemType Directory src\app\app -Force
git mv src/app/page.tsx src/app/app/page.tsx
git mv src/app/discover src/app/app/discover
git mv src/app/leads src/app/app/leads
git mv src/app/campaigns src/app/app/campaigns
git mv src/app/call-queue src/app/app/call-queue
git mv src/app/templates src/app/app/templates
git mv src/app/categories src/app/app/categories
git mv src/app/analytics src/app/analytics_tmp_for_order
git mv src/app/analytics_tmp_for_order src/app/app/analytics
git mv src/app/settings src/app/app/settings
git mv src/app/admin src/app/app/admin
```
(`src/app/api`, `src/app/u`, `src/app/dev`, `src/app/signin`, `src/app/signup` stay where they are.)

- [ ] **Step 2: Rewrite the root layout (no sidebar, no auth)**

Replace `src/app/layout.tsx` content with:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "AppHub", template: "%s · AppHub" },
  description: "Websites that bring local customers to your door.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Create the app layout (auth + sidebar) and the public group**

`src/app/app/layout.tsx`:

```tsx
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <AppShell user={session?.user ? { email: session.user.email ?? "", role: session.user.role } : null}>
      {children}
    </AppShell>
  );
}
```

`src/app/(public)/layout.tsx`:

```tsx
import { PublicShell } from "@/components/public-shell";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
```

`src/components/public-shell.tsx` (temporary — brand-aware version replaces it in Task 5):

```tsx
import Link from "next/link";

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">AppHub</Link>
          <nav className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/audit" className="hover:text-foreground">Free site check</Link>
            <Link href="/results" className="hover:text-foreground">Results</Link>
            <Link href="/contact" className="hover:text-foreground">Contact</Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t">
        <div className="mx-auto max-w-5xl px-6 py-6 text-xs text-muted-foreground">AppHub LLC</div>
      </footer>
    </div>
  );
}
```

`src/app/(public)/page.tsx` (temporary landing placeholder — replaced in Task 5):

```tsx
export default function LandingPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Public site coming soon</h1>
      <p className="mt-4 text-muted-foreground">
        Managers: <a className="underline" href="/app">open the back office</a>.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Prefix the sidebar nav and add a site link**

In `src/components/app-shell.tsx` change every `href` in `NAV` to its `/app/...` form (`/app`, `/app/discover`, `/app/leads`, `/app/campaigns`, `/app/call-queue`, `/app/templates`, `/app/categories`, `/app/analytics`, `/app/settings`) and the ROOT entry to `/app/admin/users`. Below the nav (before the user block) add:

```tsx
<Link href="/" className="mx-3 mb-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground">
  View public site ↗
</Link>
```

- [ ] **Step 5: Fix internal manager links and revalidation paths**

Exact edits (from the repo grep):
- `src/app/app/call-queue/page.tsx`: `` href={`/leads/${b.id}`} `` → `` href={`/app/leads/${b.id}`} ``
- `src/app/app/campaigns/campaigns-client.tsx`: `<Link href="/settings"` → `<Link href="/app/settings"`
- `src/app/app/leads/leads-client.tsx`: both `router.push(`/leads?…`)` → `` router.push(`/app/leads?…`) ``; `` href={`/leads/${r.businessId}`} `` → `` href={`/app/leads/${r.businessId}`} ``
- `src/app/app/leads/[id]/page.tsx`: `<Link href="/leads"` → `<Link href="/app/leads"`
- `src/app/app/leads/[id]/actions.ts`: every `revalidatePath(`/leads…`)`/`revalidatePath("/leads")` → `/app/…` equivalent
- `src/app/app/categories/actions.ts`: `revalidatePath("/categories")` → `"/app/categories"`, `revalidatePath("/discover")` → `"/app/discover"` (all occurrences)
- `src/app/app/page.tsx` (dashboard): `href={`/leads/${lead.business.id}`}` → `/app/…`, `href="/leads"` (two places: inbox links + "View all") → `/app/leads`
- `src/app/signin/signin-form.tsx`: `window.location.href = "/";` → `window.location.href = "/app";`

- [ ] **Step 6: Verify compile + suite, commit**

Run: `npx tsc --noEmit` → exit 0. `npm test` → all green. `npx eslint src --max-warnings 0` → exit 0.

```powershell
git add -A
git commit -m "refactor: manager routes under /app, split public/app layouts"
```

---

### Task 2: Redirects + middleware + split verification

**Files:**
- Modify: `next.config.ts`, `src/middleware.ts`

**Interfaces:**
- Produces: permanent redirects for every legacy manager path; middleware that gates only `/app/**` + `/api/**` (minus public islands) — the exact `PUBLIC_PREFIXES` list later tasks rely on

- [ ] **Step 1: Add redirects in `next.config.ts`**

```ts
import type { NextConfig } from "next";

const MANAGER_ROUTES = [
  "discover", "leads", "campaigns", "call-queue", "templates",
  "categories", "analytics", "settings", "admin",
];

const nextConfig: NextConfig = {
  async redirects() {
    return MANAGER_ROUTES.flatMap((r) => [
      { source: `/${r}`, destination: `/app/${r}`, permanent: true },
      { source: `/${r}/:path*`, destination: `/app/${r}/:path*`, permanent: true },
    ]);
  },
};

export default nextConfig;
```

- [ ] **Step 2: Rewrite `src/middleware.ts`**

```ts
import NextAuth from "next-auth";
import { authConfig } from "../auth.config";

/**
 * Auth gate for deployments (AUTH_ENABLED=true + AUTH_SECRET). Public pages
 * are open; only the manager areas (/app/** and /api/**, minus the public
 * islands) require a session. Always public: auth endpoints, signup/signin,
 * the one-click unsubscribe link, the dev tools, and /api/public/*.
 */

const PUBLIC_PREFIXES = ["/api/auth", "/api/dev", "/api/public", "/u/", "/dev/", "/signin", "/signup"];

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  if (process.env.AUTH_ENABLED !== "true") return;

  const path = req.nextUrl.pathname;
  const isManagerArea = path.startsWith("/app") || path.startsWith("/api");
  if (PUBLIC_PREFIXES.some((p) => path.startsWith(p)) || !isManagerArea) return;

  if (req.auth) {
    if (path.startsWith("/app/admin") && req.auth.user?.role !== "ROOT") {
      return Response.redirect(new URL("/app", req.url));
    }
    return;
  }

  const signIn = new URL("/signin", req.url);
  signIn.searchParams.set("callbackUrl", req.url);
  return Response.redirect(signIn);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 3: Run the split verification matrix**

Start `npm run dev` in the background, wait for 200 on `/`, then check (expect exact codes):
`/` → 200 · `/app` → 200 · `/leads` → 308/301 then `/app/leads` → 200 · `/app/leads` → 200 · `/discover` → redirect → `/app/discover` 200 · `/api/discover` → 200 (GET, local AUTH_ENABLED unset) · `/u/garbage` → 400 · `/signin` → 200.
Then `npm test` (all green) and `npx tsc --noEmit` (exit 0).

- [ ] **Step 4: Commit**

```powershell
git add -A
git commit -m "feat: legacy manager redirects + manager-only middleware gate"
```

---

### Task 3: One migration — publicBrand, Inquiry, AuditReport, CaseStudy, INBOUND source

**Files:**
- Modify: `prisma/schema.prisma`, `src/lib/domain.ts`
- Test: none (schema only; behavior tested via later tasks)

**Interfaces:**
- Produces (Prisma models used by Tasks 4–12):
  - `Settings.publicBrand String?` (JSON string)
  - `Inquiry` with fields `id, name, email, phone?, company?, website?, message?, source ("CONTACT_FORM"|"AUDIT_CTA"), auditReportId?, businessId?, status ("NEW"|"CONTACTED"|"CONVERTED"|"DISMISSED"), convertedAt?, createdAt`
  - `AuditReport` with `id, url, finalUrl?, websiteClass, findings (JSON string, default "[]"), checkedAt`
  - `CaseStudy` with `id, title, summary, metrics (JSON string default "[]"), businessId?, published Boolean default false, order Int default 0, createdAt, updatedAt`
  - `domain.ts`: `CONTACT_SOURCES` gains `"INBOUND"`

- [ ] **Step 1: Extend the schema**

In `prisma/schema.prisma` add to `model Settings`:

```prisma
  // JSON object; shape validated by src/lib/public/brand.ts.
  publicBrand            String?
```

Add `inquiries Inquiry[]` to `model Business`, and append these models:

```prisma
// Inbound submissions from the public site (contact form + audit CTA).
model Inquiry {
  id            String    @id @default(cuid())
  name          String
  email         String
  phone         String?
  company       String?
  website       String?
  message       String?
  // CONTACT_FORM | AUDIT_CTA
  source        String
  auditReportId String?
  businessId    String?
  business      Business? @relation(fields: [businessId], references: [id])
  // NEW | CONTACTED | CONVERTED | DISMISSED
  status        String    @default("NEW")
  convertedAt   DateTime?
  createdAt     DateTime  @default(now())

  @@index([status, createdAt])
}

// Public free-site-check report. Contains no LeadScout internals.
model AuditReport {
  id           String    @id @default(cuid())
  url          String
  finalUrl     String?
  // NONE | SOCIAL_OR_DIRECTORY | DEAD | PARKED | OUTDATED | OK
  websiteClass String
  findings     String    @default("[]")
  checkedAt    DateTime  @default(now())
  inquiries    Inquiry[]
}

// Published win stories for the public /results page.
model CaseStudy {
  id         String   @id @default(cuid())
  title      String
  summary    String
  // JSON array of { label: string, value: string }
  metrics    String   @default("[]")
  businessId String?
  published  Boolean  @default(false)
  order      Int      @default(0)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
```

In `src/lib/domain.ts` change:

```ts
export const CONTACT_SOURCES = ["PLACES", "WEBSITE", "MANUAL", "INBOUND"] as const;
```

and add:

```ts
export const INQUIRY_SOURCES = ["CONTACT_FORM", "AUDIT_CTA"] as const;
export const inquirySourceSchema = z.enum(INQUIRY_SOURCES);
export type InquirySource = z.infer<typeof inquirySourceSchema>;

export const INQUIRY_STATUSES = ["NEW", "CONTACTED", "CONVERTED", "DISMISSED"] as const;
export const inquiryStatusSchema = z.enum(INQUIRY_STATUSES);
export type InquiryStatus = z.infer<typeof inquiryStatusSchema>;
```

- [ ] **Step 2: Migrate (stop dev/worker first — SQLite lock)**

Stop any running `node` processes for this repo, then:

```powershell
npx prisma migrate dev --name public_face_tables
```
Expected: migration applied, client regenerated. `npx tsc --noEmit` → 0 (fix any fallout from the `Business` relation).

- [ ] **Step 3: Commit**

```powershell
git add -A
git commit -m "feat: public-face schema (publicBrand, Inquiry, AuditReport, CaseStudy)"
```

---

### Task 4: Brand module, seed, Settings editing

**Files:**
- Create: `src/lib/public/brand.ts`
- Modify: `src/db/seed.ts`, `src/app/api/settings/route.ts`, `src/app/app/settings/page.tsx`, `src/app/app/settings/settings-client.tsx`
- Test: `src/lib/public/brand.test.ts`

**Interfaces:**
- Produces:
  - `publicBrandSchema: z.ZodObject<…>`, `type PublicBrand = { name: string; tagline: string; email: string; phone: string; address: string }`
  - `DEFAULT_BRAND: PublicBrand` (name "AppHub LLC")
  - `getBrand(): Promise<PublicBrand>` — reads `Settings.publicBrand`, falls back to `DEFAULT_BRAND` on missing/invalid
  - `PATCH /api/settings` accepts `publicBrand` object; `SettingsClient` takes a `brand` prop

- [ ] **Step 1: Write the failing test** (`src/lib/public/brand.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_BRAND, parseBrand } from "./brand";

describe("parseBrand", () => {
  it("parses a full brand and fills missing optional fields", () => {
    const b = parseBrand(JSON.stringify({ name: "X LLC" }));
    expect(b).toEqual({ name: "X LLC", tagline: "", email: "", phone: "", address: "" });
  });
  it("falls back to the default on garbage", () => {
    expect(parseBrand("not json")).toEqual(DEFAULT_BRAND);
    expect(parseBrand(null)).toEqual(DEFAULT_BRAND);
  });
  it("rejects an empty name by falling back", () => {
    expect(parseBrand(JSON.stringify({ name: "" })).name).toBe(DEFAULT_BRAND.name);
  });
  it("default brand is AppHub LLC", () => {
    expect(DEFAULT_BRAND.name).toBe("AppHub LLC");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`Cannot find module './brand'`)

Run: `npx vitest run src/lib/public/brand.test.ts`

- [ ] **Step 3: Implement `src/lib/public/brand.ts`**

```ts
import { z } from "zod";
import { prisma } from "../db";

/** Brand facts shown on the public site. Lives in Settings.publicBrand. */
export const publicBrandSchema = z.object({
  name: z.string().min(1).max(80),
  tagline: z.string().max(160).default(""),
  email: z.string().max(160).default(""),
  phone: z.string().max(40).default(""),
  address: z.string().max(200).default(""),
});
export type PublicBrand = z.infer<typeof publicBrandSchema>;

export const DEFAULT_BRAND: PublicBrand = {
  name: "AppHub LLC",
  tagline: "Websites that bring local customers to your door.",
  email: "",
  phone: "",
  address: "",
};

export function parseBrand(raw: string | null | undefined): PublicBrand {
  if (!raw) return DEFAULT_BRAND;
  try {
    const parsed = publicBrandSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_BRAND;
  } catch {
    return DEFAULT_BRAND;
  }
}

export async function getBrand(): Promise<PublicBrand> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: { publicBrand: true },
  });
  return parseBrand(settings?.publicBrand);
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `npx vitest run src/lib/public/brand.test.ts`

- [ ] **Step 5: Seed + Settings wiring**

In `src/db/seed.ts`, inside the settings upsert `create:` add:

```ts
      publicBrand: JSON.stringify(DEFAULT_BRAND),
```

and import `DEFAULT_BRAND` from `../lib/public/brand`.

In `src/app/api/settings/route.ts`: import `publicBrandSchema` from `@/lib/public/brand`; add to `patchSchema`:

```ts
  publicBrand: publicBrandSchema.optional(),
```

and in the upsert write `...(d.publicBrand ? { publicBrand: JSON.stringify(d.publicBrand) } : {})` in both `update` and `create`.

In `src/app/app/settings/page.tsx`: import `getBrand`; pass `brand={await getBrand()}` to `SettingsClient`.

In `src/app/app/settings/settings-client.tsx`: add prop `brand: { name: string; tagline: string; email: string; phone: string; address: string }`, local state `const [brand, setBrand] = useState(initialBrand)`, and a new card after the identity card:

```tsx
<Card>
  <CardHeader><CardTitle className="text-base">Public site brand</CardTitle></CardHeader>
  <CardContent className="space-y-3">
    <div className="grid gap-3 md:grid-cols-2">
      {([["name", "Business name"], ["tagline", "Tagline"], ["email", "Public email"], ["phone", "Phone"], ["address", "Address"]] as const).map(([key, label]) => (
        <div key={key} className="grid gap-1">
          <Label htmlFor={`b-${key}`} className="text-xs">{label}</Label>
          <Input id={`b-${key}`} className="h-8" value={brand[key]}
            onChange={(e) => setBrand({ ...brand, [key]: e.target.value })} />
        </div>
      ))}
    </div>
    <Button size="sm" disabled={busy === "brand"} onClick={() => void patch({ publicBrand: brand }, "brand", "Brand saved")}>
      Save brand
    </Button>
  </CardContent>
</Card>
```

- [ ] **Step 6: Verify and commit**

`npm run db:seed` (updates the singleton), `npx tsc --noEmit`, `npm test`, `npx eslint src scripts --max-warnings 0` — all clean.

```powershell
git add -A
git commit -m "feat: Settings-driven public brand (AppHub LLC)"
```

---

### Task 5: Public content, landing page, `/results`, brand-aware shell

**Files:**
- Create: `src/content/public-site.ts`, `src/app/(public)/results/page.tsx`
- Modify: `src/components/public-shell.tsx` (brand-aware), `src/app/(public)/page.tsx` (real landing)

**Interfaces:**
- Consumes: `getBrand()` (Task 4), `prisma.caseStudy` (Task 3)
- Produces: `CONTENT` export from `src/content/public-site.ts` with `hero`, `services: {title; body; bullets: string[]}[]`, `steps: {title; body}[]`, `founder: string`, `contactBlurb: string`; public routes `/`, `/results`

- [ ] **Step 1: The content file** (`src/content/public-site.ts`)

```ts
/** All long-form public-site copy in one file. Brand facts come from Settings. */
export const CONTENT = {
  hero: {
    headline: "Your customers are searching. Is your website answering?",
    sub: "We build fast, modern websites for local businesses — the kind that turn a Google search into a phone call. Free site check below: see exactly what your current site is telling customers.",
    primaryCta: { label: "Check my site — free", href: "/audit" },
    secondaryCta: { label: "See the work", href: "/results" },
  },
  services: [
    { title: "New websites", body: "No site, or one you're embarrassed by? We design and build a complete site — your services, photos, and a click-to-call button — owned by you, not a platform.", bullets: ["Design, build, launch — one person, no handoffs", "Works perfectly on phones", "You own the domain and the site"] },
    { title: "Website rebuilds", body: "If your site is outdated, slow, or invisible on mobile, we rebuild it on a modern stack without losing what already works.", bullets: ["Modern, fast, mobile-first", "Keep your content and rankings", "Fixed price, quoted up front"] },
    { title: "Care & maintenance", body: "Sites that stay healthy: updates, backups, and small changes handled, so you can run your business.", bullets: ["Monthly updates and backups", "Small edits included", "One flat monthly rate"] },
  ],
  steps: [
    { title: "1 · Check", body: "Run the free site check. In about fifteen seconds you'll see what your site does well and what it's quietly getting wrong." },
    { title: "2 · Talk", body: "A free 15-minute call. We look at your results together and you get a straight answer on what's worth fixing." },
    { title: "3 · Build", body: "A fixed-price quote, a clear timeline, and a site you own. Most small-business sites launch within two weeks." },
  ],
  founder: "You work directly with the person designing and building your site — no account managers, no junior handoffs, no agency overhead.",
  contactBlurb: "Tell us about your business and what you want your website to do. You'll get an honest assessment and a clear next step — no pressure, no jargon.",
} as const;
```

- [ ] **Step 2: Brand-aware `public-shell.tsx`**

```tsx
import Link from "next/link";
import { getBrand } from "@/lib/public/brand";

export async function PublicShell({ children }: { children: React.ReactNode }) {
  const brand = await getBrand();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">{brand.name}</Link>
          <nav className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/audit" className="hover:text-foreground">Free site check</Link>
            <Link href="/results" className="hover:text-foreground">Results</Link>
            <Link href="/contact" className="hover:text-foreground">Contact</Link>
            <Link href="/audit" className="rounded-lg bg-primary px-3 py-1.5 text-primary-foreground hover:bg-primary/90">Check my site</Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-6 py-6 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} {brand.name}{brand.address ? ` · ${brand.address}` : ""}</span>
          <span className="flex gap-4">
            <Link href="/audit" className="hover:text-foreground">Free site check</Link>
            <Link href="/contact" className="hover:text-foreground">Contact</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
```

- [ ] **Step 3: The landing page** (`src/app/(public)/page.tsx`)

```tsx
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getBrand } from "@/lib/public/brand";
import { CONTENT } from "@/content/public-site";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const brand = await getBrand();
  const teaser = await prisma.caseStudy.findMany({
    where: { published: true },
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    take: 3,
  });

  return (
    <div>
      <section className="mx-auto max-w-5xl px-6 py-20 text-center">
        {brand.tagline ? <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">{brand.tagline}</p> : null}
        <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">{CONTENT.hero.headline}</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">{CONTENT.hero.sub}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href={CONTENT.hero.primaryCta.href} className="rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground hover:bg-primary/90">{CONTENT.hero.primaryCta.label}</Link>
          <Link href={CONTENT.hero.secondaryCta.href} className="rounded-lg border px-5 py-2.5 font-medium hover:bg-muted">{CONTENT.hero.secondaryCta.label}</Link>
        </div>
      </section>

      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">What we do</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {CONTENT.services.map((s) => (
              <div key={s.title} className="rounded-xl border bg-background p-6">
                <h3 className="font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
                <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
                  {s.bullets.map((b) => <li key={b}>· {b}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {CONTENT.steps.map((s) => (
            <div key={s.title}>
              <h3 className="font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {teaser.length > 0 && (
        <section className="border-t bg-muted/30">
          <div className="mx-auto max-w-5xl px-6 py-16">
            <h2 className="text-2xl font-semibold tracking-tight">Recent work</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {teaser.map((c) => (
                <div key={c.id} className="rounded-xl border bg-background p-6">
                  <h3 className="font-semibold">{c.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{c.summary}</p>
                </div>
              ))}
            </div>
            <Link href="/results" className="mt-6 inline-block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">See all results →</Link>
          </div>
        </section>
      )}

      <section className="border-t">
        <div className="mx-auto max-w-5xl px-6 py-16 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">Work with one person, start to finish</h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">{CONTENT.founder}</p>
          <Link href="/contact" className="mt-6 inline-block rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground hover:bg-primary/90">Get in touch</Link>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: `/results` page** (`src/app/(public)/results/page.tsx`)

```tsx
import { prisma } from "@/lib/db";
import { fromJsonArray } from "@/lib/domain";

export const dynamic = "force-dynamic";
export const metadata = { title: "Results" };

export default async function ResultsPage() {
  const studies = await prisma.caseStudy.findMany({
    where: { published: true },
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
  });

  if (studies.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-24 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Results</h1>
        <p className="mt-4 text-muted-foreground">
          The first projects are in flight. Check back soon — or be one of them:{" "}
          <a href="/audit" className="underline underline-offset-4">start with a free site check</a>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Results</h1>
      <div className="mt-10 space-y-6">
        {studies.map((s) => (
          <article key={s.id} className="rounded-xl border p-6">
            <h2 className="text-xl font-semibold">{s.title}</h2>
            <p className="mt-2 text-muted-foreground">{s.summary}</p>
            <div className="mt-4 flex flex-wrap gap-6">
              {fromJsonArray(s.metrics).map((m) => {
                const parsed = JSON.parse(m) as { label: string; value: string };
                return (
                  <div key={parsed.label}>
                    <div className="text-2xl font-semibold tabular-nums">{parsed.value}</div>
                    <div className="text-xs text-muted-foreground">{parsed.label}</div>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
```
(Note: metrics stored as `toJson([{label, value}])` → `fromJsonArray` returns `string[]`; each entry parsed. Simpler: use a local `JSON.parse(s.metrics)` as an array of objects and drop the per-item parse — implement it that way and delete the `fromJsonArray` usage.)

- [ ] **Step 5: Verify + commit**

`npx tsc --noEmit` · `npm test` · eslint clean. Dev server: `/` shows the landing with "AppHub LLC" from Settings, `/results` shows the empty state.

```powershell
git add -A
git commit -m "feat: public landing, results page, brand-aware shell"
```

---

### Task 6: Inquiry validation + rate limiter + `/contact` + SEO files

**Files:**
- Create: `src/lib/public/inquiries.ts`, `src/lib/public/rate-limit.ts`, `src/app/(public)/contact/page.tsx`, `src/app/(public)/contact/contact-form.tsx`, `src/app/api/public/contact/route.ts`, `src/app/robots.ts`, `src/app/sitemap.ts`
- Test: `src/lib/public/inquiries.test.ts`, `src/lib/public/rate-limit.test.ts`

**Interfaces:**
- Produces:
  - `validateInquiryInput(body: unknown, elapsedMs: number): { ok: true; value: InquiryInput } | { ok: false; error: string }` where `InquiryInput = { name; email; phone?; company?; website?; message?; source: "CONTACT_FORM" | "AUDIT_CTA"; auditReportId?: string }`
  - `class SlidingWindow { constructor(limit: number, windowMs: number, now?: () => number); tryAcquire(key: string): boolean }`, plus singletons `contactLimiter = new SlidingWindow(5, 3_600_000)`
  - `POST /api/public/contact` returning `{ ok: true }` / 400 `{ error }` / 429

- [ ] **Step 1: Failing tests**

`src/lib/public/rate-limit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SlidingWindow } from "./rate-limit";

describe("SlidingWindow", () => {
  it("allows up to the limit inside the window, then refuses", () => {
    let t = 0;
    const w = new SlidingWindow(2, 60_000, () => t);
    expect(w.tryAcquire("ip")).toBe(true);
    expect(w.tryAcquire("ip")).toBe(true);
    expect(w.tryAcquire("ip")).toBe(false);
  });
  it("frees capacity after the window passes", () => {
    let t = 0;
    const w = new SlidingWindow(1, 60_000, () => t);
    expect(w.tryAcquire("ip")).toBe(true);
    t = 61_000;
    expect(w.tryAcquire("ip")).toBe(true);
  });
  it("tracks keys independently", () => {
    const w = new SlidingWindow(1, 60_000, () => 0);
    expect(w.tryAcquire("a")).toBe(true);
    expect(w.tryAcquire("b")).toBe(true);
    expect(w.tryAcquire("a")).toBe(false);
  });
});
```

`src/lib/public/inquiries.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateInquiryInput } from "./inquiries";

const good = { name: "Sam", email: "sam@shop.com", message: "hi" };

describe("validateInquiryInput", () => {
  it("accepts a minimal valid submission", () => {
    const r = validateInquiryInput({ ...good }, 5_000);
    expect(r.ok).toBe(true);
  });
  it("rejects too-fast submissions (time trap)", () => {
    expect(validateInquiryInput({ ...good }, 1_000).ok).toBe(false);
  });
  it("rejects a filled honeypot", () => {
    expect(validateInquiryInput({ ...good, company_extra: "spam" }, 5_000).ok).toBe(false);
  });
  it("requires a name and a valid email", () => {
    expect(validateInquiryInput({ ...good, name: "" }, 5_000).ok).toBe(false);
    expect(validateInquiryInput({ ...good, email: "nope" }, 5_000).ok).toBe(false);
  });
  it("caps message length and validates the source", () => {
    expect(validateInquiryInput({ ...good, message: "x".repeat(4001) }, 5_000).ok).toBe(false);
    expect(validateInquiryInput({ ...good, source: "SMS" }, 5_000).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`npx vitest run src/lib/public`)

- [ ] **Step 3: Implement**

`src/lib/public/rate-limit.ts`:

```ts
/** In-memory sliding-window limiter. Single web process per deploy. */
export class SlidingWindow {
  private hits = new Map<string, number[]>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}
  tryAcquire(key: string): boolean {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(t);
    this.hits.set(key, recent);
    return true;
  }
}

export const contactLimiter = new SlidingWindow(5, 3_600_000);
export const auditLimiter = new SlidingWindow(5, 3_600_000);
export const auditDailyCap = new SlidingWindow(200, 24 * 3_600_000);

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "unknown";
}
```

`src/lib/public/inquiries.ts`:

```ts
import { z } from "zod";
import { inquirySourceSchema } from "../domain";

const payloadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  company: z.string().trim().max(120).optional(),
  website: z.string().trim().max(300).optional(),
  message: z.string().trim().max(4_000).optional(),
  source: inquirySourceSchema.default("CONTACT_FORM"),
  auditReportId: z.string().max(64).optional(),
  // Honeypot: humans never fill this.
  company_extra: z.string().max(0).optional(),
});

export type InquiryInput = z.infer<typeof payloadSchema>;

const MIN_ELAPSED_MS = 2_500;

export function validateInquiryInput(
  body: unknown,
  elapsedMs: number,
): { ok: true; value: InquiryInput } | { ok: false; error: string } {
  if (elapsedMs < MIN_ELAPSED_MS) return { ok: false, error: "That was too fast — please try again." };
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid submission" };
  }
  return { ok: true, value: parsed.data };
}
```

- [ ] **Step 4: Run tests — expect PASS** (`npx vitest run src/lib/public`)

- [ ] **Step 5: The endpoint + form + page**

`src/app/api/public/contact/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp, contactLimiter } from "@/lib/public/rate-limit";
import { validateInquiryInput } from "@/lib/public/inquiries";

export async function POST(request: Request) {
  if (!contactLimiter.tryAcquire(clientIp(request))) {
    return NextResponse.json({ error: "Too many submissions — try again later." }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as
    | (Record<string, unknown> & { elapsedMs?: number })
    | null;
  const result = validateInquiryInput(body, Number(body?.elapsedMs ?? 0));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  await prisma.inquiry.create({
    data: {
      name: result.value.name,
      email: result.value.email.toLowerCase(),
      phone: result.value.phone || null,
      company: result.value.company || null,
      website: result.value.website || null,
      message: result.value.message || null,
      source: result.value.source,
      auditReportId: result.value.auditReportId || null,
    },
  });
  return NextResponse.json({ ok: true });
}
```

`src/app/(public)/contact/contact-form.tsx` (client):

```tsx
"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ContactForm({ source = "CONTACT_FORM", auditReportId }: { source?: "CONTACT_FORM" | "AUDIT_CTA"; auditReportId?: string }) {
  const loadedAt = useRef(Date.now());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/public/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"), email: fd.get("email"), phone: fd.get("phone"),
          company: fd.get("company"), website: fd.get("website"), message: fd.get("message"),
          company_extra: fd.get("company_extra"), source, auditReportId,
          elapsedMs: Date.now() - loadedAt.current,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "submission failed");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "submission failed");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return <p className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">Thanks — your message is in. We reply within one business day.</p>;
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <input type="text" name="company_extra" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1"><Label htmlFor="ct-name">Name</Label><Input id="ct-name" name="name" required maxLength={120} /></div>
        <div className="grid gap-1"><Label htmlFor="ct-email">Email</Label><Input id="ct-email" name="email" type="email" required maxLength={200} /></div>
        <div className="grid gap-1"><Label htmlFor="ct-phone">Phone (optional)</Label><Input id="ct-phone" name="phone" maxLength={40} /></div>
        <div className="grid gap-1"><Label htmlFor="ct-company">Business (optional)</Label><Input id="ct-company" name="company" maxLength={120} /></div>
      </div>
      <div className="grid gap-1"><Label htmlFor="ct-website">Website (optional)</Label><Input id="ct-website" name="website" placeholder="yourbusiness.com" maxLength={300} /></div>
      <div className="grid gap-1"><Label htmlFor="ct-message">What do you want your website to do?</Label><Textarea id="ct-message" name="message" rows={4} maxLength={4000} /></div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy} className="justify-self-start">{busy ? "Sending…" : "Send"}</Button>
    </form>
  );
}
```

`src/app/(public)/contact/page.tsx`:

```tsx
import { getBrand } from "@/lib/public/brand";
import { CONTENT } from "@/content/public-site";
import { ContactForm } from "./contact-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contact" };

export default async function ContactPage() {
  const brand = await getBrand();
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Let&apos;s talk</h1>
      <p className="mt-3 text-muted-foreground">{CONTENT.contactBlurb}</p>
      {brand.email ? <p className="mt-1 text-sm text-muted-foreground">Prefer email? <a className="underline underline-offset-4" href={`mailto:${brand.email}`}>{brand.email}</a></p> : null}
      <div className="mt-8"><ContactForm /></div>
    </div>
  );
}
```

`src/app/robots.ts`:

```ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/api", "/dev", "/u", "/signin", "/signup"] }],
  };
}
```

`src/app/sitemap.ts`:

```ts
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return ["", "/audit", "/results", "/contact"].map((p) => ({
    url: `${base}${p}`,
    lastModified: new Date(),
  }));
}
```

- [ ] **Step 6: Verify + commit**

Gates clean; dev-server check: `GET /contact` → 200; `POST /api/public/contact` with a valid body + `elapsedMs: 5000` → `{ok:true}` and an Inquiry row appears; replay with `elapsedMs: 500` → 400.

```powershell
git add -A
git commit -m "feat: public contact form -> Inquiry, rate limiter, robots/sitemap"
```

---

### Task 7: SSRF guard (TDD)

**Files:**
- Create: `src/lib/public/ssrf.ts`
- Test: `src/lib/public/ssrf.test.ts`

**Interfaces:**
- Produces:
  - `ipIsPrivate(ip: string): boolean`
  - `type Resolver = (host: string) => Promise<string[]>`
  - `class PublicUrlError extends Error { reason: string }`
  - `assertPublicHttpUrl(raw: string, resolve?: Resolver): Promise<URL>` — throws `PublicUrlError` on any violation; prefixes `https://` when the scheme is missing

- [ ] **Step 1: Failing tests** (`src/lib/public/ssrf.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { assertPublicHttpUrl, ipIsPrivate, PublicUrlError } from "./ssrf";

const pub: Resolver_like = async () => ["93.184.216.34"];
type Resolver_like = (h: string) => Promise<string[]>;
const priv: Resolver_like = async () => ["10.0.0.5"];

describe("ipIsPrivate", () => {
  it.each(["10.0.0.1", "10.255.1.1", "172.16.0.1", "172.31.255.255", "192.168.1.1", "127.0.0.1", "0.0.0.0", "169.254.169.254", "100.64.0.1", "::1", "::", "fc00::1", "fd12::1", "fe80::1", "::ffff:127.0.0.1", "not-an-ip"])("%s is private/blocked", (ip) => {
    expect(ipIsPrivate(ip)).toBe(true);
  });
  it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "100.128.0.1", "2606:4700::1111"])("%s is public", (ip) => {
    expect(ipIsPrivate(ip)).toBe(false);
  });
});

describe("assertPublicHttpUrl", () => {
  it("accepts a public https URL and defaults the scheme", async () => {
    const a = await assertPublicHttpUrl("https://example.com/x", pub);
    expect(a.hostname).toBe("example.com");
    const b = await assertPublicHttpUrl("example.com", pub);
    expect(b.protocol).toBe("https:");
  });
  it.each([
    ["ftp://example.com", "scheme"],
    ["https://example.com:8080", "port"],
    ["https://localhost", "local"],
    ["http://127.0.0.1", "private"],
    ["http://192.168.1.10", "private"],
    ["https://example.com:6379", "port"],
  ])("rejects %s", async (raw) => {
    await expect(assertPublicHttpUrl(raw, pub)).rejects.toBeInstanceOf(PublicUrlError);
  });
  it("rejects when DNS resolves only to private addresses", async () => {
    await expect(assertPublicHttpUrl("internal.example", priv)).rejects.toBeInstanceOf(PublicUrlError);
  });
  it("rejects when the domain does not resolve", async () => {
    const none: Resolver_like = async () => [];
    await expect(assertPublicHttpUrl("nope.example", none)).rejects.toBeInstanceOf(PublicUrlError);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `src/lib/public/ssrf.ts`**

```ts
import { lookup } from "node:dns/promises";

export type Resolver = (host: string) => Promise<string[]>;

const defaultResolve: Resolver = async (host) => {
  const result = await lookup(host, { all: true });
  return result.map((r) => r.address);
};

export class PublicUrlError extends Error {
  constructor(public readonly reason: string) {
    super(`URL rejected: ${reason}`);
    this.name = "PublicUrlError";
  }
}

function isIpv4(s: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(s);
}

export function ipIsPrivate(ip: string): boolean {
  const v = ip.trim().toLowerCase();
  if (v.includes(":")) {
    if (v === "::1" || v === "::") return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return ipIsPrivate(mapped[1]);
    if (v.startsWith("fc") || v.startsWith("fd")) return true; // fc00::/7 ULA
    if (/^fe[89ab]/.test(v)) return true; // fe80::/10 link-local
    return false;
  }
  const parts = v.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true; // unparsable = blocked
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

export async function assertPublicHttpUrl(raw: string, resolve: Resolver = defaultResolve): Promise<URL> {
  let candidate = raw.trim();
  if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new PublicUrlError("that does not look like a website address");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PublicUrlError("only http(s) addresses can be checked");
  }
  if (url.port !== "" && url.port !== "80" && url.port !== "443") {
    throw new PublicUrlError("only ports 80 and 443 can be checked");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new PublicUrlError("local addresses cannot be checked");
  }
  if ((isIpv4(host) || host.includes(":")) && ipIsPrivate(host)) {
    throw new PublicUrlError("private addresses cannot be checked");
  }
  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch {
    throw new PublicUrlError("that domain does not resolve");
  }
  if (addresses.length === 0) throw new PublicUrlError("that domain does not resolve");
  if (addresses.some((a) => ipIsPrivate(a))) {
    throw new PublicUrlError("that domain resolves to a private address");
  }
  return url;
}
```

- [ ] **Step 4: Run — expect PASS** (`npx vitest run src/lib/public/ssrf.test.ts`)

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "feat: SSRF guard for public URL submission"
```

---

### Task 8: Guarded fetch with per-hop re-validation (TDD)

**Files:**
- Create: `src/lib/public/guarded-fetch.ts`
- Test: `src/lib/public/guarded-fetch.test.ts`

**Interfaces:**
- Consumes: `assertPublicHttpUrl`, `Resolver` (Task 7)
- Produces: `fetchGuarded(url: URL, opts?: { timeoutMs?: number; maxHops?: number; fetchImpl?: typeof fetch; resolve?: Resolver }): Promise<{ finalUrl: string; status: number; html: string }>` — throws `PublicUrlError` when any hop targets a blocked host

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { fetchGuarded } from "./guarded-fetch";
import { PublicUrlError } from "./ssrf";

const pub = async () => ["93.184.216.34"];
const priv = async () => ["10.0.0.5"];

function res(status: number, html = "", location?: string): Response {
  return new Response(html, { status, headers: location ? { location } : undefined });
}

describe("fetchGuarded", () => {
  it("returns the page for a direct public URL", async () => {
    const out = await fetchGuarded(new URL("https://example.com/"), {
      fetchImpl: (async () => res(200, "<html>ok</html>")) as unknown as typeof fetch,
      resolve: pub,
    });
    expect(out.status).toBe(200);
    expect(out.html).toContain("ok");
  });
  it("follows redirects and validates each hop", async () => {
    let called = 0;
    const impl = (async (_u: URL) => {
      called += 1;
      return called === 1 ? res(301, "", "https://other.example/x") : res(200, "final");
    }) as unknown as typeof fetch;
    const out = await fetchGuarded(new URL("https://example.com/"), { fetchImpl: impl, resolve: pub });
    expect(out.html).toBe("final");
    expect(called).toBe(2);
  });
  it("rejects a redirect to a private host", async () => {
    const impl = (async () => res(302, "", "http://192.168.0.10/admin")) as unknown as typeof fetch;
    await expect(
      fetchGuarded(new URL("https://example.com/"), { fetchImpl: impl, resolve: pub }),
    ).rejects.toBeInstanceOf(PublicUrlError);
  });
  it("rejects when the initial host resolves private", async () => {
    const impl = (async () => res(200, "x")) as unknown as typeof fetch;
    await expect(
      fetchGuarded(new URL("https://internal.example/"), { fetchImpl: impl, resolve: priv }),
    ).rejects.toBeInstanceOf(PublicUrlError);
  });
  it("gives up after maxHops", async () => {
    const impl = (async () => res(302, "", "https://example.com/loop")) as unknown as typeof fetch;
    await expect(
      fetchGuarded(new URL("https://example.com/"), { fetchImpl: impl, resolve: pub, maxHops: 2 }),
    ).rejects.toBeInstanceOf(PublicUrlError);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
import { assertPublicHttpUrl, PublicUrlError, type Resolver } from "./ssrf";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; AppHubSiteCheck/1.0)",
  Accept: "text/html,application/xhtml+xml",
};

export interface GuardedFetchOptions {
  timeoutMs?: number;
  maxHops?: number;
  fetchImpl?: typeof fetch;
  resolve?: Resolver;
}

export async function fetchGuarded(
  url: URL,
  opts: GuardedFetchOptions = {},
): Promise<{ finalUrl: string; status: number; html: string }> {
  const { timeoutMs = 10_000, maxHops = 3 } = opts;
  const doFetch = opts.fetchImpl ?? ((u: URL, init: RequestInit) => fetch(u, init));
  let current = url;
  for (let hop = 0; hop <= maxHops; hop++) {
    await assertPublicHttpUrl(current.toString(), opts.resolve);
    const res = await doFetch(current, {
      redirect: "manual",
      headers: HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return { finalUrl: current.toString(), status: res.status, html: "" };
      current = new URL(location, current);
      continue;
    }
    const html = await res.text().catch(() => "");
    return { finalUrl: current.toString(), status: res.status, html };
  }
  throw new PublicUrlError("too many redirects");
}
```

- [ ] **Step 4: Run — expect PASS**; fix the final-throw to a static import first

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "feat: guarded public fetch with per-hop SSRF re-validation"
```

---

### Task 9: Light audit (TDD)

**Files:**
- Create: `src/lib/public/audit-light.ts`
- Test: `src/lib/public/audit-light.test.ts`

**Interfaces:**
- Consumes: `classifyWebsite`, `matchesParkedPage`, `AuditClass` from `@/lib/audit/classify`; `extractPageSignals` from `@/lib/audit/extract`; `fetchGuarded` (Task 8)
- Produces: `runLightAudit(url: URL, deps?: LightAuditDeps): Promise<{ finalUrl: string | null; websiteClass: AuditClass; findings: string[] }>` where `LightAuditDeps = { fetchPage: typeof fetchGuarded; fetchSitemapLastMod: (origin: URL) => Promise<Date | null> }`; default deps use `fetchGuarded` for both homepage and `/sitemap.xml`

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { runLightAudit } from "./audit-light";
import { fetchGuarded } from "./guarded-fetch";

const OLD = `<!doctype html><html><head><title>t</title></head><body>
<footer>Copyright 2015 Acme</footer></body></html>`; // no viewport → 10 + copyright 15 = 25 → OUTDATED

function depsFor(status: number, html: string, redirects = false) {
  return {
    fetchPage: (async () => ({ finalUrl: "https://x.example/", status, html })) as typeof fetchGuarded,
    fetchSitemapLastMod: (async () => null) as (o: URL) => Promise<Date | null>,
    _redirects: redirects,
  };
}

describe("runLightAudit", () => {
  it("classifies an outdated page with its findings", async () => {
    const r = await runLightAudit(new URL("https://x.example/"), depsFor(200, OLD));
    expect(r.websiteClass).toBe("OUTDATED");
    expect(r.findings).toContain("Copyright 2015");
    expect(r.findings).toContain("Not mobile-friendly");
  });
  it("returns DEAD with a plain finding when the fetch throws", async () => {
    const deps = {
      fetchPage: (async () => { throw new Error("connect ECONNREFUSED"); }) as typeof fetchGuarded,
      fetchSitemapLastMod: (async () => null) as (o: URL) => Promise<Date | null>,
    };
    const r = await runLightAudit(new URL("https://x.example/"), deps);
    expect(r.websiteClass).toBe("DEAD");
    expect(r.findings[0]).toMatch(/reach/i);
  });
  it("returns DEAD on HTTP errors", async () => {
    const r = await runLightAudit(new URL("https://x.example/"), depsFor(500, ""));
    expect(r.websiteClass).toBe("DEAD");
  });
  it("returns PARKED on a for-sale page", async () => {
    const r = await runLightAudit(new URL("https://x.example/"), depsFor(200, "<h1>This domain is for sale</h1>"));
    expect(r.websiteClass).toBe("PARKED");
  });
  it("never includes emails in findings", async () => {
    const r = await runLightAudit(new URL("https://x.example/"), depsFor(200, `<a href="mailto:a@b.test">m</a>${OLD}`));
    expect(JSON.stringify(r)).not.toContain("@");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
import { classifyWebsite, matchesParkedPage, type AuditClass } from "../audit/classify";
import { extractPageSignals } from "../audit/extract";
import { fetchGuarded } from "./guarded-fetch";

export interface LightAuditDeps {
  fetchPage: typeof fetchGuarded;
  fetchSitemapLastMod: (origin: URL) => Promise<Date | null>;
}

async function sitemapLastModGuarded(origin: URL): Promise<Date | null> {
  try {
    const res = await fetchGuarded(new URL("sitemap.xml", origin), { timeoutMs: 6_000, maxHops: 1 });
    if (res.status !== 200 || !res.html) return null;
    const dates = [...res.html.matchAll(/<lastmod>([^<]+)<\/lastmod>/gi)]
      .map((m) => new Date(m[1]))
      .filter((d) => !Number.isNaN(d.getTime()));
    return dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;
  } catch {
    return null;
  }
}

const REAL_DEPS: LightAuditDeps = { fetchPage: fetchGuarded, fetchSitemapLastMod: sitemapLastModGuarded };

export interface LightAuditResult {
  finalUrl: string | null;
  websiteClass: AuditClass;
  findings: string[];
}

/** Homepage + sitemap only — the polite, fast path used by the public tool. */
export async function runLightAudit(url: URL, deps: LightAuditDeps = REAL_DEPS): Promise<LightAuditResult> {
  let page: Awaited<ReturnType<typeof fetchGuarded>>;
  try {
    page = await deps.fetchPage(url);
  } catch {
    return { finalUrl: null, websiteClass: "DEAD", findings: ["The site could not be reached"] };
  }
  if (page.status >= 400) {
    return { finalUrl: page.finalUrl, websiteClass: "DEAD", findings: [`The site responded with HTTP ${page.status}`] };
  }
  if (matchesParkedPage(page.html)) {
    return { finalUrl: page.finalUrl, websiteClass: "PARKED", findings: ["The domain is parked or listed for sale"] };
  }
  const signals = extractPageSignals(page.html);
  const sitemapLastMod = await deps.fetchSitemapLastMod(new URL(page.finalUrl)).catch(() => null);
  const result = classifyWebsite({
    copyrightYear: signals.copyrightYear,
    hasViewport: signals.hasViewport,
    hasContactPath: signals.hasContactPath,
    platform: null, // platform is internal signal noise; never shown publicly
    emails: [], // never surface emails in public results
    websiteUri: url.toString(),
    httpStatus: page.status,
    httpsOk: page.finalUrl.startsWith("https:"),
    sitemapLastMod,
    waybackLastChange: null,
    parkedPage: false,
  });
  return { finalUrl: page.finalUrl, websiteClass: result.websiteClass, findings: result.findings };
}
```

- [ ] **Step 4: Run — expect PASS** (`npx vitest run src/lib/public`)

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "feat: light audit for the public site check"
```

---

### Task 10: Audit endpoint + `/audit` + report page + CTA

**Files:**
- Create: `src/app/api/public/audit/route.ts`, `src/app/(public)/audit/page.tsx`, `src/app/(public)/audit/audit-form.tsx`, `src/app/(public)/audit/[id]/page.tsx`, `src/app/(public)/audit/[id]/cta-form.tsx`
- Modify: nothing existing

**Interfaces:**
- Consumes: `assertPublicHttpUrl` (T7), `runLightAudit` (T9), `auditLimiter`/`auditDailyCap`/`clientIp` (T6), `ContactForm` pattern (T6 — the CTA posts to `/api/public/contact` with `source: "AUDIT_CTA"` and `auditReportId`)
- Produces: `POST /api/public/audit {url} → {id}` (429/400 otherwise); public report page `/audit/[id]`

- [ ] **Step 1: The endpoint** (`src/app/api/public/audit/route.ts`)

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toJson } from "@/lib/domain";
import { assertPublicHttpUrl, PublicUrlError } from "@/lib/public/ssrf";
import { runLightAudit } from "@/lib/public/audit-light";
import { auditDailyCap, auditLimiter, clientIp } from "@/lib/public/rate-limit";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!auditLimiter.tryAcquire(clientIp(request))) {
    return NextResponse.json({ error: "Too many checks — try again in an hour." }, { status: 429 });
  }
  if (!auditDailyCap.tryAcquire("global")) {
    return NextResponse.json({ error: "Daily check limit reached — try again tomorrow." }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as { url?: string } | null;
  let url: URL;
  try {
    url = await assertPublicHttpUrl(String(body?.url ?? ""));
  } catch (err) {
    if (err instanceof PublicUrlError) {
      return NextResponse.json({ error: err.reason }, { status: 400 });
    }
    throw err;
  }
  const result = await runLightAudit(url);
  const report = await prisma.auditReport.create({
    data: {
      url: url.toString(),
      finalUrl: result.finalUrl,
      websiteClass: result.websiteClass,
      findings: toJson(result.findings),
    },
  });
  return NextResponse.json({ id: report.id });
}
```

- [ ] **Step 2: The form + page** (`src/app/(public)/audit/audit-form.tsx`, `page.tsx`)

```tsx
// audit-form.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AuditForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/public/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !json.id) throw new Error(json.error ?? "check failed");
      router.push(`/audit/${json.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "check failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-xl flex-col gap-3 sm:flex-row">
      <Input
        value={url} onChange={(e) => setUrl(e.target.value)}
        placeholder="yourbusiness.com" inputMode="url" required className="h-11 flex-1"
      />
      <Button type="submit" size="lg" disabled={busy || !url} className="h-11">
        {busy ? "Checking… (about 15s)" : "Check my site"}
      </Button>
      {error && <p className="text-sm text-destructive sm:hidden">{error}</p>}
    </form>
  );
}
```

```tsx
// page.tsx
import { CONTENT } from "@/content/public-site";
import { AuditForm } from "./audit-form";

export const metadata = { title: "Free site check" };

export default function AuditPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20 text-center">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">What is your website telling customers?</h1>
      <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
        Enter your address. In about fifteen seconds you&apos;ll see what your site does well and what it&apos;s quietly getting wrong. No email required.
      </p>
      <div className="mt-8"><AuditForm /></div>
      <p className="mt-4 text-xs text-muted-foreground">One check at a time; we fetch only your homepage and sitemap.</p>
      <div className="mt-12 grid gap-4 text-left sm:grid-cols-3">
        {CONTENT.steps.map((s) => (
          <div key={s.title} className="rounded-lg border p-4">
            <div className="text-sm font-semibold">{s.title}</div>
            <div className="mt-1 text-xs text-muted-foreground">{s.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: The report page + CTA**

`src/app/(public)/audit/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { fromJsonArray } from "@/lib/domain";
import { getBrand } from "@/lib/public/brand";
import { CtaForm } from "./cta-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your site check", robots: { index: false, follow: false } };

const VERDICT: Record<string, { title: string; tone: "bad" | "warn" | "good"; blurb: string }> = {
  DEAD: { title: "Your website is unreachable", tone: "bad", blurb: "Customers typing your address get nothing. Every visit, and every Google search, is a lost call." },
  PARKED: { title: "Your domain is parked", tone: "bad", blurb: "The address exists but shows an ad page. Anyone who finds it leaves immediately." },
  SOCIAL_OR_DIRECTORY: { title: "That's a social page, not your website", tone: "warn", blurb: "A listing you don't own isn't a website: it ranks for its own brand, not yours, and you can't control it." },
  OUTDATED: { title: "Your website needs updating", tone: "warn", blurb: "The issues below are exactly what customers notice — and what Google penalizes." },
  OK: { title: "Your website is in good shape", tone: "good", blurb: "No significant issues found. If you want more from it — speed, leads, content — that's the next conversation." },
};

export default async function AuditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await prisma.auditReport.findUnique({ where: { id } });
  if (!report) notFound();
  const brand = await getBrand();
  const verdict = VERDICT[report.websiteClass] ?? VERDICT.OK;
  const findings = fromJsonArray(report.findings);
  const tone = verdict.tone === "bad" ? "border-destructive/40 bg-destructive/10" : verdict.tone === "warn" ? "border-yellow-600/40 bg-yellow-500/10" : "border-emerald-600/40 bg-emerald-500/10";

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-sm text-muted-foreground">Site check · {new URL(report.url).hostname}</p>
      <div className={`mt-3 rounded-xl border p-6 ${tone}`}>
        <h1 className="text-2xl font-semibold tracking-tight">{verdict.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{verdict.blurb}</p>
      </div>
      {findings.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold">What we found</h2>
          <ul className="mt-3 space-y-2">
            {findings.map((f) => (
              <li key={f} className="rounded-lg border px-4 py-3 text-sm">· {f}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-10 rounded-xl border bg-muted/30 p-6">
        <h2 className="font-semibold">Want this fixed?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {brand.name} rebuilds sites like this for a fixed price. Leave your details and we&apos;ll talk — reply within one business day.
        </p>
        <div className="mt-4"><CtaForm auditReportId={report.id} website={report.url} /></div>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">Checked {report.checkedAt.toLocaleString()} · Shareable link · {brand.name}</p>
    </div>
  );
}
```

`src/app/(public)/audit/[id]/cta-form.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CtaForm({ auditReportId, website }: { auditReportId: string; website: string }) {
  const loadedAt = useRef(Date.now());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/public/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"), email: fd.get("email"), phone: fd.get("phone"),
          website, source: "AUDIT_CTA", auditReportId,
          company_extra: fd.get("company_extra"),
          elapsedMs: Date.now() - loadedAt.current,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "submission failed");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "submission failed");
    } finally {
      setBusy(false);
    }
  }

  if (done) return <p className="text-sm">Thanks — it&apos;s in. We&apos;ll reply within one business day.</p>;

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
      <input type="text" name="company_extra" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <Input name="name" placeholder="Your name" required maxLength={120} />
      <Input name="email" type="email" placeholder="Email" required maxLength={200} />
      <Input name="phone" placeholder="Phone (optional)" maxLength={40} />
      {error && <p className="text-sm text-destructive sm:col-span-3">{error}</p>}
      <Button type="submit" disabled={busy} className="sm:col-span-1">{busy ? "Sending…" : "Get a quote"}</Button>
    </form>
  );
}
```

- [ ] **Step 4: Verify + commit**

Gates clean. Dev-server e2e: `POST /api/public/audit {"url":"example.com"}` → `{id}`; open `/audit/<id>` → report renders; submit CTA with `elapsedMs≥2500` → Inquiry row with `source=AUDIT_CTA`; `POST {"url":"http://127.0.0.1:3000"}` → 400 private; 6 rapid POSTs → 429.

```powershell
git add -A
git commit -m "feat: public free-site-check endpoint, report page, audit CTA"
```

---

### Task 11: Inbound pipeline — matching, convert, `/app/inquiries`, Dashboard card

**Files:**
- Create: `src/lib/public/matching.ts` (+`matching.test.ts`), `src/app/app/inquiries/page.tsx`, `src/app/app/inquiries/inquiries-client.tsx`, `src/app/api/inquiries/[id]/route.ts`, `src/app/api/inquiries/[id]/convert/route.ts`
- Modify: `src/app/api/public/contact/route.ts` (business matching), `src/app/app/page.tsx` (Dashboard card), `src/components/app-shell.tsx` (nav link)

**Interfaces:**
- Produces:
  - `normalizeWebsiteHost(raw: string): string | null`
  - `matchBusinessByWebsiteUrl(raw: string): Promise<string | null>` — Business.id or null
  - `POST /api/inquiries/[id]/convert` → `{ leadId, businessId }`; creates Business (`placeId: "inbound_<uuid>"`), Contact (`EMAIL`/`INBOUND`/verified), Lead (`QUEUED`, notes prefilled), Inquiry → `CONVERTED`
  - `PATCH /api/inquiries/[id]` `{ status: "CONTACTED" | "DISMISSED" | "NEW" }`

- [ ] **Step 1: Failing test** (`src/lib/public/matching.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { normalizeWebsiteHost } from "./matching";

describe("normalizeWebsiteHost", () => {
  it("normalizes scheme, www, case, and trailing paths", () => {
    expect(normalizeWebsiteHost("https://www.Example.com/some/page")).toBe("example.com");
    expect(normalizeWebsiteHost("example.com")).toBe("example.com");
    expect(normalizeWebsiteHost("http://shop.example.com")).toBe("shop.example.com");
  });
  it("returns null for garbage", () => {
    expect(normalizeWebsiteHost("not a url")).toBeNull();
    expect(normalizeWebsiteHost("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**, then implement `src/lib/public/matching.ts`:

```ts
import { prisma } from "../db";

export function normalizeWebsiteHost(raw: string): string | null {
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(candidate).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Link an inbound submission to a known Business by website host. */
export async function matchBusinessByWebsiteUrl(raw: string): Promise<string | null> {
  const host = normalizeWebsiteHost(raw);
  if (!host) return null;
  const rows = await prisma.business.findMany({
    where: { websiteUri: { not: null } },
    select: { id: true, websiteUri: true },
  });
  return rows.find((r) => normalizeWebsiteHost(r.websiteUri!) === host)?.id ?? null;
}
```

Run the test — PASS.

- [ ] **Step 3: Wire matching into the contact endpoint**

In `src/app/api/public/contact/route.ts`, after validation:

```ts
  const website = result.value.website
    ?? (result.value.auditReportId
      ? (await prisma.auditReport.findUnique({ where: { id: result.value.auditReportId }, select: { url: true } }))?.url
      : null);
  const businessId = website ? await matchBusinessByWebsiteUrl(website) : null;
```
(import `matchBusinessByWebsiteUrl`; use `website`/`businessId` in the `inquiry.create` data.)

- [ ] **Step 4: Status + convert endpoints**

`src/app/api/inquiries/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const patchSchema = z.object({
  status: z.enum(["NEW", "CONTACTED", "DISMISSED"]),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid status" }, { status: 400 });
  const inquiry = await prisma.inquiry.findUnique({ where: { id } });
  if (!inquiry) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (inquiry.status === "CONVERTED") {
    return NextResponse.json({ error: "already converted" }, { status: 400 });
  }
  await prisma.inquiry.update({ where: { id }, data: { status: parsed.data.status } });
  return NextResponse.json({ ok: true });
}
```

`src/app/api/inquiries/[id]/convert/route.ts`:

```ts
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fromJsonArray } from "@/lib/domain";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inquiry = await prisma.inquiry.findUnique({
    where: { id },
    include: { auditReport: true },
  });
  if (!inquiry) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (inquiry.status === "CONVERTED") {
    return NextResponse.json({ error: "already converted" }, { status: 400 });
  }

  const website = inquiry.website ?? inquiry.auditReport?.url ?? null;
  const findings = inquiry.auditReport ? fromJsonArray(inquiry.auditReport.findings) : [];

  // Bucket category for inbound businesses (inactive: never in Discover).
  const category = await prisma.category.upsert({
    where: { slug: "inbound" },
    update: {},
    create: { slug: "inbound", name: "Inbound", textQuery: "", propensity: 0, active: false },
  });

  const business = await prisma.business.create({
    data: {
      placeId: `inbound_${randomUUID()}`,
      name: inquiry.company || inquiry.name,
      categoryId: category.id,
      websiteUri: website,
    },
  });
  await prisma.contact.create({
    data: {
      businessId: business.id,
      type: "EMAIL",
      value: inquiry.email,
      source: "INBOUND",
      verified: true, // they gave it to us voluntarily
    },
  });
  const lead = await prisma.lead.create({
    data: {
      businessId: business.id,
      status: "QUEUED",
      notes: [
        `Inbound ${inquiry.source === "AUDIT_CTA" ? "via free site check" : "via contact form"}`,
        inquiry.auditReport ? `${inquiry.auditReport.websiteClass}: ${findings[0] ?? ""}` : "",
        inquiry.message ?? "",
      ].filter(Boolean).join(" — "),
    },
  });
  await prisma.inquiry.update({
    where: { id },
    data: { status: "CONVERTED", convertedAt: new Date(), businessId: business.id },
  });
  return NextResponse.json({ leadId: lead.id, businessId: business.id });
}
```

- [ ] **Step 5: Manager UI**

`src/app/app/inquiries/page.tsx` (server):

```tsx
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { InquiriesClient } from "./inquiries-client";

export const dynamic = "force-dynamic";

export default async function InquiriesPage() {
  const inquiries = await prisma.inquiry.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { auditReport: { select: { id: true, websiteClass: true, url: true } } },
  });
  return (
    <>
      <PageHeader title="Inquiries" description="Inbound leads from the public site — contact form and free site checks." />
      <InquiriesClient
        inquiries={inquiries.map((i) => ({
          id: i.id, name: i.name, email: i.email, phone: i.phone ?? "", company: i.company ?? "",
          website: i.website ?? i.auditReport?.url ?? "", message: i.message ?? "",
          source: i.source, status: i.status,
          auditClass: i.auditReport?.websiteClass ?? null, auditId: i.auditReport?.id ?? null,
          businessId: i.businessId ?? null,
          createdAt: i.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
```

`src/app/app/inquiries/inquiries-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface InquiryRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  website: string;
  message: string;
  source: string;
  status: string;
  auditClass: string | null;
  auditId: string | null;
  businessId: string | null;
  createdAt: string;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  NEW: "default",
  CONTACTED: "secondary",
  CONVERTED: "outline",
  DISMISSED: "destructive",
};

export function InquiriesClient({ inquiries }: { inquiries: InquiryRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function setStatus(id: string, status: "CONTACTED" | "DISMISSED" | "NEW") {
    setBusy(id);
    try {
      const res = await fetch(`/api/inquiries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "failed");
      toast.success(`Marked ${status.toLowerCase()}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(null);
    }
  }

  async function convert(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/inquiries/${id}/convert`, { method: "POST" });
      const json = (await res.json()) as { error?: string; businessId?: string };
      if (!res.ok) throw new Error(json.error ?? "failed");
      toast.success("Converted to lead");
      if (json.businessId) window.open(`/app/leads/${json.businessId}`, "_blank");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(null);
    }
  }

  if (inquiries.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No inquiries yet — they arrive from the public contact form and free site checks.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>From</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Website</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {inquiries.map((i) => (
              <TableRow key={i.id}>
                <TableCell>
                  <div className="font-medium">{i.name}</div>
                  <div className="text-xs text-muted-foreground">{i.email}{i.phone ? ` · ${i.phone}` : ""}</div>
                  {i.company && <div className="text-xs text-muted-foreground">{i.company}</div>}
                  <div className="text-xs text-muted-foreground">{new Date(i.createdAt).toLocaleString()}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{i.source === "AUDIT_CTA" ? "site check" : "contact form"}</Badge>
                  {i.auditClass && <Badge variant="outline" className="ml-1">{i.auditClass.replace(/_/g, " ").toLowerCase()}</Badge>}
                  {i.businessId && <Badge variant="outline" className="ml-1">known business</Badge>}
                </TableCell>
                <TableCell className="max-w-40 truncate text-sm">
                  {i.website ? (
                    i.auditId ? (
                      <a href={`/audit/${i.auditId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                        {i.website} <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      i.website
                    )
                  ) : ("—")}
                </TableCell>
                <TableCell className="max-w-64 truncate text-sm text-muted-foreground" title={i.message}>{i.message || "—"}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANT[i.status] ?? "secondary"}>{i.status.toLowerCase()}</Badge></TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    {i.status !== "CONVERTED" && i.status !== "DISMISSED" && (
                      <>
                        <Button size="xs" disabled={busy === i.id} onClick={() => void convert(i.id)}>Convert</Button>
                        <Button size="xs" variant="outline" disabled={busy === i.id} onClick={() => void setStatus(i.id, "CONTACTED")}>Contacted</Button>
                        <Button size="xs" variant="ghost" className="text-destructive" disabled={busy === i.id} onClick={() => void setStatus(i.id, "DISMISSED")}>Dismiss</Button>
                      </>
                    )}
                    {i.status === "DISMISSED" && (
                      <Button size="xs" variant="outline" disabled={busy === i.id} onClick={() => void setStatus(i.id, "NEW")}>Restore</Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Dashboard card + nav**

In `src/app/app/page.tsx`, add to the Promise.all: `prisma.inquiry.count({ where: { status: "NEW" } })` and render a stat card "new inquiries" linking to `/app/inquiries`. In `src/components/app-shell.tsx` NAV add `{ href: "/app/inquiries", label: "Inquiries", icon: Inbox }` (import `Inbox` from lucide-react) after Leads.

- [ ] **Step 7: Verify + commit**

Gates clean; e2e: submit an audit CTA for a URL that matches an existing Business's website → Inquiry row has `businessId` set; Convert → Business/Contact/Lead created, lead visible at `/app/leads/<id>` with notes; `/app/inquiries` lists it as CONVERTED.

```powershell
git add -A
git commit -m "feat: inbound inquiries pipeline with convert-to-lead"
```

---

### Task 12: Case studies CRUD, create-from-lead, `/results` wiring

**Files:**
- Create: `src/app/app/case-studies/page.tsx`, `src/app/app/case-studies/actions.ts`, `src/app/app/case-studies/case-studies-client.tsx`
- Modify: `src/app/app/leads/[id]/page.tsx` (create-from-lead button for WON leads)

**Interfaces:**
- Produces: server actions `saveCaseStudy(formData)`, `deleteCaseStudy(formData)`, `toggleCaseStudy(formData)`, `createCaseStudyFromLead(formData)`; CaseStudy rows power `/results` and the landing teaser (already built in Task 5)

- [ ] **Step 1: Actions** (`src/app/app/case-studies/actions.ts`)

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { toJson } from "@/lib/domain";

const caseStudySchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(160),
  summary: z.string().min(1).max(1_000),
  metrics: z.string().max(4_000).default("[]"), // JSON: [{label, value}]
  businessId: z.string().optional(),
  published: z.coerce.boolean().default(false),
  order: z.coerce.number().int().min(0).max(999).default(0),
});

export async function saveCaseStudy(formData: FormData): Promise<void> {
  const parsed = caseStudySchema.safeParse({
    id: formData.get("id") || undefined,
    title: formData.get("title"),
    summary: formData.get("summary"),
    metrics: formData.get("metrics") || "[]",
    businessId: formData.get("businessId") || undefined,
    published: formData.get("published") === "on" || formData.get("published") === "true",
    order: formData.get("order") || 0,
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "invalid case study");
  // Validate metrics JSON before storing.
  try { JSON.parse(parsed.data.metrics); } catch { throw new Error("metrics must be valid JSON"); }
  const { id, metrics, businessId, ...rest } = parsed.data;
  const data = { ...rest, metrics, businessId: businessId ?? null };
  if (id) {
    await prisma.caseStudy.update({ where: { id }, data });
  } else {
    await prisma.caseStudy.create({ data });
  }
  revalidatePath("/app/case-studies");
  revalidatePath("/results");
  revalidatePath("/");
}

export async function deleteCaseStudy(formData: FormData): Promise<void> {
  const id = z.string().parse(formData.get("id"));
  await prisma.caseStudy.delete({ where: { id } });
  revalidatePath("/app/case-studies");
  revalidatePath("/results");
  revalidatePath("/");
}

/** Draft a case study from a WON lead (button on lead detail). */
export async function createCaseStudyFromLead(formData: FormData): Promise<void> {
  const businessId = z.string().parse(formData.get("businessId"));
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, name: true, category: { select: { name: true } } },
  });
  if (!business) throw new Error("business not found");
  await prisma.caseStudy.create({
    data: {
      title: business.name,
      summary: `${business.category.name} — website rebuilt and launched.`,
      metrics: toJson([{ label: "Status", value: "Launched" }]),
      businessId: business.id,
      published: false,
      order: 0,
    },
  });
  revalidatePath("/app/case-studies");
}
```

- [ ] **Step 2: Manager page** — `src/app/app/case-studies/page.tsx`:

```tsx
import { prisma } from "@/lib/db";
import { fromJsonArray } from "@/lib/domain";
import { PageHeader } from "@/components/page-header";
import { CaseStudiesClient } from "./case-studies-client";

export const dynamic = "force-dynamic";

export default async function CaseStudiesPage() {
  const studies = await prisma.caseStudy.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    include: { business: { select: { name: true } } },
  });
  return (
    <>
      <PageHeader
        title="Case studies"
        description="Published wins appear on the public /results page and the landing teaser."
      />
      <CaseStudiesClient
        studies={studies.map((s) => ({
          id: s.id,
          title: s.title,
          summary: s.summary,
          metrics: JSON.stringify(fromJsonArray(s.metrics)),
          published: s.published,
          order: s.order,
          businessName: s.business?.name ?? null,
        }))}
      />
    </>
  );
}
```

`src/app/app/case-studies/case-studies-client.tsx` — inline-editor rows (native checkbox for `published`, matching the categories page's form-association pattern):

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deleteCaseStudy, saveCaseStudy } from "./actions";

interface StudyRow {
  id: string;
  title: string;
  summary: string;
  metrics: string; // JSON [{label, value}]
  published: boolean;
  order: number;
  businessName: string | null;
}

export function CaseStudiesClient({ studies }: { studies: StudyRow[] }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4">
          <form action={saveCaseStudy} className="grid items-end gap-3 md:grid-cols-[1.5fr_2fr_auto]">
            <div className="grid gap-1">
              <Label htmlFor="cs-title" className="text-xs">Title</Label>
              <Input id="cs-title" name="title" required maxLength={160} placeholder="Carroll Gardens Plumbing" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="cs-summary" className="text-xs">Summary</Label>
              <Input id="cs-summary" name="summary" required maxLength={1000} placeholder="Outdated site rebuilt and launched in two weeks." />
            </div>
            <Button type="submit">Add draft</Button>
          </form>
        </CardContent>
      </Card>

      {studies.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No case studies yet. Win a lead, then use "Publish as case study" on its detail page.
          </CardContent>
        </Card>
      )}

      {studies.map((s) => (
        <Card key={s.id}>
          <CardContent className="py-4">
            <form action={saveCaseStudy} id={`edit-${s.id}`}>
              <input type="hidden" name="id" value={s.id} />
              <div className="grid gap-3 md:grid-cols-[1.5fr_2fr]">
                <div className="grid gap-1">
                  <Label className="text-xs">Title{s.businessName ? ` (${s.businessName})` : ""}</Label>
                  <Input name="title" defaultValue={s.title} required maxLength={160} />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Summary</Label>
                  <Input name="summary" defaultValue={s.summary} required maxLength={1000} />
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[2fr_0.5fr_0.7fr_auto]">
                <div className="grid gap-1">
                  <Label className="text-xs">Metrics — JSON array of {"{label, value}"}</Label>
                  <Textarea name="metrics" rows={2} defaultValue={s.metrics} className="font-mono text-xs" placeholder='[{"label":"LCP","value":"1.1s"}]' />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Order</Label>
                  <Input name="order" type="number" min={0} max={999} defaultValue={s.order} />
                </div>
                <label className="flex items-end gap-2 pb-1.5 text-sm">
                  {/* Native checkbox: must associate with the row form by id (radix can't from outside). */}
                  <input type="checkbox" form={`edit-${s.id}`} name="published" defaultChecked={s.published} className="size-4 accent-foreground" />
                  Published
                </label>
                <div className="flex items-end gap-1.5">
                  <Button type="submit" form={`edit-${s.id}`} variant="outline" size="sm">Save</Button>
                </div>
              </div>
            </form>
            <form action={deleteCaseStudy} className="mt-2 flex justify-end">
              <input type="hidden" name="id" value={s.id} />
              <Button type="submit" variant="ghost" size="xs" className="text-destructive">Delete</Button>
            </form>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```
Note: the top "Add draft" form also needs a `metrics` hidden default (`<input type="hidden" name="metrics" value="[]" />`) so the schema default resolves — add it inside that form.

- [ ] **Step 3: Create-from-lead** — in `src/app/app/leads/[id]/page.tsx`, when `business.lead?.status === "WON"` render:

```tsx
<form action={createCaseStudyFromLead}>
  <input type="hidden" name="businessId" value={business.id} />
  <Button type="submit" variant="outline" size="sm">Publish as case study</Button>
</form>
```
(import from `../../case-studies/actions`).

- [ ] **Step 4: Verify + commit**

Gates clean; e2e: mark a lead WON → "Publish as case study" creates a draft → edit + publish in `/app/case-studies` → appears on `/results` and the landing teaser; unpublish removes both.

```powershell
git add -A
git commit -m "feat: case studies CRUD, create-from-lead, results wiring"
```

---

## Final verification (all phases)

1. `npm test` — full suite green (existing 106+ plus the new public tests).
2. `npx tsc --noEmit` and `npx eslint src scripts --max-warnings 0` — clean.
3. Unsigned route matrix: `/`, `/audit`, `/results`, `/contact`, `/signin` → 200; `/app/leads` → signin redirect (with `AUTH_ENABLED=true`); old `/leads` → 301 → `/app/leads`.
4. Public e2e: audit a real site → report → CTA → Inquiry → Convert → QUEUED lead.
5. `npm run build` — production build passes.
