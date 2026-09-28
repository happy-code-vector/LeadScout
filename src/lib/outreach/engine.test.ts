import { describe, expect, it } from "vitest";
import type { Mailbox } from "@prisma/client";
import { warmupCap } from "./engine";
import { isWithinSendWindow, localHourAndDay, parseSendWindow, timezoneForState } from "./timezone";
import { createUnsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe";

function mailbox(overrides: Partial<Mailbox> = {}): Mailbox {
  return {
    id: "m1",
    label: "test",
    smtpHost: "localhost",
    smtpPort: 1025,
    imapHost: "localhost",
    imapPort: 143,
    user: "a@b.test",
    passwordEncrypted: "v1:x",
    fromName: null,
    dailyLimit: 40,
    warmupStartDate: null,
    active: true,
    createdAt: new Date(),
    ...overrides,
  } as Mailbox;
}

describe("warmupCap", () => {
  it("is the daily limit when warmup never started", () => {
    expect(warmupCap(mailbox({ dailyLimit: 40 }))).toBe(40);
  });

  it("starts at 10/day and adds 5/day up to the limit", () => {
    const start = new Date(Date.now() - 0 * 24 * 60 * 60_000);
    expect(warmupCap(mailbox({ dailyLimit: 40, warmupStartDate: start }))).toBe(10);
    expect(warmupCap(mailbox({ dailyLimit: 40, warmupStartDate: new Date(Date.now() - 2 * 24 * 60 * 60_000) }))).toBe(20);
    expect(warmupCap(mailbox({ dailyLimit: 40, warmupStartDate: new Date(Date.now() - 6 * 24 * 60 * 60_000) }))).toBe(40);
    expect(warmupCap(mailbox({ dailyLimit: 40, warmupStartDate: new Date(Date.now() - 90 * 24 * 60 * 60_000) }))).toBe(40);
  });

  it("never exceeds the daily limit", () => {
    expect(
      warmupCap(mailbox({ dailyLimit: 15, warmupStartDate: new Date(Date.now() - 30 * 24 * 60 * 60_000) })),
    ).toBe(15);
  });
});

describe("send windows", () => {
  // 2026-06-15 is a Monday. 10:00 New York = 14:00 UTC.
  const monday10amEt = new Date("2026-06-15T14:00:00Z");
  const monday8amEt = new Date("2026-06-15T12:00:00Z");
  const saturday10amEt = new Date("2026-06-13T14:00:00Z");

  it("maps states to IANA timezones with a sane default", () => {
    expect(timezoneForState("NY")).toBe("America/New_York");
    expect(timezoneForState("ca")).toBe("America/Los_Angeles");
    expect(timezoneForState("IL")).toBe("America/Chicago");
    expect(timezoneForState(null)).toBe("America/New_York");
    expect(timezoneForState("ZZ")).toBe("America/New_York");
  });

  it("computes recipient-local hour and weekday", () => {
    const { hour, day } = localHourAndDay(monday10amEt, "America/New_York");
    expect(hour).toBe(10);
    expect(day).toBe(1);
  });

  it("respects hours and weekdays in the recipient's timezone", () => {
    const window = { startHour: 9, endHour: 16, daysOfWeek: [1, 2, 3, 4, 5] };
    expect(isWithinSendWindow(monday10amEt, window, "America/New_York")).toBe(true);
    expect(isWithinSendWindow(monday8amEt, window, "America/New_York")).toBe(false);
    expect(isWithinSendWindow(saturday10amEt, window, "America/New_York")).toBe(false);
    // 10:00 ET is 16:00 in Los Angeles — outside a 9–16 window there.
    expect(isWithinSendWindow(monday10amEt, window, "America/Los_Angeles")).toBe(false);
  });

  it("falls back to the spec default on malformed JSON", () => {
    expect(parseSendWindow("not json")).toEqual({
      startHour: 9,
      endHour: 16,
      daysOfWeek: [1, 2, 3, 4, 5],
    });
    expect(parseSendWindow(null)).toEqual(parseSendWindow("{}"));
  });
});

describe("unsubscribe tokens", () => {
  it("round-trips leadId and email", () => {
    const token = createUnsubscribeToken("lead_1", "someone@business.test");
    const claims = verifyUnsubscribeToken(token)!;
    expect(claims.leadId).toBe("lead_1");
    expect(claims.email).toBe("someone@business.test");
    expect(claims.exp).toBeGreaterThan(claims.iat ?? 0); // 180d validity
  });

  it("rejects tampered tokens", () => {
    const token = createUnsubscribeToken("lead_1", "a@b.test");
    expect(verifyUnsubscribeToken(token.slice(0, -2) + "xx")).toBeNull();
    expect(verifyUnsubscribeToken("garbage")).toBeNull();
  });
});
