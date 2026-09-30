# Password Auth with Root-Seeded Account and Approval Gate

**Date:** 2026-09-30
**Status:** Approved (design)
**Supersedes:** email magic-link auth (spec.md "Deploying" section, line ~335)

## Problem

The deployed app requires an email magic link to sign in, which needs a
configured SMTP mailbox — creating a first-boot deadlock (Settings is behind
the login it protects) and ongoing friction for a VPS deployment with no mail
infrastructure. The roadmap includes multi-user/teams.

## Decision

Replace the magic link with simple email/password auth:

- A **root** account is seeded from `.env` on first boot.
- **Anyone can sign up** with email + password; accounts start `PENDING`.
- **Root approves or deletes** pending users; only `ACTIVE` users may sign in.
- Any signed-in user can change their own password.

Alternatives considered and rejected:

- **Google OAuth via Auth.js** — works, but the operator wanted a path toward
  multi-user without external IdP management.
- **Firebase Auth** — teams are a Prisma data-scoping problem, not an IdP
  problem; Firebase buys its complexity back only when a mobile app or its
  ecosystem services arrive, which is not on the roadmap.
- **Keep magic link as fallback** — removed for simplicity (decision 2026-09-30).

## 1. Data model

`User` gains (SQLite: plain text, validated by Zod in `src/lib/domain.ts`):

| Field | Type | Values | Default |
|---|---|---|---|
| `passwordHash` | String? | scrypt hash | null |
| `role` | String | `ROOT` \| `USER` | `USER` |
| `status` | String | `PENDING` \| `ACTIVE` | `PENDING` |

`Account`, `Session`, `VerificationToken` models are **dropped** (adapter-only
tables; credentials + JWT sessions never read them). The `@auth/prisma-adapter`
dependency is removed.

## 2. Root bootstrap

Idempotent step in `scripts/start-all.ts` (after migrate/seed), implemented as
`src/db/ensure-root.ts`:

- If no user with `role = ROOT` exists → create from `ROOT_EMAIL` +
  `ROOT_PASSWORD` env (scrypt-hashed, `status: ACTIVE`).
- If a root exists → do nothing. **DB hash always wins; the `.env` password is
  only ever read at creation.** Changing the password in the app permanently
  ignores the env value.
- No root and env vars missing → loud boot warning; auth otherwise functional.

## 3. Sign-in

- Credentials provider in `src/auth.ts`; JWT session strategy (unchanged —
  the edge middleware decodes it without DB access).
- Custom `/signin` page (`pages.signIn: "/signin"` — a real page this time;
  pointing `pages.signIn` at `/api/auth/signin` caused the redirect loop fixed
  on 2026-09-30 and must not be repeated).
- Login outcomes: `ACTIVE` + correct password → session; `PENDING` →
  "Your account is awaiting verification"; otherwise "Invalid email or
  password" (generic, no user enumeration).
- In-memory throttle: 5 failed attempts per email → 1-minute lockout.
- Removed: Email provider, `sendMagicLink` (`src/lib/outreach/magic-link.ts`),
  `AUTH_LOG_MAGIC_LINK`, `AUTH_ALLOWED_EMAILS` (approval flow replaces the
  allowlist).

## 4. Signup + approval

- Public `/signup` page (added to middleware `PUBLIC_PREFIXES`) → creates a
  `PENDING` user with hashed password. Duplicate email → "already registered".
- `/admin/users` page, gated in middleware to `role = ROOT`: pending first,
  **Approve** (→ `ACTIVE`) or **Delete** (rejection is deletion; the person
  may re-sign up).

## 5. Password management

Settings → Account section: current + new password →
`POST /api/account/password`; verifies the current hash before writing.
Available to every signed-in user for their own account.

## 6. Env changes

| Var | Change |
|---|---|
| `ROOT_EMAIL`, `ROOT_PASSWORD` | **added** |
| `AUTH_SECRET` | unchanged (JWT signing) |
| `APP_BASE_URL` | unchanged (unsubscribe links) |
| `AUTH_ALLOWED_EMAILS` | removed |
| `AUTH_LOG_MAGIC_LINK` | removed |

## 7. Testing (Vitest, repo style)

- scrypt hash/verify roundtrip + wrong-password rejection
- ensure-root: creates once, never overwrites, warns when env missing
- authorize states: no user / pending / wrong password / active
- signup validation + duplicate handling
- approve/delete guarded by ROOT role (non-root rejected)

## 8. Docs

README "Deploying" and spec.md auth section updated to describe password auth
and the approval workflow.

## Deployment

Set `ROOT_EMAIL` + `ROOT_PASSWORD` in the VPS `.env`, pull, build, restart —
`start-all` migrates and seeds root automatically. Sign in as root, approve
signups as they arrive. No SMTP anywhere in auth.
