import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { templateVarsFor } from "@/lib/outreach/engine";
import { renderTemplate } from "@/lib/outreach/render";
import { fromJsonArray } from "@/lib/domain";

const templateSchema = z.object({
  name: z.string().min(1).max(120),
  channel: z.enum(["EMAIL", "POSTAL", "PHONE"]),
  subject: z.string().max(200).nullable().optional(),
  body: z.string().min(1).max(50_000),
  variant: z.string().max(60).nullable().optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = templateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const t = await prisma.template.create({ data: parsed.data });
  return NextResponse.json({ template: t }, { status: 201 });
}

/** Render a preview against a real lead. */
export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { templateId?: string; subject?: string; body?: string; leadBusinessId?: string }
    | null;
  if (!body?.body) return NextResponse.json({ error: "body required" }, { status: 400 });

  let templateSubject: string | null = body.subject ?? null;
  if (body.templateId) {
    const t = await prisma.template.findUnique({ where: { id: body.templateId } });
    if (t) templateSubject = body.subject ?? t.subject;
  }

  const business = body.leadBusinessId
    ? await prisma.business.findUnique({
        where: { id: body.leadBusinessId },
        include: { audit: true, category: true, contacts: true, lead: true },
      })
    : await prisma.business.findFirst({
        where: { audit: { websiteClass: { in: ["NONE", "OUTDATED"] } } },
        include: { audit: true, category: true, contacts: true, lead: true },
      });
  if (!business) return NextResponse.json({ error: "no lead to preview against" }, { status: 400 });

  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  const findings = business.audit ? fromJsonArray(business.audit.findings) : [];
  const email =
    business.contacts.find((c) => c.type === "EMAIL")?.value ?? "preview@example.com";
  const vars = templateVarsFor(
    settings,
    business.name,
    business.category.name,
    business.borough ?? business.city ?? "",
    business.reviewCount,
    business.rating,
    findings[0] ?? "their website could work harder",
    business.lead?.id ?? "preview",
    email,
  );

  return NextResponse.json({
    previewLead: { name: business.name, id: business.id },
    subject: templateSubject ? renderTemplate(templateSubject, vars) : null,
    body: renderTemplate(body.body, vars),
  });
}
