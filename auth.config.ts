import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config (no database imports) — shared by the Node-side
 * auth setup in src/auth.ts and the middleware.
 */
export const authConfig = {
  // No pages.signIn override: setting it to "/api/auth/signin" (the built-in
  // route itself) makes Auth.js redirect the signin page to itself — an
  // infinite redirect loop behind any proxy. Unset, GET /api/auth/signin
  // renders the built-in email magic-link form.
  providers: [], // edge-safe; the Node-side setup adds the Email provider
  session: { strategy: "jwt" as const },
  trustHost: true,
} satisfies NextAuthConfig;
