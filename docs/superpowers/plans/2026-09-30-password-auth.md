# Password Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace email magic-link auth with email/password auth: a root account seeded from `.env` (DB password always wins after first seed), open signup into a `PENDING` state, and root-only approval before platform access.

**Architecture:** Auth.js v5 stays (JWT sessions, edge middleware) but the Email provider + PrismaAdapter are replaced by a Credentials provider backed by a small pure core: scrypt password hashing (`node:crypto`), an in-memory login throttle, and a pure `evaluateLogin` decision function. Users live in the existing Prisma `User` model extended with `passwordHash`/`role`/`status`; the adapter-only tables (`Account`, `Session`, `VerificationToken`) are dropped.

**Tech Stack:** Next.js 15.5 (App Router), next-auth v5 beta, Prisma 6 + SQLite, Zod, Vitest, shadcn/ui components (already in `src/components/ui/`).

**Spec:** `docs/superpowers/specs/2026-09-30-password-auth-design.md`

## Global Constraints

- No new npm dependencies — scrypt comes from `node:crypto`; UI uses existing shadcn components.
- SQLite has no enum columns: allowed values live in `src/lib/domain.ts` as `const` arrays + Zod schemas (house convention).
- Tests: Vitest, node environment, files matching `src/**/*.test.ts`, alias `@` → `src/`, secrets provided by `vitest.config.ts`.
- Route handlers: Zod `safeParse` → `NextResponse.json({ error }, { status })`, matching `src/app/api/mailboxes/route.ts`.
- TypeScript path alias `@/*` → `src/*` (tsconfig paths; tsx resolves it).
- Commits after every task; conventional-commit style messages.
- `AUTH_ENABLED=true` gates all auth (middleware); local dev stays open when unset.

---

### Task 1: Password hashing module

**Files:**
- Create: `src/lib/auth/passwords.ts`
- Test: `src/lib/auth/passwords.test.ts`

**Interfaces:**
- Consumes: nothing (node:crypto + zod only).
- Produces: `hashPassword(plain: string): string` (format `"salthex:hashhex"`), `verifyPassword(plain: string, stored: string | null): boolean`, `passwordSchema: ZodString` (min 8, max 200), `DUMMY_HASH: string` (constant-time guard for unknown users — later tasks import it).

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/auth/passwords.test.ts`
Expected: FAIL — `Cannot find module './passwords'` (or equivalent resolve error).

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/auth/passwords.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/passwords.ts src/lib/auth/passwords.test.ts
git commit -m "feat: scrypt password hashing module"
```

---

### Task 2: Domain enums + Prisma schema migration

**Files:**
- Modify: `src/lib/domain.ts` (append after the `JOB_STATUSES` block, before the JSON helpers section)
- Modify: `prisma/schema.prisma` (User model; delete Account/Session/VerificationToken)
- Test: `src/lib/domain.test.ts` (new)

**Interfaces:**
- Consumes: existing domain.ts conventions.
- Produces: `USER_ROLES = ["ROOT","USER"]`, `userRoleSchema`, `UserRole`; `USER_STATUSES = ["PENDING","ACTIVE"]`, `userStatusSchema`, `UserStatus`. Prisma `User` rows now carry `passwordHash: string | null`, `role: string` (default `"USER"`), `status: string` (default `"PENDING"`).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/domain.test.ts
import { describe, expect, it } from "vitest";
import { userRoleSchema, userStatusSchema } from "./domain";

