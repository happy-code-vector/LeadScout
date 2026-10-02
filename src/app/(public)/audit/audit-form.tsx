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
    <form onSubmit={submit} className="mx-auto grid max-w-xl gap-3 sm:grid-cols-[1fr_auto]">
      <Input
        value={url} onChange={(e) => setUrl(e.target.value)}
        placeholder="yourbusiness.com" inputMode="url" required className="h-11"
      />
      <Button type="submit" size="lg" disabled={busy || !url} className="h-11">
        {busy ? "Checking… (about 15s)" : "Check my site"}
      </Button>
      {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
    </form>
  );
}
