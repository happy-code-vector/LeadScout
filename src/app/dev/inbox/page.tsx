"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface SinkMessage {
  ts: string;
  from: string;
  to: string;
  subject: string;
  messageId: string;
  inReplyTo: string;
  headers: Record<string, string>;
  text: string;
}

const SINK_URL = "http://localhost:8025/messages";

export default function DevInboxPage() {
  const [messages, setMessages] = useState<SinkMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(SINK_URL, { cache: "no-store" });
      const json = (await res.json()) as { messages: SinkMessage[] };
      setMessages(json.messages ?? []);
      setError(null);
    } catch {
      setError("Cannot reach the sink — is `npm run maildump` running?");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5_000);
    return () => clearInterval(t);
  }, [load]);

  async function clear() {
    await fetch(SINK_URL, { method: "DELETE" }).catch(() => {});
    void load();
  }

  const shown = messages.filter(
    (m) =>
      !filter ||
      `${m.subject} ${m.to} ${m.from}`.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <>
      <PageHeader title="Dev inbox" description="Messages captured by the local SMTP sink (npm run maildump).">
        <Input placeholder="Filter…" className="h-8 w-48" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <Button variant="outline" size="sm" onClick={() => void load()}>Refresh</Button>
        <Button variant="outline" size="sm" onClick={() => void clear()}>Clear</Button>
      </PageHeader>

      {error && (
        <p className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="space-y-3">
        {shown.length === 0 && !error && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No messages captured yet.
            </CardContent>
          </Card>
        )}
        {shown.map((m, i) => (
          <Card key={`${m.messageId}-${i}`}>
            <CardContent className="space-y-2 py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">{m.subject || "(no subject)"}</p>
                <p className="text-xs text-muted-foreground">{new Date(m.ts).toLocaleString()}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {m.from} → {m.to}
                {m.inReplyTo ? ` · in-reply-to ${m.inReplyTo}` : ""}
              </p>
              {m.headers["list-unsubscribe"] && (
                <p className="text-xs text-muted-foreground">
                  List-Unsubscribe: {m.headers["list-unsubscribe"]}
                </p>
              )}
              <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/60 p-3 font-sans">
                {m.text}
              </pre>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
