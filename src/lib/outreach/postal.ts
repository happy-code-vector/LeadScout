import { prisma } from "../db";
import { env } from "../env";
import { log } from "../logger";
import { fromJsonArray } from "../domain";
import { renderTemplate } from "./render";
import { templateVarsFor } from "./engine";

/**
 * Postal channel via the Lob API (optional; spec phase 7). Disabled unless
 * LOB_API_KEY is set. Sends a postcard rendered from the POSTAL template
 * (front/back sections in the body).
 */

const LOB_POSTCARDS_URL = "https://api.lob.com/v1/postcards";

export async function sendPostcard(
  leadId: string,
  campaignId: string,
): Promise<{ ok: true; lobId: string } | { ok: false; error: string }> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      business: { include: { audit: true, category: true, contacts: true } },
    },
  });
  const address = lead?.business.address;
  if (!lead || !address) {
    return { ok: false, error: "no lead or no postal address" };
  }
  const business = lead.business;

  const template = await prisma.template.findFirst({
    where: { channel: "POSTAL" },
    orderBy: { updatedAt: "desc" },
  });
  if (!template) return { ok: false, error: "no POSTAL template" };

  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  const findings = business.audit ? fromJsonArray(business.audit.findings) : [];
  const vars = templateVarsFor(
    settings,
    business.name,
    business.category.name,
    business.borough ?? business.city ?? "",
    business.reviewCount,
    business.rating,
    findings[0] ?? "",
    lead.id,
  );
  const rendered = renderTemplate(template.body, vars);
  const [front = "", back = ""] = rendered.split(/^BACK:/m).map((s) => s.replace(/^FRONT:\s*/m, "").trim());

  // Lob address: the business's postal address, with the owner as sender.
  const addressLines = address.split(",").map((s) => s.trim()).filter(Boolean);
  const body = new URLSearchParams({
    description: `LeadScout campaign ${campaignId}`,
    to: [
      business.name,
      ...addressLines.slice(0, 5),
    ].join("\n"),
    from: [settings?.senderName ?? "LeadScout", settings?.senderPostalAddress ?? ""].filter(Boolean).join("\n"),
    front: `<html><body style="margin:0"><div style="padding:24pt;font-family:Georgia,serif;font-size:16pt;line-height:1.4">${escapeHtml(front)}</div></body></html>`,
    back: `<html><body style="margin:0"><div style="padding:24pt;font-family:Georgia,serif;font-size:12pt;line-height:1.4">${escapeHtml(back)}</div></body></html>`,
  });

  const res = await fetch(LOB_POSTCARDS_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.LOB_API_KEY}:`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    signal: AbortSignal.timeout(20_000),
  });

  const json = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!res.ok) {
    const message = json.error?.message ?? `Lob HTTP ${res.status}`;
    log.warn("postcard failed", { leadId, message });
    return { ok: false, error: message };
  }
  log.info("postcard sent", { leadId, lobId: json.id });
  return { ok: true, lobId: json.id ?? "" };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
