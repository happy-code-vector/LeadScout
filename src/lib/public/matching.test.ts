import { describe, expect, it } from "vitest";
import { normalizeWebsiteHost } from "./matching";

describe("normalizeWebsiteHost", () => {
  it("normalizes scheme, www, case, and trailing paths", () => {
    expect(normalizeWebsiteHost("https://www.Example.com/some/page")).toBe("example.com");
    expect(normalizeWebsiteHost("example.com")).toBe("example.com");
    expect(normalizeWebsiteHost("http://shop.example.com")).toBe("shop.example.com");
  });
  it("returns null for garbage", () => {
    expect(normalizeWebsiteHost("not a url")).toBeNull();
    expect(normalizeWebsiteHost("")).toBeNull();
  });
});
