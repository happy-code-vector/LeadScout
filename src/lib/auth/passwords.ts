// src/lib/auth/passwords.ts
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Password hashing for credentials auth. scrypt from node:crypto — no extra
 * dependency. Stored format: "<salt-hex>:<hash-hex>" (16-byte salt, 64-byte
 * key, scrypt defaults N=16384 r=8 p=1).
 */

export const passwordSchema = z.string().min(8).max(200);

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(plain: string, stored: string | null): boolean {
  if (!stored) return false;
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  if (expected.length === 0) return false;
  const actual = scryptSync(plain, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(expected, actual);
}

/** Burned on unknown-user logins so response time doesn't reveal existence. */
export const DUMMY_HASH = hashPassword("timing-equalizer");
