// src/lib/auth/authenticate.ts
import { prisma } from "@/lib/db";
import { DUMMY_HASH, verifyPassword } from "./passwords";
import { clearFailures, isLocked, recordFailure } from "./throttle";

export type LoginUser = {
  id: string;
  email: string;
  role: string;
  status: string;
  passwordHash: string | null;
};

export type LoginResult =
  | { ok: true; user: { id: string; email: string; role: string; status: string } }
  | { ok: false; reason: "LOCKED" | "PENDING" | "INVALID" };

/** Pure decision — no I/O; unit-tested directly. */
export function evaluateLogin(user: LoginUser | null, password: string, locked: boolean): LoginResult {
  if (locked) return { ok: false, reason: "LOCKED" };
  // Always burn one scrypt so timing doesn't reveal whether the email exists.
  const matches = verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.passwordHash || !matches) return { ok: false, reason: "INVALID" };
  if (user.status !== "ACTIVE") return { ok: false, reason: "PENDING" };
  return { ok: true, user: { id: user.id, email: user.email, role: user.role, status: user.status } };
}

/** Wired version used by the Credentials provider. */
export async function authenticateUser(email: string, password: string): Promise<LoginResult> {
  const locked = isLocked(email);
  const row = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  // Prisma's email is nullable (String?) but LoginUser's is not — a row with
  // a null email can never satisfy the lookup, so treat it as "no such user"
  // (the dummy scrypt inside evaluateLogin still burns for timing safety).
  const user: LoginUser | null =
    row && row.email != null
      ? { id: row.id, email: row.email, role: row.role, status: row.status, passwordHash: row.passwordHash }
      : null;
  const result = evaluateLogin(user, password, locked);
  if (result.ok) {
    clearFailures(email);
  } else if (result.reason !== "LOCKED") {
    recordFailure(email);
  }
  return result;
}
