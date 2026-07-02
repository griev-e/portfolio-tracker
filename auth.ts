import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import { getUserByUsername } from "@/lib/db/users";
import {
  checkLock,
  clientKey,
  recordFailure,
  recordSuccess,
} from "@/lib/server/rateLimit";

/** A syntactically valid bcrypt hash of nothing anyone types — used only to
 *  equalize timing when the username doesn't exist (see authorize below). */
const DUMMY_HASH = bcrypt.hashSync("timing-equalizer-not-a-real-password", 10);

/**
 * Full NextAuth config (Node runtime only — imports bcrypt + the DB). Never
 * import this from middleware or client code; the edge middleware uses the
 * leaner `auth.config.ts`.
 *
 * Username + password against the `users` table. The same fixed-window limiter
 * that guards the old PIN gate throttles login brute force here, keyed by
 * IP + username. We return null (not a descriptive error) on every failure so
 * the client can't distinguish "no such user" from "wrong password" or
 * "locked out".
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials, request) => {
        const username = String(credentials?.username ?? "")
          .trim()
          .toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!username || !password) return null;

        let key = `login:${username}`;
        try {
          key = `login:${clientKey(request as unknown as Request)}:${username}`;
        } catch {
          /* request shape varies across runtimes — fall back to username key */
        }
        if (checkLock(key).limited) return null;

        const user = await getUserByUsername(username);
        if (!user) {
          // Burn a bcrypt comparison anyway so "no such user" takes the same
          // time as "wrong password" — otherwise the response-time gap lets a
          // caller enumerate valid usernames despite the identical null.
          await bcrypt.compare(password, DUMMY_HASH);
          recordFailure(key);
          return null;
        }
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
          recordFailure(key);
          return null;
        }
        recordSuccess(key);
        return { id: user.id, name: user.username };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id && session.user) session.user.id = String(token.id);
      return session;
    },
  },
});
