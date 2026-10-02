"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface InquiryRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  website: string;
  message: string;
  businessType: string;
  source: string;
  status: string;
  auditClass: string | null;
  auditId: string | null;
  businessId: string | null;
  createdAt: string;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  NEW: "default",
  CONTACTED: "secondary",
  CONVERTED: "outline",
  DISMISSED: "destructive",
};

export function InquiriesClient({ inquiries }: { inquiries: InquiryRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function setStatus(id: string, status: "CONTACTED" | "DISMISSED" | "NEW") {
    setBusy(id);
    try {
      const res = await fetch(`/api/inquiries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "failed");
      toast.success(`Marked ${status.toLowerCase()}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(null);
    }
  }

  async function convert(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/inquiries/${id}/convert`, { method: "POST" });
      const json = (await res.json()) as { error?: string; businessId?: string };
      if (!res.ok) throw new Error(json.error ?? "failed");
      toast.success("Converted to lead");
      if (json.businessId) window.open(`/app/leads/${json.businessId}`, "_blank");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(null);
    }
  }

  if (inquiries.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No inquiries yet — they arrive from the public contact form and free site checks.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>From</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Website</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {inquiries.map((i) => (
              <TableRow key={i.id}>
                <TableCell>
                  <div className="font-medium">{i.name}</div>
                  <div className="text-xs text-muted-foreground">{i.email}{i.phone ? ` · ${i.phone}` : ""}</div>
                  {i.company && <div className="text-xs text-muted-foreground">{i.company}</div>}
                  <div className="text-xs text-muted-foreground">{new Date(i.createdAt).toLocaleString()}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{i.source === "AUDIT_CTA" ? "site check" : "contact form"}</Badge>
                  {i.businessType && <Badge variant="outline" className="ml-1">{i.businessType}</Badge>}
                  {i.auditClass && <Badge variant="outline" className="ml-1">{i.auditClass.replace(/_/g, " ").toLowerCase()}</Badge>}
                  {i.businessId && <Badge variant="outline" className="ml-1">known business</Badge>}
                </TableCell>
                <TableCell className="max-w-40 truncate text-sm">
                  {i.website ? (
                    i.auditId ? (
                      <a href={`/audit/${i.auditId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                        {i.website} <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      i.website
                    )
                  ) : ("—")}
                </TableCell>
                <TableCell className="max-w-64 truncate text-sm text-muted-foreground" title={i.message}>{i.message || "—"}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANT[i.status] ?? "secondary"}>{i.status.toLowerCase()}</Badge></TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    {i.status !== "CONVERTED" && i.status !== "DISMISSED" && (
                      <>
                        <Button size="xs" disabled={busy === i.id} onClick={() => void convert(i.id)}>Convert</Button>
                        <Button size="xs" variant="outline" disabled={busy === i.id} onClick={() => void setStatus(i.id, "CONTACTED")}>Contacted</Button>
                        <Button size="xs" variant="ghost" className="text-destructive" disabled={busy === i.id} onClick={() => void setStatus(i.id, "DISMISSED")}>Dismiss</Button>
                      </>
                    )}
                    {i.status === "DISMISSED" && (
                      <Button size="xs" variant="outline" disabled={busy === i.id} onClick={() => void setStatus(i.id, "NEW")}>Restore</Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
