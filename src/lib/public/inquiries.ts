import { z } from "zod";
import { inquirySourceSchema } from "../domain";

const payloadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  company: z.string().trim().max(120).optional(),
  website: z.string().trim().max(300).optional(),
  businessType: z.string().trim().max(60).optional(),
  message: z.string().trim().max(4_000).optional(),
  source: inquirySourceSchema.default("CONTACT_FORM"),
  auditReportId: z.string().max(64).optional(),
  // Honeypot: humans never fill this.
  company_extra: z.string().max(0).optional(),
});

export type InquiryInput = z.infer<typeof payloadSchema>;

const MIN_ELAPSED_MS = 2_500;

export function validateInquiryInput(
  body: unknown,
  elapsedMs: number,
): { ok: true; value: InquiryInput } | { ok: false; error: string } {
  // NaN fails every comparison, so it would sail through the trap — treat
  // any non-finite elapsedMs as a failure.
  if (!Number.isFinite(elapsedMs) || elapsedMs < MIN_ELAPSED_MS) {
    return { ok: false, error: "That was too fast — please try again." };
  }
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid submission" };
  }
  return { ok: true, value: parsed.data };
}
