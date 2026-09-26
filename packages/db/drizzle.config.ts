import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrazioni",
  casing: "snake_case",
  schemaFilter: ["public"],
  dbCredentials: { url: process.env.EC_DATABASE_URL_MIGRAZIONI ?? "" },
});
