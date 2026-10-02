import NextAuth from "next-auth";
import { authConfig } from "../auth.config";

/**
 * Auth gate for deployments (AUTH_ENABLED=true + AUTH_SECRET). Public pages
 * are open; only the manager areas (/app/** and /api/**, minus the public
 * islands) require a session. Always public: auth endpoints, signup/signin,
 * the one-click unsubscribe link, the dev tools, and /api/public/*.
 */

const PUBLIC_PREFIXES = ["/api/auth", "/api/dev", "/api/public", "/u/", "/dev/", "/signin", "/signup"];

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  if (process.env.AUTH_ENABLED !== "true") return;

  const path = req.nextUrl.pathname;
  const isManagerArea = path.startsWith("/app") || path.startsWith("/api");
  if (PUBLIC_PREFIXES.some((p) => path.startsWith(p)) || !isManagerArea) return;

  if (req.auth) {
    if (path.startsWith("/app/admin") && req.auth.user?.role !== "ROOT") {
      return Response.redirect(new URL("/app", req.url));
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
