// src/lib/auth/passwords.test.ts
import { describe, expect, it } from "vitest";
import { hashPassword, passwordSchema, verifyPassword } from "./passwords";

describe("hashPassword / verifyPassword", () => {
  it("verifies a password it hashed", () => {
    const stored = hashPassword("correct horse battery");
    expect(verifyPassword("correct horse battery", stored)).toBe(true);
  });

  it("rejects a wrong password", () => {
    const stored = hashPassword("correct horse battery");
    expect(verifyPassword("wrong password", stored)).toBe(false);
  });

  it("salts: same password hashes differently twice", () => {
    expect(hashPassword("same-password")).not.toBe(hashPassword("same-password"));
  });

  it("rejects null or malformed stored hashes", () => {
    expect(verifyPassword("whatever", null)).toBe(false);
    expect(verifyPassword("whatever", "garbage-without-colon")).toBe(false);
    expect(verifyPassword("whatever", ":")).toBe(false);
  });
});

describe("passwordSchema", () => {
  it("requires at least 8 characters", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("longenough1").success).toBe(true);
  });
});
