import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { impostazioni } from "@ec/db";
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

  it("se il lavoro fallisce, le query ancora in fila non vengono eseguite fuori dalla transazione", async () => {
    const utente = await s.creaUtente("anna@esempio.it");
    const prima = await s.perUtente(utente, (ctx) => impostazioni.preferenze(ctx));
    await expect(
      s.perUtente(utente, (ctx) =>
        Promise.all([
          ctx.tx.execute(sql`select pg_sleep(0.05)`),
          ctx.tx.execute(
            sql`insert into preferenze_utente (utente_id, fuso_orario, aggiornate_il) values (${utente}, 'Pacific/Auckland', now())
                on conflict (utente_id) do update set fuso_orario = excluded.fuso_orario`,
          ),
          // Un errore che non viene dal database: il lavoro fallisce mentre le query sono ancora in fila.
          new Promise((_, rifiuta) => setTimeout(() => rifiuta(new Error("errore_del_caso_d_uso")), 10)),
        ]),
      ),
    ).rejects.toThrow();
    // Lascia il tempo a eventuali query rimaste in fila di partire sul client restituito al pool.
    await new Promise((fine) => setTimeout(fine, 300));
    const dopo = await s.perUtente(utente, (ctx) => impostazioni.preferenze(ctx));
    expect(dopo.fusoOrario).toBe(prima.fusoOrario);
  });
});
