import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Mail, MapPin, Phone } from "lucide-react";
import { prisma } from "@/lib/db";
import { fromJsonArray } from "@/lib/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { addContact, saveNotes, setStatus } from "./actions";

export const dynamic = "force-dynamic";

const STATUSES = ["NEW", "QUEUED", "CONTACTED", "REPLIED", "MEETING", "PROPOSAL", "WON", "LOST", "DO_NOT_CONTACT"] as const;

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="capitalize">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {value}/{max}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const business = await prisma.business.findUnique({
    where: { id },
    include: {
      category: true,
      audit: true,
      score: true,
      lead: { include: { events: { orderBy: { occurredAt: "desc" }, take: 20 }, callTasks: { orderBy: { dueAt: "desc" }, take: 10 } } },
      contacts: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!business) notFound();

  const lead = business.lead;
  const score = business.score;
  const reasons = score ? fromJsonArray(score.reasons) : [];
  const findings = business.audit ? fromJsonArray(business.audit.findings) : [];
  const emailsFound = business.audit ? fromJsonArray(business.audit.emailsFound) : [];

  return (
    <>
      <div className="mb-4">
        <Link href="/leads" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          Back to leads
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{business.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {business.category.name} · {business.borough ?? business.city ?? ""}
            {business.address ? ` · ${business.address}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {business.googleMapsUri && (
              <a href={business.googleMapsUri} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">
                  <MapPin className="size-3.5" data-icon="inline-start" />
                  Google Maps
                </Button>
              </a>
            )}
            {business.websiteUri && (
              <a href={business.websiteUri} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">
                  <ExternalLink className="size-3.5" data-icon="inline-start" />
                  Website
                </Button>
              </a>
            )}
            {business.phone && (
              <a href={`tel:${business.phone.replace(/[^+\d]/g, "")}`}>
                <Button variant="outline" size="sm">
                  <Phone className="size-3.5" data-icon="inline-start" />
                  {business.phone}
                </Button>
              </a>
            )}
          </div>
        </div>
        <Card className="min-w-44">
          <CardContent className="py-4 text-center">
            {score ? (
              <>
                <div className="text-3xl font-bold tabular-nums">{score.total}</div>
                <Badge className="mt-1">Tier {score.tier}</Badge>
                <p className="mt-1 text-xs text-muted-foreground">
                  {business.rating?.toFixed(1) ?? "—"} ★ · {business.reviewCount ?? 0} reviews
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No score (excluded)</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {score ? (
              <>
                <Bar label="Need" value={score.need} max={50} />
                <Bar label="Viability" value={score.viability} max={25} />
                <Bar label="Reachability" value={score.reachability} max={15} />
                <Bar label="Category fit" value={score.categoryFit} max={10} />
                <Separator />
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {reasons.map((r) => (
                    <li key={r}>· {r}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {business.isChain ? "Chains are excluded." : "Excluded (suppressed, not operational, or do-not-contact)."}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Website audit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {business.audit ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Class</span>
                  <Badge variant="outline">{business.audit.websiteClass.replace(/_/g, " ")}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Checked</span>
                  <span>{business.audit.checkedAt.toLocaleDateString()}</span>
                </div>
                {business.audit.platform && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Platform</span>
                    <span>{business.audit.platform}</span>
                  </div>
                )}
                <Separator />
                <ul className="space-y-1 text-muted-foreground">
                  {findings.length > 0 ? (
                    findings.map((f) => <li key={f}>· {f}</li>)
                  ) : (
                    <li>No issues found</li>
                  )}
                </ul>
              </>
            ) : (
              <p className="text-muted-foreground">Not audited yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contacts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2">
              {business.contacts.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-sm">
                  {c.type === "EMAIL" ? <Mail className="size-3.5" /> : c.type === "PHONE" ? <Phone className="size-3.5" /> : <MapPin className="size-3.5" />}
                  <span className="flex-1 truncate">{c.value}</span>
                  <Badge variant="outline" className="text-xs">{c.source.toLowerCase()}</Badge>
                  {c.verified && <Badge className="text-xs">verified</Badge>}
                </li>
              ))}
              {business.contacts.length === 0 && (
                <li className="text-sm text-muted-foreground">No contacts on file.</li>
              )}
            </ul>
            {emailsFound.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Also seen on site (not stored): {emailsFound.join(", ")}
              </p>
            )}
            <form action={addContact} className="flex items-end gap-2">
              <input type="hidden" name="businessId" value={business.id} />
              <div className="grid gap-1">
                <Label htmlFor="contact-type" className="text-xs">Type</Label>
                <Select name="contact-type" defaultValue="EMAIL">
                  <SelectTrigger id="contact-type" className="h-8 w-28" />
                  <SelectContent>
                    <SelectItem value="EMAIL">Email</SelectItem>
                    <SelectItem value="PHONE">Phone</SelectItem>
                    <SelectItem value="POSTAL">Postal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid flex-1 gap-1">
                <Label htmlFor="contact-value" className="text-xs">Value</Label>
                <Input id="contact-value" name="value" required placeholder="name@business.com" className="h-8" />
              </div>
              <Button type="submit" size="sm" variant="outline">Add</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline &amp; notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={setStatus} className="flex items-end gap-2">
              <input type="hidden" name="businessId" value={business.id} />
              <div className="grid flex-1 gap-1">
                <Label htmlFor="lead-status" className="text-xs">Status</Label>
                <Select name="status" defaultValue={lead?.status ?? "NEW"}>
                  <SelectTrigger id="lead-status" className="h-8" />
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" size="sm" variant="outline">Update</Button>
            </form>

            <form action={saveNotes} className="grid gap-1">
              <input type="hidden" name="businessId" value={business.id} />
              <Label htmlFor="lead-notes" className="text-xs">Notes</Label>
              <Textarea id="lead-notes" name="notes" rows={4} defaultValue={lead?.notes ?? ""} placeholder="Call back Tuesday, prefers email…" />
              <Button type="submit" size="sm" variant="outline" className="justify-self-end">Save notes</Button>
            </form>

            <Separator />
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Activity</p>
              {lead && lead.events.length === 0 && lead.callTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No outreach activity yet.</p>
              ) : (
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {lead?.events.map((e) => (
                    <li key={e.id}>
                      · {e.occurredAt.toLocaleDateString()} — {e.channel.toLowerCase()} {e.status.toLowerCase()}
                    </li>
                  ))}
                  {lead?.callTasks.map((t) => (
                    <li key={t.id}>
                      · {t.dueAt.toLocaleDateString()} — call task {t.outcome ? `(${t.outcome.replace(/_/g, " ").toLowerCase()})` : "(open)"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
