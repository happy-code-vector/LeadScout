import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteCategory, saveCategory } from "./actions";

export const dynamic = "force-dynamic";

export default function CategoriesPage() {
  return (
    <>
      <PageHeader
        title="Categories"
        description="What to search for, and how likely each trade is to buy a website."
      />
      <CategoriesInner />
    </>
  );
}

async function CategoriesInner() {
  const categories = await prisma.category.findMany({
    orderBy: { propensity: "desc" },
    include: { _count: { select: { businesses: true } } },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="py-4">
          <form action={saveCategory} className="grid items-end gap-3 md:grid-cols-[1.4fr_1.2fr_1fr_0.7fr_auto]">
            <div className="grid gap-1">
              <Label htmlFor="c-name">Name</Label>
              <Input id="c-name" name="name" required placeholder="Tiling contractor" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="c-query">Text query</Label>
              <Input id="c-query" name="textQuery" required placeholder="tile contractor" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="c-type">Google type (optional)</Label>
              <Input id="c-type" name="includedType" placeholder="general_contractor" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="c-prop">Propensity 0–10</Label>
              <Input id="c-prop" name="propensity" type="number" min={0} max={10} defaultValue={5} required />
            </div>
            <Button type="submit">Add</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Text query</TableHead>
                <TableHead>Google type</TableHead>
                <TableHead className="text-right">Fit</TableHead>
                <TableHead className="text-right">Businesses</TableHead>
                <TableHead>Active</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <form action={saveCategory} className="flex items-center gap-2" id={`edit-${c.id}`}>
                      <input type="hidden" name="id" value={c.id} />
                      <Input name="name" defaultValue={c.name} className="h-7 w-44" required />
                    </form>
                  </TableCell>
                  <TableCell>
                    <Input form={`edit-${c.id}`} name="textQuery" defaultValue={c.textQuery} className="h-7 w-36" required />
                  </TableCell>
                  <TableCell>
                    <Input
                      form={`edit-${c.id}`}
                      name="includedType"
                      defaultValue={c.includedType ?? ""}
                      placeholder="—"
                      className="h-7 w-44"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      form={`edit-${c.id}`}
                      name="propensity"
                      type="number"
                      min={0}
                      max={10}
                      defaultValue={c.propensity}
                      className="h-7 w-16 text-right"
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{c._count.businesses}</TableCell>
                  <TableCell>
                    {/* Native checkbox: it must associate with the row form by id,
                        which the radix Checkbox can't do from outside the form. */}
                    <input
                      type="checkbox"
                      form={`edit-${c.id}`}
                      name="active"
                      defaultChecked={c.active}
                      className="size-4 accent-foreground"
                      aria-label="Active"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button form={`edit-${c.id}`} type="submit" variant="ghost" size="xs">
                        Save
                      </Button>
                      <form action={deleteCategory}>
                        <input type="hidden" name="id" value={c.id} />
                        <Button type="submit" variant="ghost" size="xs" className="text-destructive">
                          Delete
                        </Button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="px-2 py-3 text-xs text-muted-foreground">
            Categories with businesses cannot be deleted — deactivate them instead. The
            Google type must exist in{" "}
            <a
              className="underline underline-offset-2"
              href="https://developers.google.com/maps/documentation/places/web-service/place-types"
              target="_blank"
              rel="noreferrer"
            >
              Google&rsquo;s place types table
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
