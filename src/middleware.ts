import NextAuth from "next-auth";
import { authConfig } from "../auth.config";

/**
 * Auth gate for deployments (AUTH_ENABLED=true + AUTH_SECRET). Local dev
 * stays open — the spec keeps this a single-user local app until deploy.
 * Always public: the Auth.js endpoints, the one-click unsubscribe link
 * (CAN-SPAM: no login), and the dev inbox tools.
 */

const PUBLIC_PREFIXES = ["/api/auth", "/api/dev", "/u/", "/dev/"];

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  if (process.env.AUTH_ENABLED !== "true") return;

  const path = req.nextUrl.pathname;
  if (PUBLIC_PREFIXES.some((p) => path.startsWith(p))) return;
  if (req.auth) return;

  const signIn = new URL("/api/auth/signin", req.url);
  signIn.searchParams.set("callbackUrl", req.url);
  return Response.redirect(signIn);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
