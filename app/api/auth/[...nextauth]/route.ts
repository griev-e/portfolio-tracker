import { handlers } from "@/auth";

/** NextAuth route handlers — /api/auth/session, /signin, /callback/credentials,
    /csrf, /signout, etc. (Node runtime; auth.ts imports bcrypt + the DB.) */
export const { GET, POST } = handlers;
