import { z } from "zod";

/**
 * Single source of truth for the "enum" values stored as text in SQLite
 * (SQLite has no enum column type). Validate at boundaries — route handlers,
 * jobs, and reads of JSON-encoded fields.
 */

export const WEBSITE_CLASSES = [
  "NONE",
  "SOCIAL_OR_DIRECTORY",
  "DEAD",
  "PARKED",
  "OUTDATED",
  "OK",
] as const;
export const websiteClassSchema = z.enum(WEBSITE_CLASSES);
export type WebsiteClass = z.infer<typeof websiteClassSchema>;

export const CONTACT_TYPES = ["EMAIL", "PHONE", "POSTAL"] as const;
export const contactTypeSchema = z.enum(CONTACT_TYPES);
export type ContactType = z.infer<typeof contactTypeSchema>;

export const CONTACT_SOURCES = ["PLACES", "WEBSITE", "MANUAL"] as const;
export const contactSourceSchema = z.enum(CONTACT_SOURCES);
export type ContactSource = z.infer<typeof contactSourceSchema>;

export const TIERS = ["A", "B", "C", "D"] as const;
export const tierSchema = z.enum(TIERS);
export type Tier = z.infer<typeof tierSchema>;

export const LEAD_STATUSES = [
  "NEW",
  "QUEUED",
  "CONTACTED",
  "REPLIED",
  "MEETING",
  "PROPOSAL",
  "WON",
  "LOST",
  "DO_NOT_CONTACT",
] as const;
export const leadStatusSchema = z.enum(LEAD_STATUSES);
export type LeadStatus = z.infer<typeof leadStatusSchema>;

export const CAMPAIGN_MODES = ["MANUAL", "AUTO"] as const;
export const campaignModeSchema = z.enum(CAMPAIGN_MODES);
export type CampaignMode = z.infer<typeof campaignModeSchema>;

export const CAMPAIGN_STATUSES = ["DRAFT", "RUNNING", "PAUSED", "STOPPED"] as const;
export const campaignStatusSchema = z.enum(CAMPAIGN_STATUSES);
export type CampaignStatus = z.infer<typeof campaignStatusSchema>;

export const CHANNELS = ["EMAIL", "POSTAL", "PHONE"] as const;
export const channelSchema = z.enum(CHANNELS);
export type Channel = z.infer<typeof channelSchema>;

export const OUTREACH_STATUSES = [
  "SCHEDULED",
  "SENT",
  "BOUNCED",
  "REPLIED",
  "UNSUBSCRIBED",
  "FAILED",
] as const;
export const outreachStatusSchema = z.enum(OUTREACH_STATUSES);
export type OutreachStatus = z.infer<typeof outreachStatusSchema>;

export const CALL_OUTCOMES = [
  "NO_ANSWER",
  "VOICEMAIL",
  "INTERESTED",
  "NOT_INTERESTED",
  "CALL_BACK",
  "DO_NOT_CALL",
] as const;
export const callOutcomeSchema = z.enum(CALL_OUTCOMES);
export type CallOutcome = z.infer<typeof callOutcomeSchema>;

export const DISCOVERY_STATUSES = [
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CAP_REACHED",
] as const;
export const discoveryStatusSchema = z.enum(DISCOVERY_STATUSES);
export type DiscoveryStatus = z.infer<typeof discoveryStatusSchema>;

export const JOB_STATUSES = ["PENDING", "RUNNING", "DONE", "FAILED"] as const;
export const jobStatusSchema = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof jobStatusSchema>;

// ---------------------------------------------------------------------------
// JSON encode/decode helpers for SQLite text columns
// ---------------------------------------------------------------------------

/** Encode a value (array/object) into the JSON-string column format. */
export function toJson(value: unknown): string {
  return JSON.stringify(value);
}

/** Decode a JSON-string column into an array; [] on missing/bad input. */
export function fromJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Decode a JSON-string column with a Zod schema; null on parse/validation failure. */
export function fromJsonObject<S extends z.ZodTypeAny>(
  raw: string | null | undefined,
  schema: S,
): z.infer<S> | null {
  if (!raw) return null;
  try {
    return schema.parse(JSON.parse(raw)) as z.infer<S>;
  } catch {
    return null;
  }
}
