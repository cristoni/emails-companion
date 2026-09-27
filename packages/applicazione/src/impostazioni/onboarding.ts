import { caselle, impostazioni, type ContestoUtente } from "@ec/db";
import type { Dipendenze } from "../dipendenze";

export interface StatoOnboarding {
  consenso: boolean;
  /** Stato della chiave OpenRouter; null se non è mai stata salvata o è stata rimossa. */
  chiave: string | null;
  /** Caselle attive la cui Importazione iniziale attende ancora la stima o la decisione dell'utente. */
  importazioniDaDecidere: string[];
  /**
   * Requisiti senza i quali l'app non ha nulla da mostrare: informativa accettata e chiave salvata.
   * Solo questi portano all'onboarding; chiave non valida, credito esaurito e importazioni da decidere
   * compaiono invece come avvisi nella home.
   */
  essenziale: boolean;
  /** Tutti i passi conclusi: anche chiave valida e importazioni decise. */
  completo: boolean;
}

const FASI_DA_DECIDERE = new Set(["da_stimare", "stimata"]);

/** Stato dell'onboarding derivato dai dati: la stessa regola per la pagina di onboarding e per la home. */
export async function statoOnboarding(dip: Pick<Dipendenze, "configurazione">, ctx: ContestoUtente): Promise<StatoOnboarding> {
  const [consenso, chiave, elenco] = await Promise.all([
    impostazioni.haConsenso(ctx, dip.configurazione.versioneInformativa),
    impostazioni.infoChiave(ctx),
    caselle.elenca(ctx),
  ]);
  const importazioniDaDecidere = elenco
    .filter((c) => c.stato !== "scollegamento_in_corso" && FASI_DA_DECIDERE.has(c.faseImportazione))
    .map((c) => c.id);
  const essenziale = consenso && chiave !== null;
  return {
    consenso,
    chiave: chiave?.stato ?? null,
    importazioniDaDecidere,
    essenziale,
    completo: essenziale && chiave?.stato === "valida" && importazioniDaDecidere.length === 0,
  };
}
