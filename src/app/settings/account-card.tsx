"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AccountCard({ email }: { email: string }) {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.ok) {
        setMessage({ kind: "ok", text: "Password updated." });
        setCurrent("");
        setNew("");
      } else {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setMessage({ kind: "err", text: data?.error ?? "Update failed." });
      }
    } catch {
      setMessage({
        kind: "err",
        text: "Could not reach the server — check your connection and try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>
          Signed in as {email}. Changes take effect on your next sign-in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="max-w-sm space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password (min 8 characters)</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNew(e.target.value)}
            />
          </div>
          {message ? (
            <p className={`text-sm ${message.kind === "ok" ? "text-muted-foreground" : "text-destructive"}`}>
              {message.text}
            </p>
          ) : null}
          <Button type="submit" disabled={busy}>
            {busy ? "Updating…" : "Change password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
