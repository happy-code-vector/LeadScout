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
        // The callback signature intersects the database-strategy branch
        // (AdapterUser.id: string), so `id` is typed required — hence the `!`.
        // sub is always set at signIn for JWT sessions.
        session.user.id = token.sub!;
        session.user.role = token.role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
