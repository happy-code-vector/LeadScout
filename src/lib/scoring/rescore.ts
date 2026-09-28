import { prisma } from "../db";
import { log } from "../logger";
import { toJson } from "../domain";
import { scoreLead, type ScoreInput } from "./score";
import { parseWeights, type ScoringWeights } from "./weights";

/**
 * Rescore everything (spec: "Rescore everything whenever the weights change"
 * and after audits). Excluded businesses get no Score row.
 */

export async function rescoreAll(): Promise<{ scored: number; removed: number }> {
  const settings = await prisma.settings.findUnique({ where: { id: "singleton" } });
  const weights = settings?.scoringWeights
    ? safeParseWeights(settings.scoringWeights)
    : undefined;

  const businesses = await prisma.business.findMany({
    include: {
      audit: true,
      contacts: true,
      category: { select: { propensity: true } },
      lead: { select: { status: true } },
      score: { select: { id: true } },
    },
  });

  const suppressed = new Set(
    (await prisma.suppression.findMany({ select: { value: true } })).map((s) => s.value),
  );

  let scored = 0;
  let removed = 0;

  for (const b of businesses) {
    const emails = b.contacts.filter(
      (c) => c.type === "EMAIL" && (c.verified || c.source === "WEBSITE"),
    );
    const input: ScoreInput = {
      operational: !b.businessStatus || b.businessStatus === "OPERATIONAL",
      isChain: b.isChain,
      suppressed:
        suppressed.has(b.placeId) ||
        emails.some((e) => suppressed.has(e.value)) ||
        (b.phone ? suppressed.has(b.phone) : false),
      leadStatus: b.lead?.status ?? null,
      websiteFindings: b.audit ? JSON.parse(b.audit.findings || "[]") : [],
      signals: {
        websiteClass: b.audit?.websiteClass ?? null,
        copyrightYear: b.audit?.copyrightYear ?? null,
        hasViewport: b.audit?.hasViewport ?? null,
        httpsOk: b.audit?.httpsOk ?? null,
        hasContactPath: b.audit?.hasContactPath ?? null,
        sitemapLastMod: b.audit?.sitemapLastMod ?? null,
        waybackLastChange: b.audit?.waybackLastChange ?? null,
      },
      reviewCount: b.reviewCount,
      rating: b.rating,
      hasUsableEmail: emails.length > 0,
      hasPhone: b.contacts.some((c) => c.type === "PHONE") || Boolean(b.phone),
      hasPostalAddress: Boolean(b.address),
      categoryPropensity: b.category.propensity,
    };

    const result = scoreLead(input, weights);
    if (result) {
      const data = {
        total: result.total,
        tier: result.tier,
        need: result.need,
        viability: result.viability,
        reachability: result.reachability,
        categoryFit: result.categoryFit,
        reasons: toJson(result.reasons),
        computedAt: new Date(),
      };
      await prisma.score.upsert({
        where: { businessId: b.id },
        update: data,
        create: { businessId: b.id, ...data },
      });
      scored += 1;
    } else if (b.score) {
      await prisma.score.delete({ where: { businessId: b.id } });
      removed += 1;
    }

    // Leads exist for every scored business (status pipeline lives on Lead).
    if (result && !b.lead) {
      await prisma.lead.create({ data: { businessId: b.id, status: "NEW" } });
    }
  }

  log.info("rescore complete", { scored, removed });
  return { scored, removed };
}

function safeParseWeights(raw: string): ScoringWeights | undefined {
  try {
    return parseWeights(JSON.parse(raw));
  } catch {
    log.warn("invalid scoring weights in settings; using defaults");
    return undefined;
  }
}
