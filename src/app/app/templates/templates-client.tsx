"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

interface TemplateRow {
  id: string;
  name: string;
  channel: string;
  subject: string | null;
  body: string;
  variant: string | null;
  inSequence: number;
}

const VARIABLES = [
  "businessName", "category", "neighborhood", "reviewCount", "rating",
  "topFinding", "senderName", "unsubscribeUrl", "senderPostalAddress",
];

export function TemplatesClient({
  templates,
  previewLeads,
}: {
  templates: TemplateRow[];
  previewLeads: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<TemplateRow | null>(templates[0] ?? null);
  const [draft, setDraft] = useState<TemplateRow | null>(templates[0] ?? null);
  const [previewLeadId, setPreviewLeadId] = useState<string>(previewLeads[0]?.id ?? "");
  const [preview, setPreview] = useState<{ subject: string | null; body: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function selectTemplate(t: TemplateRow) {
    setSelected(t);
    setDraft({ ...t });
    setPreview(null);
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      const res = await fetch(draft.id ? `/api/templates/${draft.id}` : "/api/templates", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          channel: draft.channel,
          subject: draft.subject,
          body: draft.body,
          variant: draft.variant,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "save failed");
      toast.success("Template saved");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "delete failed");
      toast.success("Template deleted");
      setSelected(null);
      setDraft(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "delete failed");
    }
  }

  async function renderPreview() {
    if (!draft) return;
    setBusy(true);
    try {
      const res = await fetch("/api/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: draft.id,
          subject: draft.subject,
          body: draft.body,
          leadBusinessId: previewLeadId || undefined,
        }),
      });
      const json = (await res.json()) as { error?: string; subject?: string | null; body?: string };
      if (!res.ok) throw new Error(json.error ?? "preview failed");
      setPreview({ subject: json.subject ?? null, body: json.body ?? "" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "preview failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <div className="space-y-1.5">
        <Button
          variant="outline"
          size="sm"
          className="mb-1 w-full"
          onClick={() => {
            setSelected(null);
            setDraft({
              id: "",
              name: "",
              channel: "EMAIL",
              subject: "",
              body: "",
              variant: "",
              inSequence: 0,
            });
            setPreview(null);
          }}
        >
          New template
        </Button>
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => selectTemplate(t)}
            className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
              selected?.id === t.id ? "border-primary bg-muted" : "hover:bg-muted/60"
            }`}
          >
            <div className="font-medium">{t.name}</div>
            <div className="text-xs text-muted-foreground">
              {t.channel.toLowerCase()}
              {t.variant ? ` · ${t.variant}` : ""}
              {t.inSequence > 0 ? ` · in ${t.inSequence} step${t.inSequence > 1 ? "s" : ""}` : ""}
            </div>
          </button>
        ))}
      </div>

      {draft ? (
        <Tabs defaultValue="edit">
          <TabsList>
            <TabsTrigger value="edit">Edit</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
          <TabsContent value="edit" className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="t-name">Name</Label>
                <Input id="t-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div className="grid gap-1">
                <Label>Channel</Label>
                <Select value={draft.channel} onValueChange={(v) => setDraft({ ...draft, channel: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EMAIL">Email</SelectItem>
                    <SelectItem value="POSTAL">Postcard</SelectItem>
                    <SelectItem value="PHONE">Call script</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="t-subject">Subject {draft.channel === "EMAIL" ? "" : "(unused)"}</Label>
                <Input
                  id="t-subject"
                  value={draft.subject ?? ""}
                  onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                  placeholder="{{businessName}} — quick question"
                  disabled={draft.channel !== "EMAIL"}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="t-variant">Variant label (A/B tests)</Label>
                <Input
                  id="t-variant"
                  value={draft.variant ?? ""}
                  onChange={(e) => setDraft({ ...draft, variant: e.target.value })}
                  placeholder="outdated / no-website / b"
                />
              </div>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="t-body">Body (Handlebars)</Label>
              <Textarea
                id="t-body"
                rows={16}
                className="font-mono text-xs"
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Variables: {VARIABLES.map((v) => `{{${v}}}`).join("  ")}
              </p>
            </div>
            <div className="flex justify-between">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => draft.id && void remove(draft.id)}
                disabled={!draft.id || draft.inSequence > 0}
              >
                Delete
              </Button>
              <Button size="sm" onClick={() => void save()} disabled={busy || !draft.name || !draft.body}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="preview" className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-1">
                <Label>Preview against</Label>
                <Select value={previewLeadId} onValueChange={setPreviewLeadId}>
                  <SelectTrigger className="w-64"><SelectValue placeholder="Pick a lead…" /></SelectTrigger>
                  <SelectContent>
                    {previewLeads.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="sm" onClick={() => void renderPreview()} disabled={busy}>
                Render preview
              </Button>
            </div>
            {preview && (
              <Card>
                <CardContent className="space-y-2 py-4 text-sm">
                  {preview.subject && (
                    <p className="font-medium">Subject: {preview.subject}</p>
                  )}
                  <Separator />
                  <pre className="whitespace-pre-wrap font-sans">{preview.body}</pre>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Select a template or create a new one.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
