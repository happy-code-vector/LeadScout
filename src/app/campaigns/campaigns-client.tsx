"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { GripVertical, Pause, Play, Plus, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface CampaignRow {
  id: string;
  name: string;
  mode: string;
  channelOrder: string[];
  filters: {
    tiers?: string[];
    categorySlugs?: string[];
    areas?: string[];
    websiteClasses?: string[];
  };
  sequenceId: string | null;
  sequenceName: string | null;
  mailboxId: string | null;
  mailboxLabel: string | null;
  dailyLimit: number;
  sendWindow: { startHour: number; endHour: number; daysOfWeek: number[] };
  status: string;
  addedLeads: number;
  stats: Record<string, number>;
}

interface EditorState {
  id?: string;
  name: string;
  mode: "MANUAL" | "AUTO";
  channelOrder: string[];
  tiers: string[];
  categorySlugs: string[];
  areas: string[];
  websiteClasses: string[];
  sequenceId: string;
  mailboxId: string;
  dailyLimit: number;
  startHour: number;
  endHour: number;
  daysOfWeek: number[];
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEBSITE_CLASSES = ["NONE", "SOCIAL_OR_DIRECTORY", "DEAD", "PARKED", "OUTDATED", "OK"];
const CLASS_LABEL: Record<string, string> = {
  NONE: "No site", SOCIAL_OR_DIRECTORY: "Social only", DEAD: "Dead", PARKED: "Parked",
  OUTDATED: "Outdated", OK: "OK",
};

function emptyEditor(): EditorState {
  return {
    name: "",
    mode: "AUTO",
    channelOrder: ["EMAIL", "POSTAL", "PHONE"],
    tiers: ["A", "B"],
    categorySlugs: [],
    areas: [],
    websiteClasses: [],
    sequenceId: "",
    mailboxId: "",
    dailyLimit: 50,
    startHour: 9,
    endHour: 16,
    daysOfWeek: [1, 2, 3, 4, 5],
  };
}

export function CampaignsClient({
  campaigns,
  sequences,
  mailboxes,
  categories,
  areas,
  senderReady,
}: {
  campaigns: CampaignRow[];
  sequences: { id: string; name: string; steps: { order: number; channel: string; delayDays: number }[] }[];
  mailboxes: { id: string; label: string }[];
  categories: { slug: string; name: string }[];
  areas: string[];
  senderReady: boolean;
}) {
  const router = useRouter();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [poolCount, setPoolCount] = useState<number | null>(null);
  const dragFrom = useRef<number | null>(null);

  const filtersPayload = useMemo(
    () => ({
      tiers: editor?.tiers.length ? editor.tiers : undefined,
      categorySlugs: editor?.categorySlugs.length ? editor.categorySlugs : undefined,
      areas: editor?.areas.length ? editor.areas : undefined,
      websiteClasses: editor?.websiteClasses.length ? editor.websiteClasses : undefined,
    }),
    [editor],
  );

  async function refreshCount() {
    if (!editor) return;
    try {
      const res = await fetch("/api/campaigns", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filtersPayload),
      });
      const json = (await res.json()) as { count?: number };
      setPoolCount(json.count ?? null);
    } catch {
      setPoolCount(null);
    }
  }

  function openCreate() {
    setEditor(emptyEditor());
    setPoolCount(null);
  }

  function openEdit(c: CampaignRow) {
    setEditor({
      id: c.id,
      name: c.name,
      mode: c.mode as "MANUAL" | "AUTO",
      channelOrder: c.channelOrder,
      tiers: c.filters.tiers ?? ["A", "B"],
      categorySlugs: c.filters.categorySlugs ?? [],
      areas: c.filters.areas ?? [],
      websiteClasses: c.filters.websiteClasses ?? [],
      sequenceId: c.sequenceId ?? "",
      mailboxId: c.mailboxId ?? "",
      dailyLimit: c.dailyLimit,
      startHour: c.sendWindow.startHour,
      endHour: c.sendWindow.endHour,
      daysOfWeek: c.sendWindow.daysOfWeek,
    });
    setPoolCount(null);
  }

  async function save() {
    if (!editor) return;
    setSaving(true);
    try {
      const payload = {
        name: editor.name,
        mode: editor.mode,
        channelOrder: editor.channelOrder,
        filters: filtersPayload,
        sequenceId: editor.sequenceId || null,
        mailboxId: editor.mailboxId || null,
        dailyLimit: editor.dailyLimit,
        sendWindow: {
          startHour: editor.startHour,
          endHour: editor.endHour,
          daysOfWeek: editor.daysOfWeek,
        },
      };
      const res = await fetch(editor.id ? `/api/campaigns/${editor.id}` : "/api/campaigns", {
        method: editor.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "save failed");
      toast.success(editor.id ? "Campaign updated" : "Campaign created");
      setEditor(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  async function control(id: string, control: "start" | "pause" | "resume" | "stop") {
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ control }),
      });
      const json = (await res.json()) as { error?: string; scheduled?: number };
      if (!res.ok) throw new Error(json.error ?? "action failed");
      toast.success(
        control === "start" ? `Started — ${json.scheduled ?? 0} leads scheduled` : `Campaign ${control}ed`,
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "action failed");
    }
  }

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <div className="space-y-4">
      {!senderReady && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Set your sender name and postal address in <Link href="/settings" className="underline">Settings</Link> before
          starting any campaign (CAN-SPAM requirement).
        </p>
      )}

      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="size-4" data-icon="inline-start" />
          New campaign
        </Button>
      </div>

      {campaigns.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No campaigns yet.
          </CardContent>
        </Card>
      )}

      {campaigns.map((c) => (
        <Card key={c.id}>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                {c.name}
                <Badge variant={c.mode === "AUTO" ? "default" : "secondary"}>{c.mode}</Badge>
                <Badge
                  variant={
                    c.status === "RUNNING" ? "default" : c.status === "PAUSED" ? "outline" : "secondary"
                  }
                >
                  {c.status}
                </Badge>
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {c.channelOrder.join(" → ").toLowerCase()}
                {c.sequenceName ? ` · ${c.sequenceName}` : ""}
                {c.mailboxLabel ? ` · ${c.mailboxLabel}` : ""}
                {` · ≤${c.dailyLimit}/day`}
                {` · ${c.sendWindow.startHour}:00–${c.sendWindow.endHour}:00 local`}
                {c.addedLeads > 0 ? ` · +${c.addedLeads} added` : ""}
              </p>
            </div>
            <div className="flex gap-1.5">
              {c.status !== "RUNNING" && c.status !== "STOPPED" && (
                <Button size="sm" onClick={() => void control(c.id, "start")} disabled={!senderReady}>
                  <Play className="size-3.5" data-icon="inline-start" />
                  {c.status === "PAUSED" ? "Resume" : "Start"}
                </Button>
              )}
              {c.status === "RUNNING" && (
                <Button size="sm" variant="outline" onClick={() => void control(c.id, "pause")}>
                  <Pause className="size-3.5" data-icon="inline-start" />
                  Pause
                </Button>
              )}
              {c.status !== "STOPPED" && (
                <Button size="sm" variant="destructive" onClick={() => void control(c.id, "stop")}>
                  <Square className="size-3.5" data-icon="inline-start" />
                  Stop
                </Button>
              )}
              {c.status !== "RUNNING" && (
                <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                  Edit
                </Button>
              )}
            </div>
          </CardHeader>
          {Object.keys(c.stats).length > 0 && (
            <CardContent className="flex flex-wrap gap-2 border-t pt-3 text-xs text-muted-foreground">
              {Object.entries(c.stats).map(([status, count]) => (
                <Badge key={status} variant="outline">
                  {status.toLowerCase()}: {count}
                </Badge>
              ))}
            </CardContent>
          )}
        </Card>
      ))}

      <Dialog open={editor !== null} onOpenChange={(o) => !o && setEditor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editor?.id ? "Edit campaign" : "New campaign"}</DialogTitle>
            <DialogDescription>
              Auto campaigns send inside the window, in the recipient&rsquo;s local time,
              respecting mailbox warmup and daily limits.
            </DialogDescription>
          </DialogHeader>

          {editor && (
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="c-name">Name</Label>
                  <Input
                    id="c-name"
                    value={editor.name}
                    onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                    placeholder="Plumbers — no website — spring"
                  />
                </div>
                <div className="grid gap-1">
                  <Label>Mode</Label>
                  <Select
                    value={editor.mode}
                    onValueChange={(v) => setEditor({ ...editor, mode: v as "MANUAL" | "AUTO" })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AUTO">Auto — sequences send themselves</SelectItem>
                      <SelectItem value="MANUAL">Manual — lists, CSV, call sheets</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-1">
                <Label>Channel order (drag to reorder)</Label>
                <div className="flex flex-col gap-1.5">
                  {editor.channelOrder.map((ch, i) => (
                    <div
                      key={ch}
                      draggable
                      onDragStart={() => (dragFrom.current = i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragFrom.current === null || dragFrom.current === i) return;
                        const next = [...editor.channelOrder];
                        const [moved] = next.splice(dragFrom.current, 1);
                        next.splice(i, 0, moved);
                        dragFrom.current = null;
                        setEditor({ ...editor, channelOrder: next });
                      }}
                      className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
                    >
                      <GripVertical className="size-3.5 cursor-grab text-muted-foreground" />
                      <span className="w-16">{ch}</span>
                      <span className="text-xs text-muted-foreground">
                        {ch === "EMAIL"
                          ? "verified or website-sourced email needed"
                          : ch === "POSTAL"
                            ? "address + Lob key needed"
                            : "phone number needed; creates a manual call task"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-1">
                <div className="flex items-center justify-between">
                  <Label>Filters</Label>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline underline-offset-2"
                    onClick={() => void refreshCount()}
                  >
                    {poolCount === null ? "Count matching leads" : `${poolCount} leads match`}
                  </button>
                </div>
                <div className="space-y-2 rounded-md border p-3">
                  <div className="flex flex-wrap gap-3">
                    {["A", "B", "C", "D"].map((t) => (
                      <label key={t} className="flex items-center gap-1.5 text-sm">
                        <Checkbox
                          checked={editor.tiers.includes(t)}
                          onCheckedChange={() =>
                            setEditor({ ...editor, tiers: toggle(editor.tiers, t) })
                          }
                        />
                        Tier {t}
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {WEBSITE_CLASSES.map((w) => (
                      <label key={w} className="flex items-center gap-1.5 text-sm">
                        <Checkbox
                          checked={editor.websiteClasses.includes(w)}
                          onCheckedChange={() =>
                            setEditor({ ...editor, websiteClasses: toggle(editor.websiteClasses, w) })
                          }
                        />
                        {CLASS_LABEL[w]}
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {categories.map((cat) => (
                      <label key={cat.slug} className="flex items-center gap-1.5 text-sm">
                        <Checkbox
                          checked={editor.categorySlugs.includes(cat.slug)}
                          onCheckedChange={() =>
                            setEditor({ ...editor, categorySlugs: toggle(editor.categorySlugs, cat.slug) })
                          }
                        />
                        {cat.name}
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {areas.map((a) => (
                      <label key={a} className="flex items-center gap-1.5 text-sm">
                        <Checkbox
                          checked={editor.areas.includes(a)}
                          onCheckedChange={() => setEditor({ ...editor, areas: toggle(editor.areas, a) })}
                        />
                        {a}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {editor.mode === "AUTO" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1">
                    <Label>Sequence</Label>
                    <Select
                      value={editor.sequenceId}
                      onValueChange={(v) => setEditor({ ...editor, sequenceId: v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                      <SelectContent>
                        {sequences.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} ({s.steps.map((st) => `d${st.delayDays}`).join(", ")})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1">
                    <Label>Mailbox</Label>
                    <Select
                      value={editor.mailboxId}
                      onValueChange={(v) => setEditor({ ...editor, mailboxId: v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                      <SelectContent>
                        {mailboxes.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-4 items-end gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="c-limit">Daily limit</Label>
                  <Input
                    id="c-limit"
                    type="number"
                    min={1}
                    value={editor.dailyLimit}
                    onChange={(e) => setEditor({ ...editor, dailyLimit: Number(e.target.value) })}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="c-start">From (hour)</Label>
                  <Input
                    id="c-start"
                    type="number"
                    min={0}
                    max={23}
                    value={editor.startHour}
                    onChange={(e) => setEditor({ ...editor, startHour: Number(e.target.value) })}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="c-end">To (hour)</Label>
                  <Input
                    id="c-end"
                    type="number"
                    min={1}
                    max={24}
                    value={editor.endHour}
                    onChange={(e) => setEditor({ ...editor, endHour: Number(e.target.value) })}
                  />
                </div>
                <div className="grid gap-1 text-xs">
                  <span className="font-medium">Days</span>
                  <div className="flex gap-1">
                    {DAYS.map((d, i) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          setEditor({
                            ...editor,
                            daysOfWeek: editor.daysOfWeek.includes(i)
                              ? editor.daysOfWeek.filter((x) => x !== i)
                              : [...editor.daysOfWeek, i],
                          })
                        }
                        className={`rounded px-1.5 py-1 ${editor.daysOfWeek.includes(i) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                      >
                        {d[0]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => void save()} disabled={saving || !editor?.name}>
              {saving ? "Saving…" : editor?.id ? "Save changes" : "Create campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
