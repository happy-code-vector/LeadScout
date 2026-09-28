"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Ban, Download, ExternalLink, Mail, MapPin, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LeadRow } from "./page";

const WEBSITE_CLASSES = ["NONE", "SOCIAL_OR_DIRECTORY", "DEAD", "PARKED", "OUTDATED", "OK"];
const STATUSES = ["NEW", "QUEUED", "CONTACTED", "REPLIED", "MEETING", "PROPOSAL", "WON", "LOST", "DO_NOT_CONTACT"];

const TIER_BADGE: Record<string, string> = {
  A: "bg-primary text-primary-foreground",
  B: "bg-primary/70 text-primary-foreground",
  C: "bg-primary/40 text-primary-foreground",
  D: "bg-muted text-muted-foreground",
};

const CLASS_LABEL: Record<string, string> = {
  NONE: "No site",
  SOCIAL_OR_DIRECTORY: "Social only",
  DEAD: "Dead",
  PARKED: "Parked",
  OUTDATED: "Outdated",
  OK: "OK",
  "—": "—",
};

export function LeadsClient({
  rows,
  total,
  page,
  pageSize,
  filters,
  categories,
  areas,
  campaigns,
}: {
  rows: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
  filters: { q?: string; tier?: string; category?: string; area?: string; websiteClass?: string; status?: string };
  categories: { slug: string; name: string }[];
  areas: string[];
  campaigns: { id: string; name: string; status: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set()); // businessIds

  function setFilter(key: string, value: string | undefined) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === "ALL") params.delete(key);
    else params.set(key, value);
    params.delete("page");
    startTransition(() => router.push(`/leads?${params.toString()}`));
  }

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    startTransition(() => router.push(`/leads?${params.toString()}`));
  }

  async function bulkAction(action: "set_status" | "dnc" | "add_to_campaign", status?: string, campaignId?: string) {
    if (selected.size === 0) return;
    try {
      const res = await fetch("/api/leads/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, status, campaignId, businessIds: [...selected] }),
      });
      const json = (await res.json()) as { error?: string; updated?: number };
      if (!res.ok) throw new Error(json.error ?? "bulk action failed");
      toast.success(
        action === "add_to_campaign"
          ? `${json.updated ?? selected.size} leads added to the campaign`
          : `${json.updated ?? selected.size} leads updated`,
      );
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "bulk action failed");
    }
  }

  function exportCsv() {
    const params = new URLSearchParams(searchParams.toString());
    if (selected.size > 0) params.set("businessIds", [...selected].join(","));
    window.open(`/api/leads/export?${params.toString()}`, "_blank");
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.businessId));

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-3">
          <Input
            placeholder="Search name…"
            defaultValue={filters.q ?? ""}
            className="w-48"
            onKeyDown={(e) => {
              if (e.key === "Enter") setFilter("q", (e.target as HTMLInputElement).value || undefined);
            }}
          />
          <Select value={filters.tier ?? "ALL"} onValueChange={(v) => setFilter("tier", v)}>
            <SelectTrigger className="w-28"><SelectValue placeholder="Tier" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All tiers</SelectItem>
              {["A", "B", "C", "D"].map((t) => (
                <SelectItem key={t} value={t}>Tier {t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.category ?? "ALL"} onValueChange={(v) => setFilter("category", v)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.area ?? "ALL"} onValueChange={(v) => setFilter("area", v)}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Area" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All areas</SelectItem>
              {areas.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.websiteClass ?? "ALL"} onValueChange={(v) => setFilter("websiteClass", v)}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Website" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All sites</SelectItem>
              {WEBSITE_CLASSES.map((w) => (
                <SelectItem key={w} value={w}>{CLASS_LABEL[w]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.status ?? "ALL"} onValueChange={(v) => setFilter("status", v)}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <Select onValueChange={(v) => void bulkAction("set_status", v)}>
            <SelectTrigger className="h-7 w-40" size="sm"><SelectValue placeholder="Set status…" /></SelectTrigger>
            <SelectContent>
              {STATUSES.filter((s) => s !== "DO_NOT_CONTACT").map((s) => (
                <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {campaigns.length > 0 && (
            <Select onValueChange={(v) => void bulkAction("add_to_campaign", undefined, v)}>
              <SelectTrigger className="h-7 w-44" size="sm"><SelectValue placeholder="Add to campaign…" /></SelectTrigger>
              <SelectContent>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.status.toLowerCase()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="destructive" size="sm" onClick={() => void bulkAction("dnc")}>
            <Ban className="size-3.5" data-icon="inline-start" />
            Do not contact
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="py-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) => {
                      setSelected(
                        checked
                          ? new Set(rows.map((r) => r.businessId))
                          : new Set(),
                      );
                    }}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Business</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Website</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead>Top reason</TableHead>
                <TableHead>Contacts</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                    No leads match. Run discovery, or clear filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id} className={selected.has(r.businessId) ? "bg-muted/40" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(r.businessId)}
                        onCheckedChange={(checked) => {
                          const next = new Set(selected);
                          if (checked) next.add(r.businessId);
                          else next.delete(r.businessId);
                          setSelected(next);
                        }}
                        aria-label={`Select ${r.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Link href={`/leads/${r.businessId}`} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                      {r.websiteUri && (
                        <a
                          href={r.websiteUri}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-1.5 inline-flex text-muted-foreground hover:text-foreground"
                          aria-label="Visit website"
                        >
                          <ExternalLink className="size-3" />
                        </a>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.categoryName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.area}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {CLASS_LABEL[r.websiteClass] ?? r.websiteClass}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`inline-flex size-7 items-center justify-center rounded-md text-xs font-bold ${TIER_BADGE[r.tier] ?? ""}`}>
                        {r.tier}
                      </span>
                      <span className="ml-1.5 text-sm tabular-nums">{r.total}</span>
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-sm text-muted-foreground" title={r.topReason}>
                      {r.topReason}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        {r.hasEmail && <Mail className="size-3.5" aria-label="Has email" />}
                        {r.hasPhone && <Phone className="size-3.5" aria-label="Has phone" />}
                        {r.hasPostal && <MapPin className="size-3.5" aria-label="Has address" />}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {r.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Page {page} of {pages}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1 || pending} onClick={() => goToPage(page - 1)}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={page >= pages || pending} onClick={() => goToPage(page + 1)}>
            Next
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="size-3.5" data-icon="inline-start" />
            Export CSV
          </Button>
        </div>
      </div>
    </div>
  );
}
