import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp, contactLimiter } from "@/lib/public/rate-limit";
import { validateInquiryInput } from "@/lib/public/inquiries";
import { matchBusinessByWebsiteUrl } from "@/lib/public/matching";
import { sameSiteHost } from "@/lib/public/site-match";

export async function POST(request: Request) {
  if (!contactLimiter.tryAcquire(clientIp(request))) {
    return NextResponse.json({ error: "Too many submissions — try again later." }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as
    | (Record<string, unknown> & { elapsedMs?: number })
    | null;
  const result = validateInquiryInput(body, Number(body?.elapsedMs ?? 0));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  // An inquiry may cite an audit report only for the site that report
  // actually checked: drop the link on a host mismatch or unknown id.
  let website = result.value.website ?? null;
  let auditReportId = result.value.auditReportId || null;
  if (auditReportId) {
    const report = await prisma.auditReport.findUnique({
      where: { id: auditReportId },
      select: { url: true },
    });
    if (!report) {
      auditReportId = null;
    } else if (website) {
      if (!sameSiteHost(website, report.url)) auditReportId = null;
    } else {
      website = report.url; // no website given — the report's own url stands in
    }
  }
  const businessId = website ? await matchBusinessByWebsiteUrl(website) : null;

  await prisma.inquiry.create({
    data: {
      name: result.value.name,
      email: result.value.email.toLowerCase(),
      phone: result.value.phone || null,
      company: result.value.company || null,
      website: website || null,
      businessType: result.value.businessType || null,
      message: result.value.message || null,
      source: result.value.source,
      auditReportId,
      businessId,
    },
  });
  return NextResponse.json({ ok: true });
}
