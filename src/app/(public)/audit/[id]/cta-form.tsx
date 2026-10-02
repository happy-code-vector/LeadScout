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
