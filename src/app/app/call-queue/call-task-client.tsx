"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const OUTCOMES = [
  { value: "NO_ANSWER", label: "No answer" },
  { value: "VOICEMAIL", label: "Voicemail" },
  { value: "INTERESTED", label: "Interested" },
  { value: "NOT_INTERESTED", label: "Not interested" },
  { value: "CALL_BACK", label: "Call back" },
  { value: "DO_NOT_CALL", label: "Do not call" },
] as const;

export function CallTaskClient({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function logOutcome(outcome: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/call-tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome, notes: notes || undefined }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "failed to log outcome");
      toast.success(`Logged: ${outcome.replace(/_/g, " ").toLowerCase()}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "failed to log outcome");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Notes (optional)…"
        className="h-8 w-56"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      {OUTCOMES.map((o) => (
        <Button
          key={o.value}
          size="sm"
          variant={
            o.value === "INTERESTED"
              ? "default"
              : o.value === "DO_NOT_CALL" || o.value === "NOT_INTERESTED"
                ? "destructive"
                : "outline"
          }
          disabled={busy}
          onClick={() => void logOutcome(o.value)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}
