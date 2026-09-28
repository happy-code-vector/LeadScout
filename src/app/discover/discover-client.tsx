"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Radar } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { estimateBilledRequests } from "@/lib/discovery/tiler";

export interface DiscoverData {
  categories: { id: string; name: string; textQuery: string; propensity: number }[];
  areas: {
    id: string;
    name: string;
    city: string;
    state: string;
    south: number;
    west: number;
    north: number;
    east: number;
  }[];
  usage: { used: number; cap: number; estimatedSpend: number };
  runs: {
    id: string;
    status: string;
    requestsUsed: number;
    placesFound: number;
    newPlaces: number;
    startedAt: string;
    finishedAt: string | null;
  }[];
  mockMode: boolean;
}

interface RunState {
  id: string;
  status: string;
  requestsUsed: number;
  placesFound: number;
  newPlaces: number;
  error?: string | null;
}

export function DiscoverClient({ data }: { data: DiscoverData }) {
  const router = useRouter();
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedAreas, setSelectedAreas] = useState<Set<string>>(new Set());
  const [starting, setStarting] = useState(false);
  const [run, setRun] = useState<RunState | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Live progress: poll the run row until the worker finishes it.
  const poll = useCallback(
    (runId: string) => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/discover?runId=${runId}`, { cache: "no-store" });
          if (!res.ok) return;
          const json = (await res.json()) as { run: RunState };
          setRun(json.run);
          if (json.run.status !== "RUNNING") {
            if (pollRef.current) clearInterval(pollRef.current);
            if (json.run.status === "COMPLETED") {
              toast.success(
                `Discovery complete: ${json.run.placesFound} places, ${json.run.newPlaces} new`,
              );
            } else if (json.run.status === "CAP_REACHED") {
              toast.warning(`Stopped at the request cap: ${json.run.error ?? ""}`);
            } else if (json.run.status === "FAILED") {
              toast.error(`Discovery failed: ${json.run.error ?? "unknown error"}`);
            }
            router.refresh();
          }
        } catch {
          // transient fetch error — keep polling
        }
      }, 1500);
    },
    [router],
  );

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };

  const estimate = useMemo(() => {
    // Rough pre-run estimate: the probe pass is free; billed requests are
    // leaf tiles × pages. Shown as a hint only — the cap is the real guard.
    const perArea = data.areas
      .filter((a) => selectedAreas.has(a.id))
      .reduce(
        (sum, a) => sum + estimateBilledRequests({ south: a.south, west: a.west, north: a.north, east: a.east }),
        0,
      );
    return selectedCategories.size * perArea;
  }, [selectedAreas, selectedCategories, data.areas]);

  const busy = run?.status === "RUNNING" || starting;

  async function startRun() {
    setStarting(true);
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryIds: [...selectedCategories],
          areaIds: [...selectedAreas],
        }),
      });
      const json = (await res.json()) as { runId?: string; error?: string };
      if (!res.ok || !json.runId) throw new Error(json.error ?? "failed to start");
      setRun({
        id: json.runId,
        status: "RUNNING",
        requestsUsed: 0,
        placesFound: 0,
        newPlaces: 0,
      });
      poll(json.runId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "failed to start");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {data.mockMode ? (
          <Badge variant="secondary">Mock mode — fixture data, no API calls billed</Badge>
        ) : (
          <Badge variant="default">Live Places API</Badge>
        )}
        <Badge variant="outline">
          Requests this month: {data.usage.used}/{data.usage.cap}
          {data.usage.estimatedSpend > 0
            ? ` · est. $${data.usage.estimatedSpend.toFixed(2)}`
            : " · free tier"}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Categories</CardTitle>
          </CardHeader>
          <CardContent className="max-h-72 space-y-2 overflow-y-auto">
            {data.categories.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active categories — add some on the Categories page.
              </p>
            ) : (
              data.categories.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/60">
                  <Checkbox
                    checked={selectedCategories.has(c.id)}
                    onCheckedChange={() => toggle(selectedCategories, c.id, setSelectedCategories)}
                  />
                  <span className="flex-1 text-sm">{c.name}</span>
                  <span className="text-xs text-muted-foreground">fit {c.propensity}/10</span>
                </label>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Areas</CardTitle>
            <AddCityDialog onCreated={() => router.refresh()} />
          </CardHeader>
          <CardContent className="max-h-72 space-y-2 overflow-y-auto">
            {data.areas.map((a) => (
              <label key={a.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/60">
                <Checkbox
                  checked={selectedAreas.has(a.id)}
                  onCheckedChange={() => toggle(selectedAreas, a.id, setSelectedAreas)}
                />
                <span className="flex-1 text-sm">{a.name}</span>
                <span className="text-xs text-muted-foreground">
                  {a.city}, {a.state}
                </span>
              </label>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div className="text-sm text-muted-foreground">
            {selectedCategories.size} categor{selectedCategories.size === 1 ? "y" : "ies"} ×{" "}
            {selectedAreas.size} area{selectedAreas.size === 1 ? "" : "s"}
            {estimate > 0 && (
              <> · ~{estimate} billed requests (probes are free)</>
            )}
          </div>
          <Button
            onClick={startRun}
            disabled={busy || selectedCategories.size === 0 || selectedAreas.size === 0}
          >
            <Radar className="size-4" data-icon="inline-start" />
            {busy ? "Running…" : "Run discovery"}
          </Button>
        </CardContent>
      </Card>

      {run && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Run {run.id.slice(0, 8)} —{" "}
              {run.status === "RUNNING" ? (
                <span className="animate-pulse">in progress…</span>
              ) : (
                <Badge
                  variant={
                    run.status === "COMPLETED"
                      ? "default"
                      : run.status === "CAP_REACHED"
                        ? "secondary"
                        : "destructive"
                  }
                >
                  {run.status}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-semibold tabular-nums">{run.requestsUsed}</div>
              <div className="text-xs text-muted-foreground">billed requests</div>
            </div>
            <div>
              <div className="text-2xl font-semibold tabular-nums">{run.placesFound}</div>
              <div className="text-xs text-muted-foreground">places found</div>
            </div>
            <div>
              <div className="text-2xl font-semibold tabular-nums text-primary">{run.newPlaces}</div>
              <div className="text-xs text-muted-foreground">new businesses</div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent runs</CardTitle>
        </CardHeader>
        <CardContent>
          {data.runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead className="text-right">Places</TableHead>
                  <TableHead className="text-right">New</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">
                      {new Date(r.startedAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.status === "COMPLETED"
                            ? "default"
                            : r.status === "RUNNING"
                              ? "secondary"
                              : r.status === "CAP_REACHED"
                                ? "outline"
                                : "destructive"
                        }
                      >
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.requestsUsed}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.placesFound}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.newPlaces}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AddCityDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    city: "",
    state: "",
    south: "",
    west: "",
    north: "",
    east: "",
  });

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/areas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          city: form.city,
          state: form.state.toUpperCase(),
          south: Number(form.south),
          west: Number(form.west),
          north: Number(form.north),
          east: Number(form.east),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "failed to add area");
      toast.success(`Added ${form.name}`);
      setOpen(false);
      setForm({ name: "", city: "", state: "", south: "", west: "", north: "", east: "" });
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "failed to add area");
    } finally {
      setSaving(false);
    }
  }

  const num = (v: string) => !Number.isNaN(Number(v));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="size-3.5" data-icon="inline-start" />
          Add city
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a city or area</DialogTitle>
          <DialogDescription>
            Any US city. The bounding box (south, west, north, east) drives the
            search tiling — roughly the city limits works fine.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="grid gap-1">
              <Label htmlFor="area-name">Name</Label>
              <Input id="area-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Austin" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="area-city">City</Label>
              <Input id="area-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Austin" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="area-state">State</Label>
              <Input id="area-state" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="TX" maxLength={2} />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {(["south", "west", "north", "east"] as const).map((k) => (
              <div key={k} className="grid gap-1">
                <Label htmlFor={`area-${k}`} className="capitalize">
                  {k}
                </Label>
                <Input
                  id={`area-${k}`}
                  value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  placeholder={k === "south" || k === "north" ? "30.20" : "-97.80"}
                  inputMode="decimal"
                />
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={save}
            disabled={
              saving ||
              !form.name ||
              !form.city ||
              form.state.length !== 2 ||
              !num(form.south) ||
              !num(form.west) ||
              !num(form.north) ||
              !num(form.east)
            }
          >
            {saving ? "Adding…" : "Add area"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
