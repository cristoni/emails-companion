import { applicaMigrazioni } from "./migrazioni";

const url = process.env.EC_DATABASE_URL_MIGRAZIONI;
if (!url) {
  console.error("EC_DATABASE_URL_MIGRAZIONI non impostata");
  process.exit(1);
}
const ca = process.env.EC_DATABASE_CA;
await applicaMigrazioni(url, { ssl: ca ? { ca } : undefined });
console.log("migrazioni applicate");
