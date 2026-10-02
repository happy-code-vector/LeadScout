"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { ScoringWeights } from "@/lib/scoring/weights";

interface MailboxRow {
  id: string;
  label: string;
  smtpHost: string;
  smtpPort: number;
  imapHost: string;
  imapPort: number;
  user: string;
  fromName: string | null;
  dailyLimit: number;
  warmupStartDate: string | null;
  active: boolean;
}

export function SettingsClient({
  senderName: initialName,
  senderPostalAddress: initialAddress,
  placesCap: initialCap,
  auditConcurrency: initialConcurrency,
  weights: initialWeights,
  mailboxes,
  connections,
}: {
  senderName: string;
  senderPostalAddress: string;
  placesCap: number;
  auditConcurrency: number;
  weights: ScoringWeights;
  mailboxes: MailboxRow[];
  connections: Record<string, string>;
}) {
  const router = useRouter();
  const [senderName, setSenderName] = useState(initialName);
  const [senderPostalAddress, setSenderPostalAddress] = useState(initialAddress);
  const [placesCap, setPlacesCap] = useState(initialCap);
  const [auditConcurrency, setAuditConcurrency] = useState(initialConcurrency);
  const [weights, setWeights] = useState<ScoringWeights>(initialWeights);
  const [busy, setBusy] = useState("");

  const [mailbox, setMailbox] = useState({
    label: "",
    smtpHost: "localhost",
    smtpPort: 1025,
    imapHost: "",
    imapPort: 993,
    user: "",
    password: "",
    fromName: "",
    dailyLimit: 40,
  });
  const [testTo, setTestTo] = useState("");

  async function patch(payload: Record<string, unknown>, key: string, done: string) {
    setBusy(key);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "save failed");
      toast.success(done);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy("");
    }
  }

  async function addMailbox() {
    setBusy("mailbox");
    try {
      const res = await fetch("/api/mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...mailbox,
          fromName: mailbox.fromName || null,
          warmupStartDate: new Date().toISOString(),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "failed");
      toast.success("Mailbox added");
      setMailbox({ ...mailbox, label: "", user: "", password: "" });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy("");
    }
  }

  async function testMailbox(id: string) {
    if (!testTo) {
      toast.error("Enter a test address first");
      return;
    }
    setBusy(`test-${id}`);
    try {
      const res = await fetch(`/api/mailboxes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testTo }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "send failed");
      toast.success("Test email sent — check the inbox");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "send failed");
    } finally {
      setBusy("");
    }
  }

  async function deleteMailbox(id: string) {
    try {
      const res = await fetch(`/api/mailboxes/${id}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "failed");
      toast.success("Mailbox deleted");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "failed");
    }
  }

  function setWeight(path: string, value: number) {
    setWeights((w) => {
      const next = structuredClone(w) as unknown as ScoringWeights;
      const parts = path.split(".");
      let obj: Record<string, unknown> = next as unknown as Record<string, unknown>;
      for (let i = 0; i < parts.length - 1; i++) {
        obj = obj[parts[i]] as Record<string, unknown>;
      }
      obj[parts[parts.length - 1]] = value;
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sender identity (CAN-SPAM — required before campaigns)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-1">
              <Label htmlFor="s-name">Sender name</Label>
              <Input id="s-name" value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Alex Rivera" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="s-addr">Postal address (goes in every email footer)</Label>
              <Input id="s-addr" value={senderPostalAddress} onChange={(e) => setSenderPostalAddress(e.target.value)} placeholder="123 4th St, Brooklyn, NY 11215" />
            </div>
          </div>
          <Button size="sm" disabled={busy === "sender"} onClick={() => void patch({ senderName, senderPostalAddress }, "sender", "Sender identity saved")}>
            Save identity
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mailboxes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {mailboxes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No mailboxes. For local testing use <code className="rounded bg-muted px-1">localhost:1025</code> (the
              dev sink from <code className="rounded bg-muted px-1">npm run maildump</code>).
            </p>
          )}
          {mailboxes.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
              <div className="text-sm">
                <span className="font-medium">{m.label}</span>{" "}
                <span className="text-muted-foreground">
                  {m.user} · smtp {m.smtpHost}:{m.smtpPort} · imap {m.imapHost}:{m.imapPort}
                </span>
                <div className="text-xs text-muted-foreground">
                  limit {m.dailyLimit}/day · warmup since {m.warmupStartDate?.slice(0, 10) ?? "—"}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Input placeholder="test@address" className="h-7 w-40" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                <Button size="sm" variant="outline" disabled={busy === `test-${m.id}`} onClick={() => void testMailbox(m.id)}>
                  <Send className="size-3.5" data-icon="inline-start" />
                  Send test
                </Button>
                <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => void deleteMailbox(m.id)} aria-label="Delete mailbox">
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
          <Separator />
          <div className="grid gap-3 md:grid-cols-4">
            {([
              ["label", "Label", "Main inbox"],
              ["smtpHost", "SMTP host", "localhost"],
              ["user", "Username / from", "owner@leadscout.test"],
              ["password", "Password", "••••"],
              ["imapHost", "IMAP host", "localhost"],
              ["fromName", "From name (optional)", "Alex Rivera"],
            ] as const).map(([key, label, placeholder]) => (
              <div key={key} className="grid gap-1">
                <Label htmlFor={`m-${key}`} className="text-xs">{label}</Label>
                <Input
                  id={`m-${key}`}
                  type={key === "password" ? "password" : "text"}
                  className="h-8"
                  placeholder={placeholder}
                  value={mailbox[key]}
                  onChange={(e) => setMailbox({ ...mailbox, [key]: e.target.value })}
                />
              </div>
            ))}
            {([
              ["smtpPort", "SMTP port"],
              ["imapPort", "IMAP port"],
              ["dailyLimit", "Daily limit"],
            ] as const).map(([key, label]) => (
              <div key={key} className="grid gap-1">
                <Label htmlFor={`m-${key}`} className="text-xs">{label}</Label>
                <Input
                  id={`m-${key}`}
                  type="number"
                  className="h-8"
                  value={mailbox[key]}
                  onChange={(e) => setMailbox({ ...mailbox, [key]: Number(e.target.value) })}
                />
              </div>
            ))}
          </div>
          <Button size="sm" disabled={busy === "mailbox" || !mailbox.label || !mailbox.smtpHost || !mailbox.user || !mailbox.password} onClick={() => void addMailbox()}>
            Add mailbox
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scoring weights</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            {([
              ["need.none", "Need — no website"],
              ["need.socialOrDirectory", "Need — social only"],
              ["need.dead", "Need — dead site"],
              ["need.parked", "Need — parked"],
              ["need.withSiteCap", "Need — signals cap"],
              ["need.signals.oldCopyright", "Signal — old copyright"],
              ["need.signals.noViewport", "Signal — no viewport"],
              ["need.signals.staleContent", "Signal — stale content"],
              ["need.signals.noHttps", "Signal — no HTTPS"],
              ["need.signals.noContactPath", "Signal — no contact path"],
              ["viability.reviews.zero", "Reviews — 0"],
              ["viability.reviews.oneToNine", "Reviews — 1–9"],
              ["viability.reviews.tenToFortyNine", "Reviews — 10–49"],
              ["viability.reviews.fiftyToOneNinetyNine", "Reviews — 50–199"],
              ["viability.reviews.twoHundredPlus", "Reviews — 200+"],
              ["viability.lowRatingPenalty", "Low rating penalty"],
              ["reachability.email", "Reach — email"],
              ["reachability.phone", "Reach — phone"],
              ["reachability.postal", "Reach — postal"],
              ["reachability.cap", "Reach — cap"],
              ["tiers.A", "Tier A ≥"],
              ["tiers.B", "Tier B ≥"],
              ["tiers.C", "Tier C ≥"],
            ] as const).map(([path, label]) => (
              <div key={path} className="grid gap-1">
                <Label htmlFor={`w-${path}`} className="text-xs">{label}</Label>
                <Input
                  id={`w-${path}`}
                  type="number"
                  className="h-8"
                  value={path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], weights) as number}
                  onChange={(e) => setWeight(path, Number(e.target.value))}
                />
              </div>
            ))}
          </div>
          <Button
            size="sm"
            disabled={busy === "weights"}
            onClick={() => void patch({ scoringWeights: weights }, "weights", "Weights saved — rescoring in the background")}
          >
            <RefreshCw className="size-3.5" data-icon="inline-start" />
            Save weights &amp; rescore all
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Limits</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1">
            <Label htmlFor="s-cap">Places monthly request cap (1,000 = free tier)</Label>
            <Input id="s-cap" type="number" className="h-8" value={placesCap} onChange={(e) => setPlacesCap(Number(e.target.value))} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="s-conc">Audit concurrency</Label>
            <Input id="s-conc" type="number" min={1} max={32} className="h-8" value={auditConcurrency} onChange={(e) => setAuditConcurrency(Number(e.target.value))} />
          </div>
          <Button size="sm" className="justify-self-start" disabled={busy === "limits"} onClick={() => void patch({ placesMonthlyRequestCap: placesCap, auditConcurrency }, "limits", "Limits saved")}>
            Save limits
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connection status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          {Object.entries(connections).map(([k, v]) => (
            <p key={k}>
              <Badge variant="outline" className="mr-2 w-20 justify-center">{k}</Badge>
              {v}
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
