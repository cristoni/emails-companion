import type { NomeJob, PayloadJob } from "@ec/core/porte";
import { analizzaEmail } from "./analisi/analizza-email";
import { eliminaAccount, rinnovaWatchEAlias, scollegaCasella } from "./caselle/ciclo-vita";
import type { Dipendenze } from "./dipendenze";
import { verificaChiavePeriodica, verificaModelliPeriodica } from "./impostazioni/impostazioni";
import { importaPagina, recuperaRisposte, stimaImportazione } from "./posta/importazione";
import { pianificaSincronizzazioni, sincronizzaCasella } from "./posta/sincronizzazione";
import { riconciliaUtente } from "./riconciliazione/riconcilia";
import { gestoriBozze } from "./bozze";
import { aggiornaRiepilogoNews } from "./news/riepilogo";
import { rianalizza } from "./rianalisi/rianalizza";

export type GestoriJob = { [N in NomeJob]: (payload: PayloadJob[N]) => Promise<void> };

/** Gestori dei job: lo stesso codice gira nel worker e nell'harness dei test di scenario. */
export function gestoriJob(dip: Dipendenze, estensioni: Partial<GestoriJob> = {}): GestoriJob {
  const nonDisponibile = async () => {};
  return {
    pianifica_sincronizzazioni: async () => {
      await pianificaSincronizzazioni(dip);
    },
    sincronizza_casella: async (p) => {
      await sincronizzaCasella(dip, p.utenteId, p.casellaId);
    },
    stima_importazione: (p) => stimaImportazione(dip, p.utenteId, p.casellaId),
    importa_pagina: (p) => importaPagina(dip, p),
    recupera_risposte: (p) => recuperaRisposte(dip, p),
    analizza_email: (p) => analizzaEmail(dip, p.utenteId, p.emailId),
    riconcilia_utente: async (p) => {
      await riconciliaUtente(dip, p.utenteId);
    },
    rinnova_watch_e_alias: (p) => rinnovaWatchEAlias(dip, p.utenteId, p.casellaId),
    verifica_chiave: (p) => verificaChiavePeriodica(dip, p.utenteId),
    verifica_modelli: (p) => verificaModelliPeriodica(dip, p.utenteId, p.funzione),
    scollega_casella: (p) => scollegaCasella(dip, p.utenteId, p.casellaId),
    elimina_account: (p) => eliminaAccount(dip, p.utenteId),
    aggiorna_riepilogo_news: async (p) => {
      await aggiornaRiepilogoNews(dip, p.utenteId);
    },
    rianalizza: async (p) => {
      await rianalizza(dip, p.utenteId, p.richiestaId);
    },
    pulizia: nonDisponibile,
    ...gestoriBozze(dip),
    ...estensioni,
  };
}
