// src/lib/auth/authenticate.test.ts
import { describe, expect, it } from "vitest";
import { evaluateLogin, type LoginUser } from "./authenticate";
import { hashPassword } from "./passwords";

function user(overrides: Partial<LoginUser> = {}): LoginUser {
  return {
    id: "u1",
    email: "root@example.test",
    role: "ROOT",
    status: "ACTIVE",
    passwordHash: hashPassword("supersecret1"),
    ...overrides,
  };
}

describe("evaluateLogin", () => {
  it("succeeds for an ACTIVE user with the right password", () => {
    const r = evaluateLogin(user(), "supersecret1", false);
    expect(r).toEqual({ ok: true, user: { id: "u1", email: "root@example.test", role: "ROOT", status: "ACTIVE" } });
  });

  it("is INVALID for a wrong password", () => {
    expect(evaluateLogin(user(), "wrongpass1", false)).toEqual({ ok: false, reason: "INVALID" });
  });

  it("is INVALID for a missing user", () => {
    expect(evaluateLogin(null, "whatever12", false)).toEqual({ ok: false, reason: "INVALID" });
  });

  it("is INVALID for a user with no password set", () => {
    expect(evaluateLogin(user({ passwordHash: null }), "whatever12", false)).toEqual({ ok: false, reason: "INVALID" });
  });

  it("is PENDING for an unapproved user with the right password", () => {
    expect(evaluateLogin(user({ status: "PENDING" }), "supersecret1", false)).toEqual({ ok: false, reason: "PENDING" });
  });

  it("is LOCKED regardless of credentials", () => {
    expect(evaluateLogin(user(), "supersecret1", true)).toEqual({ ok: false, reason: "LOCKED" });
    expect(evaluateLogin(null, "whatever12", true)).toEqual({ ok: false, reason: "LOCKED" });
  });
});
