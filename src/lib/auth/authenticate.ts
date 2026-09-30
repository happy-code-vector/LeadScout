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
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  const result = evaluateLogin(user ?? null, password, locked);
  if (result.ok) {
    clearFailures(email);
  } else if (result.reason !== "LOCKED") {
    recordFailure(email);
  }
  return result;
}
