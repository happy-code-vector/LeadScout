/** In-memory sliding-window limiter. Single web process per deploy. */
export class SlidingWindow {
  private hits = new Map<string, number[]>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}
  tryAcquire(key: string): boolean {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(t);
    this.hits.set(key, recent);
    return true;
  }
}

export const contactLimiter = new SlidingWindow(5, 3_600_000);
export const auditLimiter = new SlidingWindow(5, 3_600_000);
export const auditDailyCap = new SlidingWindow(200, 24 * 3_600_000);

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  // Last hop: Caddy (our proxy) appends the real client IP, so the final
  // entry is trustworthy — earlier hops are client-spoofable.
  return fwd?.split(",").pop()?.trim() || "unknown";
}
