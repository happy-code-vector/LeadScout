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