describe("user enums", () => {
  it("accepts the defined roles and statuses", () => {
    expect(userRoleSchema.parse("ROOT")).toBe("ROOT");
    expect(userRoleSchema.parse("USER")).toBe("USER");
    expect(userStatusSchema.parse("PENDING")).toBe("PENDING");
    expect(userStatusSchema.parse("ACTIVE")).toBe("ACTIVE");
  });

  it("rejects anything else", () => {
    expect(userRoleSchema.safeParse("ADMIN").success).toBe(false);
    expect(userStatusSchema.safeParse("BANNED").success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/domain.test.ts`
Expected: FAIL — `userRoleSchema` not exported.

- [ ] **Step 3: Add enums to domain.ts**

Insert after the `JOB_STATUSES`/`jobStatusSchema` block:

```ts
export const USER_ROLES = ["ROOT", "USER"] as const;
export const userRoleSchema = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof userRoleSchema>;

export const USER_STATUSES = ["PENDING", "ACTIVE"] as const;
export const userStatusSchema = z.enum(USER_STATUSES);
export type UserStatus = z.infer<typeof userStatusSchema>;
```

- [ ] **Step 4: Update prisma/schema.prisma**

Replace the four auth models with:

```prisma
// User was the Auth.js adapter model; password auth extends it in place.
// role/status are plain text validated by src/lib/domain.ts (SQLite: no enums).
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?
  passwordHash  String?
  role          String    @default("USER")
  status        String    @default("PENDING")
}
```

Delete the entire `model Account`, `model Session`, and `model VerificationToken` blocks (they were adapter-only; credentials + JWT sessions never read them).

- [ ] **Step 5: Run test + generate migration**

Run: `npx vitest run src/lib/domain.test.ts`
Expected: PASS.

Run: `npx prisma migrate dev --name password_auth`
Expected: prisma regenerates the client and applies a migration that adds the three User columns and drops the three tables. (Dev DB may hold adapter rows from magic-link attempts — losing them is intended.)

Run: `npx tsc --noEmit`
Expected: **likely errors in `src/auth.ts`** (`PrismaAdapter`, `Account`/`Session` imports) — that file is rewritten in Task 4. If other files reference the dropped models, note them; only `src/auth.ts` should appear. Do not fix here.

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain.ts src/lib/domain.test.ts prisma/schema.prisma prisma/migrations
git commit -m "feat: User password/role/status fields; drop adapter tables"
```

---

### Task 3: Login throttle + pure login evaluation

**Files:**
- Create: `src/lib/auth/throttle.ts`
- Create: `src/lib/auth/authenticate.ts`
- Test: `src/lib/auth/throttle.test.ts`
- Test: `src/lib/auth/authenticate.test.ts`

**Interfaces:**
- Consumes: `verifyPassword`, `DUMMY_HASH` from `./passwords` (Task 1); `prisma` from `@/lib/db`.
- Produces:
  - `isLocked(email: string, now?: number): boolean`; `recordFailure(email: string, now?: number): void`; `clearFailures(email: string): void` (5 failures → 60 s lock, sliding).
  - `type LoginUser = { id: string; email: string; role: string; status: string; passwordHash: string | null }`
  - `type LoginResult = { ok: true; user: { id: string; email: string; role: string; status: string } } | { ok: false; reason: "LOCKED" | "PENDING" | "INVALID" }`
  - `evaluateLogin(user: LoginUser | null, password: string, locked: boolean): LoginResult` (pure)
  - `authenticateUser(email: string, password: string): Promise<LoginResult>` (prisma-wired; Task 4 calls this)

- [ ] **Step 1: Write the failing throttle test**

```ts
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
    // 5th failure lands at t=4000, so the lock spans [64000, 64000)
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/auth/throttle.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement throttle**

```ts
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
```

- [ ] **Step 4: Run throttle test**

Run: `npx vitest run src/lib/auth/throttle.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing authenticate test**

```ts
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
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run src/lib/auth/authenticate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement authenticate**

```ts
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
```

- [ ] **Step 8: Run tests**

Run: `npx vitest run src/lib/auth/`
Expected: PASS — passwords (6), throttle (4), authenticate (6).

- [ ] **Step 9: Commit**

```bash
git add src/lib/auth/throttle.ts src/lib/auth/throttle.test.ts src/lib/auth/authenticate.ts src/lib/auth/authenticate.test.ts
git commit -m "feat: login throttle and pure login evaluation"
```

---

### Task 4: Credentials provider rewrite of src/auth.ts

**Files:**
- Modify: `src/auth.ts` (full rewrite)
- Modify: `auth.config.ts`
- Create: `src/types/next-auth.d.ts`
- Delete: `src/lib/outreach/magic-link.ts` (has uncommitted edits from the deploy fix — deletion supersedes them)
- Modify: `package.json` (remove `@auth/prisma-adapter`)

**Interfaces:**
- Consumes: `authenticateUser` (Task 3), `passwordSchema` (Task 1), `authConfig`.
- Produces: `export const { handlers, auth, signIn, signOut }` from `@/auth` (same shape as before — `src/app/api/auth/[...nextauth]/route.ts` keeps working unchanged). Session gains `session.user.id` and `session.user.role` (typed via the `.d.ts`). Middleware (Task 6) reads `req.auth?.role`.

- [ ] **Step 1: Rewrite auth.config.ts**

```ts
// auth.config.ts
import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config (no database imports) — shared by the Node-side
 * auth setup in src/auth.ts and the middleware.
 *
 * pages.signIn points at a real PAGE route (/signin). Never point it at
 * "/api/auth/signin" — that made Auth.js redirect the signin handler to
 * itself (infinite loop; fixed 2026-09-30).
 */
export const authConfig = {
  pages: {
    signIn: "/signin",
  },
  providers: [], // edge-safe; the Node-side setup adds the Credentials provider
  session: { strategy: "jwt" as const },
  trustHost: true,
  // Callbacks live HERE (not only in src/auth.ts) so the middleware — which
  // builds its own NextAuth from this config — also sees token/session role.
  // They are pure and edge-safe.
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.status = user.status;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? undefined;
        session.user.role = token.role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
```

- [ ] **Step 2: Create the type augmentation**

```ts
// src/types/next-auth.d.ts
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role?: string;
    status?: string;
  }
  interface Session {
    user: {
      id?: string;
      role?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    status?: string;
  }
}
```

- [ ] **Step 3: Rewrite src/auth.ts**

```ts
// src/auth.ts
import NextAuth from "next-auth";
import { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "../auth.config";
import { authenticateUser } from "./lib/auth/authenticate";
import { passwordSchema } from "./lib/auth/passwords";

/**
 * Email/password auth (spec: docs/superpowers/specs/2026-09-30-password-auth-design.md).
 * Enabled in deployment via AUTH_ENABLED=true — local dev stays frictionless.
 * Replaces the former email magic-link + PrismaAdapter setup.
 */

class PendingAccountError extends CredentialsSignin {
  code = "pending";
}

class LockedAccountError extends CredentialsSignin {
  code = "locked";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !passwordSchema.safeParse(password).success) return null;

        const result = await authenticateUser(email, password);
        if (result.ok) {
          return {
            id: result.user.id,
            email: result.user.email,
            name: null,
            image: null,
            role: result.user.role,
            status: result.user.status,
          };
        }
        if (result.reason === "PENDING") throw new PendingAccountError();
        if (result.reason === "LOCKED") throw new LockedAccountError();
        return null;
      },
    }),
  ],
  // jwt/session callbacks come from authConfig (spread above) — kept there so
  // the middleware sees user.role too.
});
```

- [ ] **Step 4: Remove the adapter dependency + magic-link file**

```bash
npm uninstall @auth/prisma-adapter
git rm src/lib/outreach/magic-link.ts
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: no errors (Task 2's `src/auth.ts` errors are gone; the augmentation types the callbacks).

Run: `npx vitest run`
Expected: all PASS.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/auth.ts auth.config.ts src/types/next-auth.d.ts package.json package-lock.json
git commit -m "feat: credentials provider replaces email magic link"
```

---

### Task 5: Root bootstrap (ensure-root) + start-all wiring

**Files:**
- Create: `src/db/ensure-root.ts`
- Test: `src/db/ensure-root.test.ts`
- Modify: `scripts/start-all.ts` (add one `run()` call)
- Modify: `package.json` (add script)

**Interfaces:**
- Consumes: `hashPassword`, `passwordSchema` (Task 1); `prisma` from `@/lib/db`.
- Produces: `deriveRootCredentials(env: NodeJS.ProcessEnv): { email: string; password: string } | "missing" | "invalid"` (pure, tested). npm script `db:ensure-root`. start-all runs it after `db:seed` on every boot.

- [ ] **Step 1: Write the failing test**

```ts
// src/db/ensure-root.test.ts
import { describe, expect, it } from "vitest";
import { deriveRootCredentials } from "./ensure-root";

describe("deriveRootCredentials", () => {
  it("normalizes a valid pair", () => {
    expect(deriveRootCredentials({ ROOT_EMAIL: " Root@Example.COM ", ROOT_PASSWORD: "longenough1" })).toEqual({
      email: "root@example.com",
      password: "longenough1",
    });
  });

  it("is 'missing' when either var is absent/empty", () => {
    expect(deriveRootCredentials({})).toBe("missing");
    expect(deriveRootCredentials({ ROOT_EMAIL: "a@b.test" })).toBe("missing");
    expect(deriveRootCredentials({ ROOT_PASSWORD: "longenough1" })).toBe("missing");
  });

  it("is 'invalid' for a malformed email or short password", () => {
    expect(deriveRootCredentials({ ROOT_EMAIL: "not-an-email", ROOT_PASSWORD: "longenough1" })).toBe("invalid");
    expect(deriveRootCredentials({ ROOT_EMAIL: "a@b.test", ROOT_PASSWORD: "short" })).toBe("invalid");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/db/ensure-root.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement ensure-root**

```ts
// src/db/ensure-root.ts
import { prisma } from "@/lib/db";
import { hashPassword, passwordSchema } from "@/lib/auth/passwords";

/**
 * Idempotent root bootstrap, run on every boot (start-all):
 *  - no ROOT user + valid ROOT_EMAIL/ROOT_PASSWORD in env → create it (ACTIVE).
 *  - a user already exists at that email (e.g. a leftover magic-link-era row)
 *    → promote it to ROOT/ACTIVE and set the password hash.
 *  - a ROOT user already exists → do nothing. The DB password always wins;
 *    ROOT_PASSWORD in .env is read only at creation and ignored afterwards.
 */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function deriveRootCredentials(
  env: NodeJS.ProcessEnv,
): { email: string; password: string } | "missing" | "invalid" {
  const email = (env.ROOT_EMAIL ?? "").trim().toLowerCase();
  const password = env.ROOT_PASSWORD ?? "";
  if (!email || !password) return "missing";
  if (!EMAIL_RE.test(email) || !passwordSchema.safeParse(password).success) return "invalid";
  return { email, password };
}

async function main() {
  const existingRoot = await prisma.user.findFirst({ where: { role: "ROOT" }, select: { id: true } });
  if (existingRoot) {
    console.log("[ensure-root] root exists — ROOT_PASSWORD in .env ignored (DB password wins)");
    return;
  }

  const creds = deriveRootCredentials(process.env);
  if (creds === "missing") {
    console.warn(
      "[ensure-root] no ROOT user and ROOT_EMAIL/ROOT_PASSWORD are unset — nobody can sign in or approve signups. Set them in .env and restart.",
    );
    return;
  }
  if (creds === "invalid") {
    console.warn(
      "[ensure-root] ROOT_EMAIL/ROOT_PASSWORD invalid (email malformed or password under 8 chars) — fix .env and restart.",
    );
    return;
  }

  const byEmail = await prisma.user.findUnique({ where: { email: creds.email }, select: { id: true } });
  if (byEmail) {
    await prisma.user.update({
      where: { id: byEmail.id },
      data: { passwordHash: hashPassword(creds.password), role: "ROOT", status: "ACTIVE" },
    });
    console.log(`[ensure-root] promoted existing user ${creds.email} to root`);
    return;
  }

  await prisma.user.create({
    data: {
      email: creds.email,
      passwordHash: hashPassword(creds.password),
      role: "ROOT",
      status: "ACTIVE",
    },
  });
  console.log(`[ensure-root] created root ${creds.email}`);
}

// Run only when executed directly (`tsx src/db/ensure-root.ts`) — the test
// suite imports deriveRootCredentials from this module and must not boot DB.
const isDirectRun = process.argv[1]?.replace(/\\/g, "/").includes("ensure-root");
if (isDirectRun) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest run src/db/ensure-root.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire into package.json and start-all**

In `package.json` scripts, next to `db:seed`:

```json
    "db:seed": "tsx src/db/seed.ts",
    "db:ensure-root": "tsx src/db/ensure-root.ts",
```

In `scripts/start-all.ts`, after the seed line inside `main()`:

```ts
  await run("npm", ["run", "db:seed"]);
  await run("npm", ["run", "db:ensure-root"]);
```

- [ ] **Step 6: Smoke-test locally**

Run: `ROOT_EMAIL=root@local.test ROOT_PASSWORD=localroot123 npx tsx src/db/ensure-root.ts`
Expected: `[ensure-root] created root root@local.test` (or the "promoted" variant).

Run it a second time — expected: `[ensure-root] root exists — ROOT_PASSWORD in .env ignored (DB password wins)`.

- [ ] **Step 7: Commit**

```bash
git add src/db/ensure-root.ts src/db/ensure-root.test.ts scripts/start-all.ts package.json
git commit -m "feat: idempotent root bootstrap from ROOT_EMAIL/ROOT_PASSWORD"
```

---

### Task 6: Middleware update + signin page

**Files:**
- Modify: `src/middleware.ts`
- Create: `src/app/signin/page.tsx`
- Create: `src/app/signin/signin-form.tsx`

**Interfaces:**
- Consumes: Auth.js `pages.signIn: "/signin"` (Task 4); `signIn` from `next-auth/react` (client).
- Produces: public `/signin` page; middleware redirects unauthenticated users to `/signin?callbackUrl=…`; `/admin/*` requires `req.auth?.role === "ROOT"` (used by Task 8).

- [ ] **Step 1: Update the middleware**

Replace the full contents of `src/middleware.ts`:

```ts
// src/middleware.ts
import NextAuth from "next-auth";
import { authConfig } from "../auth.config";

/**
 * Auth gate for deployments (AUTH_ENABLED=true + AUTH_SECRET). Local dev
 * stays open. Always public: Auth.js endpoints, signup/signin pages, the
 * one-click unsubscribe link (CAN-SPAM: no login), and the dev inbox tools.
 * /admin/* additionally requires the ROOT role.
 */

const PUBLIC_PREFIXES = ["/api/auth", "/api/dev", "/u/", "/dev/", "/signin", "/signup"];

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  if (process.env.AUTH_ENABLED !== "true") return;

  const path = req.nextUrl.pathname;
  if (PUBLIC_PREFIXES.some((p) => path.startsWith(p))) return;
  if (req.auth) {
    if (path.startsWith("/admin") && req.auth.user?.role !== "ROOT") {
      return Response.redirect(new URL("/", req.url));
    }
    return;
  }

  const signIn = new URL("/signin", req.url);
  signIn.searchParams.set("callbackUrl", req.url);
  return Response.redirect(signIn);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 2: Create the signin page**

```tsx
// src/app/signin/page.tsx
import { SigninForm } from "./signin-form";

export const metadata = { title: "Sign in" };

export default function SigninPage() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to LeadScout</h1>
          <p className="text-sm text-muted-foreground">Enter your account credentials below.</p>
        </div>
        <SigninForm />
        <p className="text-center text-sm text-muted-foreground">
          No account? <a className="underline underline-offset-4" href="/signup">Request access</a>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create the form component**

```tsx
// src/app/signin/signin-form.tsx
"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SigninForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn("credentials", { email, password, redirect: false });
    setBusy(false);
    if (res?.error) {
      if (res.error.toLowerCase().includes("pending")) {
        setError("Your account is awaiting verification by an administrator.");
      } else if (res.error.toLowerCase().includes("locked")) {
        setError("Too many failed attempts — try again in a minute.");
      } else {
        setError("Invalid email or password.");
      }
      return;
    }
    window.location.href = "/";
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: build succeeds.

Run: `npm run dev` then open `http://localhost:3000/signin`
Expected: the form renders. (Full login requires the Task 5 root to exist — with `AUTH_ENABLED=true` in `.env` temporarily, sign in with the root created by the smoke test; expect a redirect to `/`.)

- [ ] **Step 5: Commit**

```bash
git add src/middleware.ts src/app/signin/
git commit -m "feat: /signin page and updated auth middleware with ROOT gate"
```

---

### Task 7: Signup API + page

**Files:**
- Create: `src/app/api/auth/signup/route.ts`
- Create: `src/app/signup/page.tsx`
- Create: `src/app/signup/signup-form.tsx`

**Interfaces:**
- Consumes: `hashPassword`, `passwordSchema` (Task 1); `prisma` from `@/lib/db`; Zod + `NextResponse` route conventions.
- Produces: `POST /api/auth/signup` with body `{ email, password }` → `201 { status: "PENDING" }`, `400 { error }` on validation, `409 { error: "An account with this email already exists." }` on duplicates.

- [ ] **Step 1: Create the route handler**

```ts
// src/app/api/auth/signup/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, passwordSchema } from "@/lib/auth/passwords";

const signupSchema = z.object({
  email: z.string().email().max(200),
  password: passwordSchema,
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  await prisma.user.create({
    data: { email, passwordHash: hashPassword(parsed.data.password), role: "USER", status: "PENDING" },
  });
  return NextResponse.json({ status: "PENDING" }, { status: 201 });
}
```

- [ ] **Step 2: Create the page**

```tsx
// src/app/signup/page.tsx
import { SignupForm } from "./signup-form";

export const metadata = { title: "Request access" };

export default function SignupPage() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Request access</h1>
          <p className="text-sm text-muted-foreground">
            Accounts are reviewed by an administrator before sign-in is enabled.
          </p>
        </div>
        <SignupForm />
        <p className="text-center text-sm text-muted-foreground">
          Already have an account? <a className="underline underline-offset-4" href="/signin">Sign in</a>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create the form**

```tsx
// src/app/signup/signup-form.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Signup failed — please try again.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <p className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
        Request received. You&apos;ll be able to sign in once an administrator verifies your account.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password (min 8 characters)</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Submitting…" : "Request access"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: build succeeds.

Run with `npm run dev` + `AUTH_ENABLED=true`:
- `curl -X POST http://localhost:3000/api/auth/signup -H "Content-Type: application/json" -d '{"email":"teammate@example.test","password":"teammate1"}'` → `201 {"status":"PENDING"}`
- Same command again → `409`
- Signing in as `teammate@example.test` on `/signin` → the "awaiting verification" message.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/signup/ src/app/signup/
git commit -m "feat: open signup into PENDING state"
```

---

### Task 8: Admin users page (approve/delete) + nav + sign-out

**Files:**
- Create: `src/app/admin/users/page.tsx`
- Create: `src/app/admin/users/users-client.tsx`
- Create: `src/app/api/admin/users/[id]/route.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/app-shell.tsx`

**Interfaces:**
- Consumes: `auth()` from `@/auth` (Task 4 session with `user.role`); ROOT middleware gate (Task 6); shadcn `Table`/`Button`/`Badge`.
- Produces: `POST /api/admin/users/[id]` with `{ action: "approve" | "delete" }` → `200 { ok: true }`, `403` for non-ROOT sessions, `404` unknown id. Nav shows "Users" + account footer only when signed in; ROOT also gets the admin link.

- [ ] **Step 1: Create the admin API route**

```ts
// src/app/api/admin/users/[id]/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

const actionSchema = z.object({ action: z.enum(["approve", "delete"]) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "ROOT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  if (parsed.data.action === "approve") {
    const user = await prisma.user.update({
      where: { id },
      data: { status: "ACTIVE" },
      select: { id: true, email: true },
    }).catch(() => null);
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  const deleted = await prisma.user.delete({ where: { id }, select: { id: true } }).catch(() => null);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Create the server page**

```tsx
// src/app/admin/users/page.tsx
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { UsersClient } from "./users-client";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    orderBy: [{ status: "asc" }, { email: "asc" }],
    select: { id: true, email: true, role: true, status: true },
  });
  return (
    <>
      <PageHeader
        title="Users"
        description="Approve sign-up requests and manage account access."
      />
      <UsersClient
        users={users.map((u) => ({ ...u, createdAt: null }))}
      />
    </>
  );
}
```

(Note: `createdAt` isn't on the User model; `UsersClient` accepts `createdAt: string | null` so a future migration can display it without an interface change. PENDING sorts before ACTIVE only incidentally — the client re-sorts pending first.)

- [ ] **Step 3: Create the client table**

```tsx
// src/app/admin/users/users-client.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Row = { id: string; email: string; role: string; status: string; createdAt: string | null };

export function UsersClient({ users }: { users: Row[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  const ordered = [...users].sort((a, b) => {
    const pending = (u: Row) => (u.status === "PENDING" ? 0 : 1);
    return pending(a) - pending(b) || a.email.localeCompare(b.email);
  });

  async function act(id: string, action: "approve" | "delete") {
    setBusyId(id);
    await fetch(`/api/admin/users/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusyId(null);
    router.refresh();
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ordered.map((u) => (
          <TableRow key={u.id}>
            <TableCell className="font-medium">{u.email}</TableCell>
            <TableCell>{u.role}</TableCell>
            <TableCell>
              <Badge variant={u.status === "ACTIVE" ? "default" : "secondary"}>{u.status}</Badge>
            </TableCell>
            <TableCell className="space-x-2 text-right">
              {u.status === "PENDING" ? (
                <Button size="sm" disabled={busyId === u.id} onClick={() => act(u.id, "approve")}>
                  Approve
                </Button>
              ) : null}
              {u.role !== "ROOT" ? (
                <Button size="sm" variant="destructive" disabled={busyId === u.id} onClick={() => act(u.id, "delete")}>
                  Delete
                </Button>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 4: Pass session into AppShell from the layout**

`src/app/layout.tsx` — make the component async and fetch the session:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/app-shell";
import { auth } from "@/auth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "LeadScout",
    template: "%s · LeadScout",
  },
  description:
    "Find local businesses with no or outdated websites, score them, and run outreach.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppShell user={session?.user ? { email: session.user.email ?? "", role: session.user.role } : null}>
          {children}
        </AppShell>
        <Toaster />
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Add the account footer + admin nav to AppShell**

In `src/components/app-shell.tsx`:

Change the component signature and imports:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  FileText,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Phone,
  Radar,
  Settings,
  ShieldCheck,
  Tags,
  Users,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

type ShellUser = { email: string; role?: string };

export function AppShell({
  children,
  user = null,
}: {
  children: React.ReactNode;
  user?: ShellUser | null;
}) {
  const pathname = usePathname();
  const nav = user?.role === "ROOT"
    ? [
        ...NAV,
        { href: "/admin/users", label: "Access", icon: ShieldCheck },
      ]
    : NAV;
```

Then, in the JSX, change `NAV.map` to `nav.map`, and immediately after the closing `</nav>` (before `</aside>`) add:

```tsx
        {user ? (
          <div className="border-t px-4 py-3">
            <div className="truncate text-xs text-muted-foreground">{user.email}</div>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/signin" })}
              className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-sidebar-accent-foreground"
            >
              <LogOut className="size-3.5" /> Sign out
            </button>
          </div>
        ) : null}
```

- [ ] **Step 6: Verify**

Run: `npm run build`
Expected: build succeeds.

Run with `npm run dev` + `AUTH_ENABLED=true`:
- As root: sidebar shows "Access"; `/admin/users` lists the PENDING teammate from Task 7; Approve makes them sign-in-able; Delete removes.
- As a USER: `/admin/users` redirects to `/`.
- Sign out returns to `/signin`.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/ src/app/api/admin/ src/app/layout.tsx src/components/app-shell.tsx
git commit -m "feat: root-only user approval admin and sign-out"
```

---

### Task 9: Password change (Settings → Account)

**Files:**
- Create: `src/app/api/account/password/route.ts`
- Create: `src/app/settings/account-card.tsx`
- Modify: `src/app/settings/page.tsx` (render the card after `<SettingsClient … />`)

**Interfaces:**
- Consumes: `auth()` from `@/auth`; `verifyPassword`, `hashPassword`, `passwordSchema` (Task 1); `prisma`.
- Produces: `POST /api/account/password` with `{ currentPassword, newPassword }` → `200 { ok: true }`, `400` validation, `401` not signed in, `403` wrong current password.

- [ ] **Step 1: Create the route**

```ts
// src/app/api/account/password/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { hashPassword, passwordSchema, verifyPassword } from "@/lib/auth/passwords";

const changeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = changeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !verifyPassword(parsed.data.currentPassword, user.passwordHash)) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 403 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(parsed.data.newPassword) },
  });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Create the card component**

```tsx
// src/app/settings/account-card.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AccountCard({ email }: { email: string }) {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setBusy(false);
    if (res.ok) {
      setMessage({ kind: "ok", text: "Password updated." });
      setCurrent("");
      setNew("");
    } else {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setMessage({ kind: "err", text: data?.error ?? "Update failed." });
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>
          Signed in as {email}. Changes take effect on your next sign-in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="max-w-sm space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password (min 8 characters)</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNew(e.target.value)}
            />
          </div>
          {message ? (
            <p className={`text-sm ${message.kind === "ok" ? "text-muted-foreground" : "text-destructive"}`}>
              {message.text}
            </p>
          ) : null}
          <Button type="submit" disabled={busy}>
            {busy ? "Updating…" : "Change password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Render it from the settings page**

In `src/app/settings/page.tsx`: add `import { auth } from "@/auth";` and `import { AccountCard } from "./account-card";` at the top, then inside `SettingsPage()` fetch the session and render the card after `<SettingsClient … />`:

```tsx
  const session = await auth();
```

and after the existing `<SettingsClient … />` element:

```tsx
      {session?.user?.email ? <AccountCard email={session.user.email} /> : null}
```

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: build succeeds.

Run with `npm run dev` + `AUTH_ENABLED=true`: Settings → Account → change root's password → sign out → old password fails, new password works. (This also proves the "DB password wins over `.env`" rule: `ensure-root` won't restore the env password on next boot.)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/account/ src/app/settings/
git commit -m "feat: self-service password change in Settings"
```

---

### Task 10: Cleanup, env example, docs

**Files:**
- Modify: `.env.example`
- Modify: `README.md` (Deploying + auth paragraph)
- Modify: `spec.md` (auth line ~335)

**Interfaces:**
- Consumes: everything above.
- Produces: docs and env template consistent with the shipped behavior.

- [ ] **Step 1: Update .env.example**

Add after the `UNSUBSCRIBE_JWT_SECRET` line:

```ini
ROOT_EMAIL=                      # initial root login (used only until the password is changed in-app)
ROOT_PASSWORD=                   # min 8 chars; ignored once root's DB password exists
```

- [ ] **Step 2: Update README.md**

Replace the auth paragraph (currently the "Auth (deploy-only): …" block under *Deploying*) with:

```markdown
Auth (deploy-only): set `AUTH_ENABLED=true`, a long `AUTH_SECRET`, and
`ROOT_EMAIL` + `ROOT_PASSWORD` — `start:all` seeds that root account on first
boot (afterward the in-app password always wins and the env values are
ignored). Sign-in is email/password. Anyone can request access at `/signup`;
accounts stay `PENDING` until a root approves them under **Access**
(`/admin/users`). Passwords are changed in Settings → Account. The
unsubscribe endpoint (`/u/…`) always stays public.
```

- [ ] **Step 3: Update spec.md**

Find the line (~335):

```markdown
There is no auth in phase 1 (single user, local). Before deploying, add Auth.js with an email magic link.
```

Replace with:

```markdown
There is no auth in phase 1 (single user, local). Deployment uses Auth.js with email/password: a root account seeded from `ROOT_EMAIL`/`ROOT_PASSWORD` (DB password wins after first seed), open signup into `PENDING`, and root-only approval. See docs/superpowers/specs/2026-09-30-password-auth-design.md.
```

- [ ] **Step 4: Sweep for stragglers**

Run: `grep -rn "AUTH_ALLOWED_EMAILS\|AUTH_LOG_MAGIC_LINK\|magic-link\|sendMagicLink\|Mailbox.*magic" src/ scripts/ README.md`
Expected: no matches.

Run: `npx vitest run`
Expected: full suite PASS.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add .env.example README.md spec.md
git commit -m "docs: password auth deployment story"
```

---

## Final verification (after all tasks)

- [ ] `npx vitest run` — full suite green
- [ ] `npm run build` — production build succeeds
- [ ] Local end-to-end with `AUTH_ENABLED=true` in `.env`:
  1. `npm run db:ensure-root` (or boot via `npm run start:all`) → root created
  2. `/signin` as root → dashboard
  3. `/signup` as teammate → "awaiting verification"
  4. `/admin/users` as root → Approve → teammate signs in
  5. Settings → Account → change password → re-login works; restart the app → env password does **not** override the changed one
  6. `/u/<token>` still public; 6 bad passwords → 1-minute lock message
- [ ] Deploy to the VPS: `git pull && npm ci && npm run build && sudo systemctl restart leadscout` with `ROOT_EMAIL`/`ROOT_PASSWORD` added to `/home/ubuntu/LeadScout/.env` — watch `journalctl -u leadscout` for `[ensure-root] created root …`
