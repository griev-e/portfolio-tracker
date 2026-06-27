/**
 * User queries (server-only). Used by the Credentials authorize() and the
 * create-user script. Usernames are stored lowercased; look-ups normalize.
 */
import { eq } from "drizzle-orm";
import { getDb } from "./index";
import { users, type UserRow } from "./schema";

export async function getUserByUsername(username: string): Promise<UserRow | null> {
  const rows = await getDb()
    .select()
    .from(users)
    .where(eq(users.username, username.trim().toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

export async function createUser(
  username: string,
  passwordHash: string
): Promise<UserRow> {
  const rows = await getDb()
    .insert(users)
    .values({ username: username.trim().toLowerCase(), passwordHash })
    .returning();
  return rows[0]!;
}
