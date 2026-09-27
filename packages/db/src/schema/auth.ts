import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Tabelle di Better Auth (nomi dei modelli rimappati). Le colonne dei token di
 * auth_account restano sempre nulle: i token vivono cifrati in credenziale_casella.
 */
export const authUtente = pgTable("auth_utente", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const authSessione = pgTable("auth_sessione", {
  id: text().primaryKey(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  token: text().notNull().unique(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  ipAddress: text(),
  userAgent: text(),
  userId: text()
    .notNull()
    .references(() => authUtente.id, { onDelete: "cascade" }),
}).enableRLS();

export const authAccount = pgTable("auth_account", {
  id: text().primaryKey(),
  accountId: text().notNull(),
  providerId: text().notNull(),
  userId: text()
    .notNull()
    .references(() => authUtente.id, { onDelete: "cascade" }),
  accessToken: text(),
  refreshToken: text(),
  idToken: text(),
  accessTokenExpiresAt: timestamp({ withTimezone: true }),
  refreshTokenExpiresAt: timestamp({ withTimezone: true }),
  scope: text(),
  password: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Garanzia nel database: qualunque percorso di Better Auth provi a salvare un token, la scrittura fallisce.
  check(
    "auth_account_senza_token_ck",
    sql`${t.accessToken} IS NULL AND ${t.refreshToken} IS NULL AND ${t.idToken} IS NULL AND ${t.password} IS NULL`,
  ),
]).enableRLS();

export const authVerifica = pgTable("auth_verifica", {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}).enableRLS();
