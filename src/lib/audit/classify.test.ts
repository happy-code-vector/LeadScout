import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { classifyWebsite, isSocialOrDirectoryHost, matchesParkedPage } from "./classify";
import { extractPageSignals, mergePageSignals } from "./extract";

const SITES = path.join(process.cwd(), "fixtures", "sites");
const site = (name: string) => readFile(path.join(SITES, name), "utf8");

function baseInput(overrides: Partial<Parameters<typeof classifyWebsite>[0]> = {}) {
  return {
    copyrightYear: null,
    hasViewport: true,
    hasContactPath: true,
    platform: null,
    emails: [],
    websiteUri: "https://example.com",
    httpStatus: 200,
    httpsOk: true,
    sitemapLastMod: null,
    waybackLastChange: null,
    ...overrides,
  };
}

describe("classifyWebsite — one fixture per website class", () => {
  it("NONE: no websiteUri", async () => {
    const r = classifyWebsite(baseInput({ websiteUri: null, httpStatus: null }));
    expect(r.websiteClass).toBe("NONE");
    expect(r.findings).toContain("No website");
  });

  it("SOCIAL_OR_DIRECTORY: facebook business page", () => {
    const r = classifyWebsite(baseInput({ websiteUri: "https://www.facebook.com/baxters-plumbing" }));
    expect(r.websiteClass).toBe("SOCIAL_OR_DIRECTORY");
    expect(r.findings[0]).toMatch(/facebook\.com/);
  });

  it("DEAD: TLS failure with no HTTP fallback (dead-tls fixture host)", () => {
    const r = classifyWebsite(baseInput({ httpStatus: null, httpsOk: false }));
    expect(r.websiteClass).toBe("DEAD");
    expect(r.findings[0]).toMatch(/unreachable/);
  });

  it("DEAD: HTTP 500", () => {
    const r = classifyWebsite(baseInput({ httpStatus: 500 }));
    expect(r.websiteClass).toBe("DEAD");
    expect(r.findings[0]).toMatch(/HTTP 500/);
  });

  it("PARKED: for-sale page (parked-forsale fixture)", async () => {
    const html = await site("parked-forsale.html");
    expect(matchesParkedPage(html)).toBe(true);
    const r = classifyWebsite(baseInput({ parkedPage: true }));
    expect(r.websiteClass).toBe("PARKED");
    expect(r.findings).toContain("Domain is parked or listed for sale");
  });

  it("OUTDATED: plain-old-2014 fixture (old copyright + no viewport + no contact)", async () => {
    const html = await site("plain-old-2014.html");
    const signals = extractPageSignals(html);
    const r = classifyWebsite(baseInput(signals));
    expect(r.websiteClass).toBe("OUTDATED");
    expect(r.findings).toContain("Copyright 2014");
    expect(r.findings).toContain("Not mobile-friendly");
    expect(r.findings).toContain("No contact form, phone, or email on the site");
    expect(r.outdatedPoints).toBe(30); // 15 + 10 + 5
  });

  it("OK: modern-fresh fixture", async () => {
    const html = await site("modern-fresh.html");
    const signals = extractPageSignals(html);
    const r = classifyWebsite(
      baseInput({
        ...signals,
        sitemapLastMod: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1),
      }),
    );
    expect(r.websiteClass).toBe("OK");
    expect(r.findings).toHaveLength(0);
  });
});

