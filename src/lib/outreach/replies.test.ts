import { describe, expect, it } from "vitest";
import {
  extractBounceAddress,
  findAnsweredEventId,
  looksLikeBounce,
  type IncomingMessage,
} from "./replies";

describe("looksLikeBounce", () => {
  it("recognizes DSN markers", () => {
    expect(looksLikeBounce({ isDeliveryStatus: true })).toBe(true);
    expect(looksLikeBounce({ from: "MAILER-DAEMON@googlemail.com" })).toBe(true);
    expect(looksLikeBounce({ from: "postmaster@somewhere.com" })).toBe(true);
    expect(looksLikeBounce({ subject: "Undelivered Mail Returned to Sender" })).toBe(true);
    expect(looksLikeBounce({ subject: "Delivery Status Notification (Failure)" })).toBe(true);
  });

  it("does not flag human replies", () => {
    expect(looksLikeBounce({ from: "owner@business.test", subject: "Re: website?" })).toBe(false);
    expect(looksLikeBounce({})).toBe(false);
  });
});

describe("extractBounceAddress", () => {
  it("pulls Final-Recipient from a DSN body", () => {
    const text = `The following address failed:\n\nFinal-Recipient: rfc822; info@baxter.test\nAction: failed`;
    expect(extractBounceAddress(text)).toBe("info@baxter.test");
  });

  it("handles 'Failed Recipient' wording and returns null otherwise", () => {
    expect(extractBounceAddress("Remote server said: failed recipient: a@b.test")).toBe("a@b.test");
    expect(extractBounceAddress("anything else")).toBeNull();
    expect(extractBounceAddress(undefined)).toBeNull();
  });
});

describe("findAnsweredEventId", () => {
  const sent = [
    { id: "e1", messageId: "<one@leadscout.test>" },
    { id: "e2", messageId: "<two@leadscout.test>" },
  ];

  it("matches In-Reply-To case-insensitively", () => {
    const msg: IncomingMessage = { inReplyTo: "<TWO@leadscout.test>" };
    expect(findAnsweredEventId(msg, sent)).toBe("e2");
  });

  it("falls back to References", () => {
    const msg: IncomingMessage = {
      references: ["<other@elsewhere.test>", "<one@leadscout.test>"],
    };
    expect(findAnsweredEventId(msg, sent)).toBe("e1");
  });

  it("returns null for unrelated messages", () => {
    expect(findAnsweredEventId({ inReplyTo: "<unknown@x.test>" }, sent)).toBeNull();
    expect(findAnsweredEventId({}, sent)).toBeNull();
  });
});
