import { describe, expect, it } from "vitest";
import { DEFAULT_BRAND, parseBrand } from "./brand";

describe("parseBrand", () => {
  it("parses a full brand and fills missing optional fields", () => {
    const b = parseBrand(JSON.stringify({ name: "X LLC" }));
    expect(b).toEqual({ name: "X LLC", tagline: "", email: "", phone: "", address: "" });
  });
  it("falls back to the default on garbage", () => {
    expect(parseBrand("not json")).toEqual(DEFAULT_BRAND);
    expect(parseBrand(null)).toEqual(DEFAULT_BRAND);
  });
  it("rejects an empty name by falling back", () => {
    expect(parseBrand(JSON.stringify({ name: "" })).name).toBe(DEFAULT_BRAND.name);
  });
  it("default brand is AppHub LLC", () => {
    expect(DEFAULT_BRAND.name).toBe("AppHub LLC");
  });
});
