import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config (no database imports) — shared by the Node-side
 * auth setup in src/auth.ts and the middleware.
 */
export const authConfig = {
  pages: {
    signIn: "/api/auth/signin",
  },
  providers: [], // edge-safe; the Node-side setup adds the Email provider
  session: { strategy: "jwt" as const },
  trustHost: true,
} satisfies NextAuthConfig;
