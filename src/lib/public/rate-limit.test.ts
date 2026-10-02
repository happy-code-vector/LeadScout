import { describe, expect, it } from "vitest";
import { clientIp, SlidingWindow } from "./rate-limit";

describe("SlidingWindow", () => {
  it("allows up to the limit inside the window, then refuses", () => {
    const t = 0;
    const w = new SlidingWindow(2, 60_000, () => t);
    expect(w.tryAcquire("ip")).toBe(true);
    expect(w.tryAcquire("ip")).toBe(true);
    expect(w.tryAcquire("ip")).toBe(false);
  });
  it("frees capacity after the window passes", () => {
    let t = 0;
    const w = new SlidingWindow(1, 60_000, () => t);
    expect(w.tryAcquire("ip")).toBe(true);
    t = 61_000;
    expect(w.tryAcquire("ip")).toBe(true);
  });
  it("tracks keys independently", () => {
    const w = new SlidingWindow(1, 60_000, () => 0);
    expect(w.tryAcquire("a")).toBe(true);
    expect(w.tryAcquire("b")).toBe(true);
    expect(w.tryAcquire("a")).toBe(false);
  });
});

describe("clientIp", () => {
  it("uses the last x-forwarded-for hop (the proxy-appended real client IP)", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
    expect(clientIp(req)).toBe("5.6.7.8");
  });
  it("falls back to unknown without the header", () => {
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
});
