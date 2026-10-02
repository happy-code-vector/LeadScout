import { describe, expect, it } from "vitest";
import { fetchGuarded } from "./guarded-fetch";
import { PublicUrlError } from "./ssrf";

const pub = async () => ["93.184.216.34"];
const priv = async () => ["10.0.0.5"];

function res(status: number, html = "", location?: string): Response {
  return new Response(html, { status, headers: location ? { location } : undefined });
}

describe("fetchGuarded", () => {
  it("returns the page for a direct public URL", async () => {
    const out = await fetchGuarded(new URL("https://example.com/"), {
      fetchImpl: (async () => res(200, "<html>ok</html>")) as unknown as typeof fetch,
      resolve: pub,
    });
    expect(out.status).toBe(200);
    expect(out.html).toContain("ok");
  });
  it("follows redirects and validates each hop", async () => {
    let called = 0;
    const impl = (async () => {
      called += 1;
      return called === 1 ? res(301, "", "https://other.example/x") : res(200, "final");
    }) as unknown as typeof fetch;
    const out = await fetchGuarded(new URL("https://example.com/"), { fetchImpl: impl, resolve: pub });
    expect(out.html).toBe("final");
    expect(called).toBe(2);
  });
  it("rejects a redirect to a private host", async () => {
    const impl = (async () => res(302, "", "http://192.168.0.10/admin")) as unknown as typeof fetch;
    await expect(
      fetchGuarded(new URL("https://example.com/"), { fetchImpl: impl, resolve: pub }),
    ).rejects.toBeInstanceOf(PublicUrlError);
  });
  it("rejects when the initial host resolves private", async () => {
    const impl = (async () => res(200, "x")) as unknown as typeof fetch;
    await expect(
      fetchGuarded(new URL("https://internal.example/"), { fetchImpl: impl, resolve: priv }),
    ).rejects.toBeInstanceOf(PublicUrlError);
  });
  it("gives up after maxHops", async () => {
    const impl = (async () => res(302, "", "https://example.com/loop")) as unknown as typeof fetch;
    await expect(
      fetchGuarded(new URL("https://example.com/"), { fetchImpl: impl, resolve: pub, maxHops: 2 }),
    ).rejects.toBeInstanceOf(PublicUrlError);
  });
});