describe("signal thresholds", () => {
  it("single weak signal (no viewport only) stays OK at 10 points", async () => {
    const html = await site("no-viewport.html");
    const signals = extractPageSignals(html);
    expect(signals.hasViewport).toBe(false);
    expect(signals.hasContactPath).toBe(true); // mailto present
    const r = classifyWebsite(baseInput(signals));
    expect(r.outdatedPoints).toBe(10);
    expect(r.websiteClass).toBe("OK");
  });

  it("old copyright alone (15 points) crosses to OUTDATED", async () => {
    const html = await site("old-copyright-2016.html");
    const signals = extractPageSignals(html);
    expect(signals.copyrightYear).toBe(2016);
    const r = classifyWebsite(baseInput(signals));
    expect(r.outdatedPoints).toBe(15);
    expect(r.websiteClass).toBe("OUTDATED");
  });

  it("no-contact alone (5 points) stays OK", async () => {
    const html = await site("no-contact.html");
    const signals = extractPageSignals(html);
    const r = classifyWebsite(baseInput(signals));
    expect(r.outdatedPoints).toBe(5);
    expect(r.websiteClass).toBe("OK");
  });

  it("stale sitemap (>24 months) adds 10 points", () => {
    const r = classifyWebsite(
      baseInput({ sitemapLastMod: new Date("2020-01-15") }),
    );
    expect(r.outdatedPoints).toBe(10);
    expect(r.findings.join(" ")).toMatch(/stale/);
  });

  it("http-only site (no HTTPS) adds 8 points", async () => {
    const html = await site("http-only.html");
    const signals = extractPageSignals(html);
    const r = classifyWebsite(baseInput({ ...signals, httpsOk: false }));
    expect(r.outdatedPoints).toBe(8);
    expect(r.findings).toContain("No working HTTPS");
  });
});

describe("extractPageSignals", () => {
  it("extracts emails from mailto links and text, lowercased and deduped", async () => {
    const html = await site("modern-fresh.html");
    const s = extractPageSignals(html);
    expect(s.emails).toContain("hello@qualityhome.test");
    expect(new Set(s.emails).size).toBe(s.emails.length);
  });

  it("drops image filenames and platform emails", async () => {
    const html = await site("plain-old-2014.html");
    const s = extractPageSignals(html);
    // logo@2x.png (image filename) must not appear as an email
    expect(s.emails.join(" ")).not.toMatch(/2x\.png/i);
    const withPlatform = `<a href="mailto:x@wixpress.com">x</a> text no-reply@squarespace.info`;
    const s2 = extractPageSignals(withPlatform);
    expect(s2.emails).toHaveLength(0);
  });

  it("detects the platform from generator meta and asset paths", () => {
    expect(extractPageSignals(`<meta name="generator" content="WordPress 6.4">x`).platform).toBe("WordPress");
    expect(extractPageSignals(`<img src="/wp-content/uploads/a.png">`).platform).toBe("WordPress");
    expect(extractPageSignals(`<p>plain</p>`).platform).toBeNull();
  });

  it("takes the HIGHEST copyright year on the page", () => {
    // Years must be near ©/copyright; a bare "updated 2020" is ignored.
    const html = `<footer>© 2014 Acme. Copyright 2019–2024.</footer>`;
    expect(extractPageSignals(html).copyrightYear).toBe(2024);
    const html2 = `<footer>© 2014 Acme — site updated 2020.</footer>`;
    expect(extractPageSignals(html2).copyrightYear).toBe(2014);
  });

  it("merges signals across pages", () => {
    const merged = mergePageSignals([
      { copyrightYear: 2014, hasViewport: true, hasContactPath: false, platform: null, emails: ["a@x.test"] },
      { copyrightYear: 2020, hasViewport: false, hasContactPath: true, platform: "Wix", emails: ["a@x.test", "b@y.test"] },
    ]);
    expect(merged.copyrightYear).toBe(2020);
    expect(merged.hasViewport).toBe(true);
    expect(merged.hasContactPath).toBe(true);
    expect(merged.platform).toBe("Wix");
    expect(merged.emails.sort()).toEqual(["a@x.test", "b@y.test"]);
  });
});

describe("social host matching", () => {
  it("matches hosts and subdomains, not suffix collisions", () => {
    expect(isSocialOrDirectoryHost("facebook.com")).toBe(true);
    expect(isSocialOrDirectoryHost("www.yelp.com")).toBe(true);
    expect(isSocialOrDirectoryHost("m.business.site")).toBe(true);
    expect(isSocialOrDirectoryHost("notfacebook.com")).toBe(false);
    expect(isSocialOrDirectoryHost("facebook.evil.com")).toBe(false);
  });
});
