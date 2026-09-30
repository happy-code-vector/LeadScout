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

// next-auth/jwt only star-re-exports @auth/core/jwt, and an augmentation of a
// star-re-exporting module does not reliably bind to the JWT symbol used in
// the jwt/session callback signatures. Augmenting the declaration module
// directly makes the merge deterministic.
declare module "@auth/core/jwt" {
  interface JWT {
    role?: string;
    status?: string;
  }
}
