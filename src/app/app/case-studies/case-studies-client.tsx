"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deleteCaseStudy, saveCaseStudy } from "./actions";

interface StudyRow {
  id: string;
  title: string;
  summary: string;
  metrics: string; // JSON [{label, value}]
  published: boolean;
  order: number;
  siteUrl: string;
  businessId: string | null;
  businessName: string | null;
}

export function CaseStudiesClient({ studies }: { studies: StudyRow[] }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4">
          <form action={saveCaseStudy} className="grid items-end gap-3 md:grid-cols-[1.2fr_1.5fr_1.2fr_auto]">
            <div className="grid gap-1">
              <Label htmlFor="cs-title" className="text-xs">Title</Label>
              <Input id="cs-title" name="title" required maxLength={160} placeholder="Carroll Gardens Plumbing" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="cs-summary" className="text-xs">Summary</Label>
              <Input id="cs-summary" name="summary" required maxLength={1000} placeholder="Outdated site rebuilt and launched in two weeks." />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="cs-site" className="text-xs">Live site URL</Label>
              <Input id="cs-site" name="siteUrl" maxLength={300} placeholder="https://carrollgardensplumbing.com" />
            </div>
            <input type="hidden" name="metrics" value="[]" />
            <Button type="submit">Add draft</Button>
          </form>
        </CardContent>
      </Card>

      {studies.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No case studies yet. Win a lead, then use &quot;Publish as case study&quot; on its detail page.
          </CardContent>
        </Card>
      )}

      {studies.map((s) => (
        <Card key={s.id}>
          <CardContent className="py-4">
            <form action={saveCaseStudy} id={`edit-${s.id}`}>
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="businessId" value={s.businessId ?? ""} />
              <div className="grid gap-3 md:grid-cols-[1.2fr_1.5fr_1.2fr]">
                <div className="grid gap-1">
                  <Label className="text-xs">Title{s.businessName ? ` (${s.businessName})` : ""}</Label>
                  <Input name="title" defaultValue={s.title} required maxLength={160} />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Summary</Label>
                  <Input name="summary" defaultValue={s.summary} required maxLength={1000} />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Live site URL</Label>
                  <Input name="siteUrl" defaultValue={s.siteUrl} maxLength={300} placeholder="https://carrollgardensplumbing.com" />
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[2fr_0.5fr_0.7fr_auto]">
                <div className="grid gap-1">
                  <Label className="text-xs">Metrics — JSON array of {"{label, value}"}</Label>
                  <Textarea name="metrics" rows={2} defaultValue={s.metrics} className="font-mono text-xs" placeholder='[{"label":"LCP","value":"1.1s"}]' />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Order</Label>
                  <Input name="order" type="number" min={0} max={999} defaultValue={s.order} />
                </div>
                <label className="flex items-end gap-2 pb-1.5 text-sm">
                  {/* Native checkbox: must associate with the row form by id (radix can't from outside). */}
                  <input type="checkbox" form={`edit-${s.id}`} name="published" defaultChecked={s.published} className="size-4 accent-foreground" />
                  Published
                </label>
                <div className="flex items-end gap-1.5">
                  <Button type="submit" form={`edit-${s.id}`} variant="outline" size="sm">Save</Button>
                </div>
              </div>
            </form>
            <form action={deleteCaseStudy} className="mt-2 flex justify-end">
              <input type="hidden" name="id" value={s.id} />
              <Button type="submit" variant="ghost" size="xs" className="text-destructive">Delete</Button>
            </form>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
