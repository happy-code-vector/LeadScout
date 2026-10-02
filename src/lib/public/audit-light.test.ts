import { describe, expect, it } from "vitest";
import { runLightAudit } from "./audit-light";
import { fetchGuarded } from "./guarded-fetch";

const OLD = `<!doctype html><html><head><title>t</title></head><body>
<footer>Copyright 2015 Acme</footer></body></html>`; // no viewport → 10 + copyright 15 = 25 → OUTDATED

function depsFor(status: number, html: string, redirects = false) {
  return {
    fetchPage: (async () => ({ finalUrl: "https://x.example/", status, html })) as typeof fetchGuarded,
    fetchSitemapLastMod: (async () => null) as (o: URL) => Promise<Date | null>,
    _redirects: redirects,
  };
}

describe("runLightAudit", () => {
  it("classifies an outdated page with its findings", async () => {
    const r = await runLightAudit(new URL("https://x.example/"), depsFor(200, OLD));
    expect(r.websiteClass).toBe("OUTDATED");
    expect(r.findings).toContain("Copyright 2015");
    expect(r.findings).toContain("Not mobile-friendly");
  });
  it("returns DEAD with a plain finding when the fetch throws", async () => {
    const deps = {
      fetchPage: (async () => { throw new Error("connect ECONNREFUSED"); }) as typeof fetchGuarded,
      fetchSitemapLastMod: (async () => null) as (o: URL) => Promise<Date | null>,
    };
    const r = await runLightAudit(new URL("https://x.example/"), deps);
    expect(r.websiteClass).toBe("DEAD");
    expect(r.findings[0]).toMatch(/reach/i);
  });
  it("returns DEAD on HTTP errors", async () => {
    const r = await runLightAudit(new URL("https://x.example/"), depsFor(500, ""));
    expect(r.websiteClass).toBe("DEAD");
  });
  it("returns PARKED on a for-sale page", async () => {
    const r = await runLightAudit(new URL("https://x.example/"), depsFor(200, "<h1>This domain is for sale</h1>"));
    expect(r.websiteClass).toBe("PARKED");
  });
  it("never includes emails in findings", async () => {
    const r = await runLightAudit(new URL("https://x.example/"), depsFor(200, `<a href="mailto:a@b.test">m</a>${OLD}`));
    expect(JSON.stringify(r)).not.toContain("@");
  });
});
