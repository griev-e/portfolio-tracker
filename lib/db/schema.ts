/**
 * Database schema (Drizzle / Postgres) — the *only* server-side persistence in
 * the app, and entirely optional. When DATABASE_URL + AUTH_SECRET are unset the
 * app runs exactly as before (open, single-user, localStorage); when set, each
 * signed-in user gets their own saved alpha portfolio and delta ledger here.
 *
 * Two tables, by design. The client stores already own every mutation and
 * derivation (buildPortfolio, deriveDelta), so the server never needs to query
 * an individual holding or transaction — it just stores each app's state as an
 * opaque JSONB blob keyed by user. Minimal surface, and the existing data
 * shapes (`Stored`, `Ledger`) persist verbatim.
 */
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const userState = pgTable("user_state", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** alpha `Stored` shape: { holdings, cash, asOf, isDemo? } — or null. */
  portfolio: jsonb("portfolio"),
  /** delta `Ledger` shape — or null. */
  ledger: jsonb("ledger"),
  portfolioUpdatedAt: timestamp("portfolio_updated_at", { withTimezone: true }),
  ledgerUpdatedAt: timestamp("ledger_updated_at", { withTimezone: true }),
});

export type UserRow = typeof users.$inferSelect;
export type UserStateRow = typeof userState.$inferSelect;
