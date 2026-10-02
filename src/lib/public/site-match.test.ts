import { describe, expect, it } from "vitest";
import { sameSiteHost } from "./site-match";

describe("sameSiteHost", () => {
  it("matches identical strings", () => {
    expect(sameSiteHost("example.com", "example.com")).toBe(true);
  });
  it("matches across scheme and trailing slash (typed vs server-normalized)", () => {
    expect(sameSiteHost("https://example.com/", "example.com")).toBe(true);
    expect(sameSiteHost("example.com", "https://example.com/")).toBe(true);
    expect(sameSiteHost("http://example.com", "https://example.com/")).toBe(true);
  });
  it("ignores case and surrounding whitespace", () => {
    expect(sameSiteHost("  Example.COM ", "https://example.com/")).toBe(true);
  });
  it("rejects a different host", () => {
    expect(sameSiteHost("https://other.example", "https://example.com/")).toBe(false);
    expect(sameSiteHost("https://example.com.evil.net", "example.com")).toBe(false);
  });
  it("requires the exact same host (www is a different site)", () => {
    expect(sameSiteHost("www.example.com", "example.com")).toBe(false);
  });
  it("rejects empty or unparseable input", () => {
    expect(sameSiteHost("", "https://example.com/")).toBe(false);
    expect(sameSiteHost("https://example.com/", "")).toBe(false);
    expect(sameSiteHost("not a url", "https://example.com/")).toBe(false);
  });
});
