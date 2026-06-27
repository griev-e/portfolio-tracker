/**
 * Create a login (no public sign-up — accounts are provisioned by hand).
 *
 * Usage:
 *   npm run create-user -- <username> <password>
 *
 * Reads DATABASE_URL from .env.local (see scripts/load-env.ts), bcrypt-hashes
 * the password, and inserts the user. Run once per person.
 */
import "./load-env";
import bcrypt from "bcryptjs";
import { createUser, getUserByUsername } from "@/lib/db/users";

async function main(): Promise<void> {
  const username = (process.argv[2] ?? "").trim().toLowerCase();
  const password = process.argv[3] ?? "";

  if (!username || !password) {
    console.error("Usage: npm run create-user -- <username> <password>");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set — add it to .env.local first.");
    process.exit(1);
  }

  if (await getUserByUsername(username)) {
    console.error(`A user named "${username}" already exists.`);
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  const user = await createUser(username, hash);
  console.log(`✓ Created user "${user.username}" (${user.id}).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
