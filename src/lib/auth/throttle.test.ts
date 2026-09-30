// src/lib/auth/throttle.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { clearFailures, isLocked, recordFailure } from "./throttle";

const MIN = 60_000;

describe("login throttle", () => {
  beforeEach(() => clearFailures("a@b.test"));

  it("is open before 5 failures", () => {
    for (let i = 0; i < 4; i++) recordFailure("a@b.test", i * MIN);
    expect(isLocked("a@b.test", 5 * MIN)).toBe(false);
  });

  it("locks on the 5th failure for 60s", () => {
    for (let i = 0; i < 5; i++) recordFailure("a@b.test", i * 1000);
    expect(isLocked("a@b.test", 4_000 + 59_999)).toBe(true);
    expect(isLocked("a@b.test", 4_000 + 60_001)).toBe(false);
  });

  it("clears on success", () => {
    for (let i = 0; i < 5; i++) recordFailure("a@b.test", i * 1000);
    clearFailures("a@b.test");
    expect(isLocked("a@b.test", 6_000)).toBe(false);
  });

  it("keys by email case-insensitively", () => {
    for (let i = 0; i < 5; i++) recordFailure("A@B.test", i * 1000);
    expect(isLocked("a@b.test", 5_500)).toBe(true);
  });
});
