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
