import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp, contactLimiter } from "@/lib/public/rate-limit";
import { validateInquiryInput } from "@/lib/public/inquiries";

export async function POST(request: Request) {
  if (!contactLimiter.tryAcquire(clientIp(request))) {
    return NextResponse.json({ error: "Too many submissions — try again later." }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as
    | (Record<string, unknown> & { elapsedMs?: number })
    | null;
  const result = validateInquiryInput(body, Number(body?.elapsedMs ?? 0));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  await prisma.inquiry.create({
    data: {
      name: result.value.name,
      email: result.value.email.toLowerCase(),
      phone: result.value.phone || null,
      company: result.value.company || null,
      website: result.value.website || null,
      message: result.value.message || null,
      source: result.value.source,
      auditReportId: result.value.auditReportId || null,
    },
  });
  return NextResponse.json({ ok: true });
}
