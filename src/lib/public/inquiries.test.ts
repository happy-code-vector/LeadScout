import { describe, expect, it } from "vitest";
import { validateInquiryInput } from "./inquiries";

const good = { name: "Sam", email: "sam@shop.com", message: "hi" };

describe("validateInquiryInput", () => {
  it("accepts a minimal valid submission", () => {
    const r = validateInquiryInput({ ...good }, 5_000);
    expect(r.ok).toBe(true);
  });
  it("rejects too-fast submissions (time trap)", () => {
    expect(validateInquiryInput({ ...good }, 1_000).ok).toBe(false);
  });
  it("rejects non-finite elapsedMs instead of bypassing the time trap", () => {
    expect(validateInquiryInput({ ...good }, Number("abc")).ok).toBe(false);
    expect(validateInquiryInput({ ...good }, Number.NaN).ok).toBe(false);
  });
  it("rejects a filled honeypot", () => {
    expect(validateInquiryInput({ ...good, company_extra: "spam" }, 5_000).ok).toBe(false);
  });
  it("requires a name and a valid email", () => {
    expect(validateInquiryInput({ ...good, name: "" }, 5_000).ok).toBe(false);
    expect(validateInquiryInput({ ...good, email: "nope" }, 5_000).ok).toBe(false);
  });
  it("caps message length and validates the source", () => {
    expect(validateInquiryInput({ ...good, message: "x".repeat(4001) }, 5_000).ok).toBe(false);
    expect(validateInquiryInput({ ...good, source: "SMS" }, 5_000).ok).toBe(false);
  });
});
