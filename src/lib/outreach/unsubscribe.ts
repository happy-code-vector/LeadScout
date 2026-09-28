import jwt from "jsonwebtoken";
import { prisma } from "../db";
import { env } from "../env";
import { log } from "../logger";
import { stopSequences } from "./engine";

/**
 * One-click unsubscribe (spec: CAN-SPAM hard rules).
 * GET and POST /u/[token] — the token is a signed JWT carrying leadId and
 * email. Both methods suppress the address immediately, globally.
 */

export interface UnsubscribeClaims {
  leadId: string;
  email: string;
  /** Standard JWT claims added at signing time. */
  exp?: number;
  iat?: number;
}

export function createUnsubscribeToken(leadId: string, email: string): string {
  if (!env.UNSUBSCRIBE_JWT_SECRET) {
    throw new Error("UNSUBSCRIBE_JWT_SECRET is not set");
  }
  return jwt.sign({ leadId, email } satisfies UnsubscribeClaims, env.UNSUBSCRIBE_JWT_SECRET, {
    expiresIn: "180d",
  });
}

export function verifyUnsubscribeToken(token: string): UnsubscribeClaims | null {
  if (!env.UNSUBSCRIBE_JWT_SECRET) return null;
  try {
    return jwt.verify(token, env.UNSUBSCRIBE_JWT_SECRET) as UnsubscribeClaims;
  } catch {
    return null;
  }
}

export function unsubscribeUrl(leadId: string, email: string): string {
  return `${env.APP_BASE_URL.replace(/\/$/, "")}/u/${createUnsubscribeToken(leadId, email)}`;
}

/** Suppress the address, record the event, and halt every sequence for the lead. */
export async function applyUnsubscribe(
  claims: UnsubscribeClaims,
  campaignId?: string,
): Promise<void> {
  await prisma.suppression.upsert({
    where: { value: claims.email },
    update: {},
    create: { value: claims.email, reason: "unsubscribe" },
  });

  await prisma.outreachEvent.create({
    data: {
      leadId: claims.leadId,
      campaignId: campaignId ?? (await fallbackCampaignId(claims.leadId)),
      channel: "EMAIL",
      status: "UNSUBSCRIBED",
      meta: JSON.stringify({ email: claims.email }),
    },
  });

  await stopSequences(claims.leadId, "unsubscribed");
  log.info("unsubscribe applied", { email: claims.email, leadId: claims.leadId });
}

async function fallbackCampaignId(leadId: string): Promise<string> {
  const last = await prisma.outreachEvent.findFirst({
    where: { leadId },
    orderBy: { occurredAt: "desc" },
    select: { campaignId: true },
  });
  if (last) return last.campaignId;
  // No events at all (direct link) — attach to a placeholder-less campaign is
  // impossible; use the newest campaign as bookkeeping anchor.
  const any = await prisma.campaign.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true } });
  if (!any) throw new Error("no campaign exists to record unsubscribe against");
  return any.id;
}
