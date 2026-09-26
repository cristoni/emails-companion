import { eq } from "drizzle-orm";
import type { ChiaveDatiCifrata, DepositoChiaviUtente } from "@ec/crypto";
import type { Database } from "../connessione";
import { chiaveUtente } from "../schema";

/**
 * Deposito delle chiavi dati per utente. Usa connessioni proprie: la chiave deve esistere anche se
 * la transazione del chiamante viene annullata.
 */
export function depositoChiaviDb(db: Database): DepositoChiaviUtente {
  return {
    async leggi(utenteId) {
      const [r] = await db.select().from(chiaveUtente).where(eq(chiaveUtente.utenteId, utenteId));
      return r ? { dekCifrata: r.dekCifrata, versioneKek: r.versioneKek } : null;
    },
    async creaSeAssente(utenteId, dekCifrata, versioneKek): Promise<ChiaveDatiCifrata> {
      await db.insert(chiaveUtente).values({ utenteId, dekCifrata, versioneKek }).onConflictDoNothing();
      const [r] = await db.select().from(chiaveUtente).where(eq(chiaveUtente.utenteId, utenteId));
      if (!r) throw new Error("chiave_utente_non_salvata");
      return { dekCifrata: r.dekCifrata, versioneKek: r.versioneKek };
    },
    async aggiorna(utenteId, dekCifrata, versioneKek) {
      await db.update(chiaveUtente).set({ dekCifrata, versioneKek }).where(eq(chiaveUtente.utenteId, utenteId));
    },
    async elimina(utenteId) {
      await db.delete(chiaveUtente).where(eq(chiaveUtente.utenteId, utenteId));
    },
  };
}
