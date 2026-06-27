import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe NextAuth config — the shared base imported by both `middleware.ts`
 * (edge runtime) and `auth.ts` (Node runtime). It must NOT pull in anything
 * edge-incompatible: no bcrypt, no database driver, no provider that imports
 * them. The Credentials provider and its callbacks live in `auth.ts`.
 *
 * Sessions are JWTs (the supported strategy for the Credentials provider), so
 * no database session adapter is needed — the user id rides in the token.
 */
export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/lock" },
  providers: [],
} satisfies NextAuthConfig;
