import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { creaScenario, type Scenario } from "./support/scenario";

let s: Scenario;
beforeEach(async () => {
  s = await creaScenario();
});
afterEach(async () => {
  await s.chiudi();
  vi.restoreAllMocks();
});

describe("unità di lavoro", () => {
  it("mette in fila le query lanciate insieme nella stessa transazione, senza l'avviso di deprecazione di pg", async () => {
    const avvisi = vi.spyOn(process, "emitWarning");
    const utente = await s.creaUtente("anna@esempio.it");
    const risultati = await s.perUtente(utente, (ctx) =>
      Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          ctx.tx.execute(sql`select ${i}::int as n, pg_sleep(0.005)`).then((r) => (r as unknown as { rows: { n: number }[] }).rows[0]!.n),
        ),
      ),
    );
    expect(risultati).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    const deprecazioni = avvisi.mock.calls.filter(([messaggio]) => String(messaggio).includes("already executing a query"));
    expect(deprecazioni).toEqual([]);
  });

  it("un errore in una query della fila fa fallire la transazione senza bloccare quelle successive", async () => {
    const utente = await s.creaUtente("anna@esempio.it");
    await expect(
      s.perUtente(utente, (ctx) => Promise.all([ctx.tx.execute(sql`select 1`), ctx.tx.execute(sql`select 1/0`), ctx.tx.execute(sql`select 2`)])),
    ).rejects.toThrow();
    const dopo = await s.perUtente(utente, (ctx) => ctx.tx.execute(sql`select 3 as n`));
    expect((dopo as unknown as { rows: { n: number }[] }).rows[0]!.n).toBe(3);
  });
});
