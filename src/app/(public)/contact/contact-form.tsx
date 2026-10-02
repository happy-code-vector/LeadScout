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
