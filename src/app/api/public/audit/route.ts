import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toJson } from "@/lib/domain";
import { assertPublicHttpUrl, PublicUrlError } from "@/lib/public/ssrf";
import { runLightAudit } from "@/lib/public/audit-light";
import { auditDailyCap, auditLimiter, clientIp } from "@/lib/public/rate-limit";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!auditLimiter.tryAcquire(clientIp(request))) {
    return NextResponse.json({ error: "Too many checks — try again in an hour." }, { status: 429 });
  }
  if (!auditDailyCap.tryAcquire("global")) {
    return NextResponse.json({ error: "Daily check limit reached — try again tomorrow." }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as { url?: string } | null;
  let url: URL;
  try {
    url = await assertPublicHttpUrl(String(body?.url ?? ""));
  } catch (err) {
    if (err instanceof PublicUrlError) {
      return NextResponse.json({ error: err.reason }, { status: 400 });
    }
    throw err;
  }
  const result = await runLightAudit(url);
  const report = await prisma.auditReport.create({
    data: {
      url: url.toString(),
      finalUrl: result.finalUrl,
      websiteClass: result.websiteClass,
      findings: toJson(result.findings),
    },
  });
  return NextResponse.json({ id: report.id });
}
