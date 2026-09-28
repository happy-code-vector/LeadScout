import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Email from "next-auth/providers/email";
import { authConfig } from "../auth.config";
import { prisma } from "./lib/db";
import { log } from "./lib/logger";
import { sendMagicLink } from "./lib/outreach/magic-link";

/**
 * Email magic-link auth (spec: "Before deploying, add Auth.js with an email
 * magic link"). Enabled in deployment via AUTH_ENABLED=true — local dev stays
 * frictionless. The magic-link email goes out through the first active
 * mailbox; with none configured it is logged instead (dev convenience).
 */

const ALLOWED = (process.env.AUTH_ALLOWED_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Email({
      // Placeholder transport — the custom sendVerificationRequest below
      // routes through the mailbox configured in Settings instead.
      server: { host: "localhost", port: 1025 },
      from: process.env.APP_BASE_URL
        ? `LeadScout <no-reply@${new URL(process.env.APP_BASE_URL).hostname}>`
        : "LeadScout",
      async sendVerificationRequest({ identifier, url }) {
        if (ALLOWED.length > 0 && !ALLOWED.includes(identifier.toLowerCase())) {
          throw new Error("This email is not on the allowlist (AUTH_ALLOWED_EMAILS)");
        }
        try {
          await sendMagicLink(identifier, url);
        } catch (err) {
          log.error("magic link send failed", { to: identifier, err });
          throw new Error("Could not send the sign-in email — is a mailbox configured in Settings?");
        }
      },
    }),
  ],
});
