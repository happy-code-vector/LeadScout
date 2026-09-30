// src/lib/auth/throttle.ts
/**
 * In-memory login throttle: 5 failures → 60 s lock per (lowercased) email.
 * Process-local — resets on restart, which is fine for a single-instance
 * deployment (web + worker share one machine by design).
 */

const MAX_FAILURES = 5;
const LOCK_MS = 60_000;

type Entry = { failures: number; lockedUntil: number };
const attempts = new Map<string, Entry>();

export function isLocked(email: string, now: number = Date.now()): boolean {
  const entry = attempts.get(email.toLowerCase());
  return !!entry && entry.lockedUntil > now;
}

export function recordFailure(email: string, now: number = Date.now()): void {
  const key = email.toLowerCase();
  const entry = attempts.get(key) ?? { failures: 0, lockedUntil: 0 };
  entry.failures += 1;
  // At/after the threshold every new failure re-arms the lock.
  if (entry.failures >= MAX_FAILURES && entry.lockedUntil <= now) {
    entry.lockedUntil = now + LOCK_MS;
  }
  attempts.set(key, entry);
}

export function clearFailures(email: string): void {
  attempts.delete(email.toLowerCase());
}
