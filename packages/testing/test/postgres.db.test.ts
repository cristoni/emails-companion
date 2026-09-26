import { describe, expect, it } from "vitest";
import pg from "pg";
import { databaseDiTest } from "../src/postgres";

describe("Postgres incorporato", () => {
  it("fornisce un database isolato in UTF-8 che conserva testo non latino", async () => {
    const url = await databaseDiTest();
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      const codifica = await client.query<{ server_encoding: string }>("SHOW server_encoding");
      expect(codifica.rows[0]?.server_encoding).toBe("UTF8");
      const testo = "Grazie — 謝謝 — Спасибо — 🙂";
      const eco = await client.query<{ t: string }>("SELECT $1::text AS t", [testo]);
      expect(eco.rows[0]?.t).toBe(testo);
    } finally {
      await client.end();
    }
  });

  it("due database di test sono indipendenti", async () => {
    const [a, b] = await Promise.all([databaseDiTest(), databaseDiTest()]);
    expect(a).not.toBe(b);
  });
});
