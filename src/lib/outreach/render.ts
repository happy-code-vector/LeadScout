import Handlebars from "handlebars";

/**
 * Handlebars rendering for templates (spec: Outreach / Templates).
 * Variables: businessName, category, neighborhood, reviewCount, rating,
 * topFinding, senderName, unsubscribeUrl, senderPostalAddress.
 *
 * Output is plain text (email bodies, postcards, call scripts), so compiled
 * with noEscape — HTML entities must not leak into text emails.
 */

export interface TemplateVars {
  businessName: string;
  category: string;
  neighborhood: string;
  reviewCount: number;
  rating: number | null;
  topFinding: string;
  senderName: string;
  unsubscribeUrl: string;
  senderPostalAddress: string;
}

const cache = new Map<string, HandlebarsTemplateDelegate>();

export function compileTemplate(body: string): HandlebarsTemplateDelegate {
  let compiled = cache.get(body);
  if (!compiled) {
    compiled = Handlebars.compile(body, { noEscape: true });
    cache.set(body, compiled);
  }
  return compiled;
}

export function renderTemplate(body: string, vars: TemplateVars): string {
  return compileTemplate(body)(vars).trim();
}

/** Collect the Handlebars variables a template references (for linting in the editor). */
export function templateVariables(body: string): string[] {
  const names = new Set<string>();
  for (const m of body.matchAll(/\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g)) {
    names.add(m[1]);
  }
  return [...names];
}

export const KNOWN_VARIABLES = [
  "businessName",
  "category",
  "neighborhood",
  "reviewCount",
  "rating",
  "topFinding",
  "senderName",
  "unsubscribeUrl",
  "senderPostalAddress",
] as const;
