import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { authUtente } from "@ec/db/schema";
import { FabbricaConnettoriFinta, GatewayModelliFinto } from "@ec/testing";
import { databaseDiTest } from "@ec/testing/postgres";
import { componi } from "../src";

const LIMITE_MS = 10_000;

function entro<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promessa, new Promise<T>((_, rifiuta) => setTimeout(() => rifiuta(new Error("stallo: nessuna connessione libera")), ms))]);
}

describe("pool delle connessioni", () => {
  it("una transazione che carica a freddo la chiave dati non resta in attesa della propria connessione", async () => {
    const url = await databaseDiTest();
    const composizione = await componi(
      {
        modalita: "reale",
        ambiente: "sviluppo",
        databaseUrl: url,
        databaseCa: null,
        chiavi: { chiaviPrincipali: { 1: randomBytes(32) }, versioneAttiva: 1, chiaveIndiciGlobali: randomBytes(32) },
        google: null,
        pubsub: null,
        urlApp: "http://localhost",
      },
      {
        coda: () => ({ accoda: async () => {} }),
        massimoConnessioni: 1,
        connettori: new FabbricaConnettoriFinta(),
        modelli: new GatewayModelliFinto(),
        lingua: { rileva: () => ({ lingua: null, affidabile: false }) },
      },
    );
    try {
      const utenti = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
      for (const id of utenti) await composizione.connessione.db.insert(authUtente).values({ id, name: "Anna", email: `${id}@esempio.it`, emailVerified: true });
      // Ogni transazione occupa l'unica connessione applicativa e cifra con una chiave dati non ancora in cache.
      const cifrati = await entro(
        Promise.all(utenti.map((id) => composizione.dip.unita.perUtente(id, (ctx) => ctx.codec.cifra("email", "oggetto", id, "Ciao")))),
        LIMITE_MS,
      );
      expect(cifrati).toHaveLength(3);
    } finally {
      await composizione.chiudi();
    }
  });
});
