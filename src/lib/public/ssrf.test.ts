import { describe, expect, it } from "vitest";
import { assertPublicHttpUrl, ipIsPrivate, PublicUrlError } from "./ssrf";

const pub: Resolver_like = async () => ["93.184.216.34"];
type Resolver_like = (h: string) => Promise<string[]>;
const priv: Resolver_like = async () => ["10.0.0.5"];

describe("ipIsPrivate", () => {
  it.each(["10.0.0.1", "10.255.1.1", "172.16.0.1", "172.31.255.255", "192.168.1.1", "127.0.0.1", "0.0.0.0", "169.254.169.254", "100.64.0.1", "::1", "::", "fc00::1", "fd12::1", "fe80::1", "::ffff:127.0.0.1", "not-an-ip"])("%s is private/blocked", (ip) => {
    expect(ipIsPrivate(ip)).toBe(true);
  });
  it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "100.128.0.1", "2606:4700::1111"])("%s is public", (ip) => {
    expect(ipIsPrivate(ip)).toBe(false);
  });
});

describe("assertPublicHttpUrl", () => {
  it("accepts a public https URL and defaults the scheme", async () => {
    const a = await assertPublicHttpUrl("https://example.com/x", pub);
    expect(a.hostname).toBe("example.com");
    const b = await assertPublicHttpUrl("example.com", pub);
    expect(b.protocol).toBe("https:");
  });
  it.each([
    ["ftp://example.com", "scheme"],
    ["https://example.com:8080", "port"],
    ["https://localhost", "local"],
    ["http://127.0.0.1", "private"],
    ["http://192.168.1.10", "private"],
    ["https://example.com:6379", "port"],
  ])("rejects %s", async (raw) => {
    await expect(assertPublicHttpUrl(raw, pub)).rejects.toBeInstanceOf(PublicUrlError);
  });
  it("rejects when DNS resolves only to private addresses", async () => {
    await expect(assertPublicHttpUrl("internal.example", priv)).rejects.toBeInstanceOf(PublicUrlError);
  });
  it("rejects when the domain does not resolve", async () => {
    const none: Resolver_like = async () => [];
    await expect(assertPublicHttpUrl("nope.example", none)).rejects.toBeInstanceOf(PublicUrlError);
  });
});
