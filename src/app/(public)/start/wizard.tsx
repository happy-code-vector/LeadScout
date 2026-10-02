"use client";

import { useRef, useState } from "react";
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
  // Ref mirror of `audit` so submit() and guards see a late-arriving audit id
  // without depending on a re-render having happened.
  const auditRef = useRef(audit);
  const auditInFlight = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function fireBackgroundAudit(url: string) {
    if (auditInFlight.current || auditRef.current?.id || !url.trim()) return;
    auditInFlight.current = true;
    fetch("/api/public/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("audit failed"))))
      .then((j: { id?: string; websiteClass?: string; finding?: string | null }) => {
        if (!j.id) return;
        const next = { id: j.id, websiteClass: j.websiteClass, finding: j.finding ?? undefined };
        auditRef.current = next;
        setAudit(next);
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
          auditReportId: auditRef.current?.id ?? undefined,
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
