import { REGISTRO_FUNZIONI } from "@ec/ai";
import { FUNZIONI_AI } from "@ec/core/dominio";
import { analisi, impostazioni, posta, type ContestoUtente } from "@ec/db";
import { SCOPE_INVIO, SCOPE_LETTURA } from "../caselle/consenso";
import type { Dipendenze } from "../dipendenze";
import { GIORNO_MS } from "../dipendenze";
import { iso, isoOpzionale } from "./calcolo";
import { viste } from "./repository";
import type { VistaImpostazioniDto, VistaStatoDto } from "./tipi";

type DipendenzeViste = Dipendenze;

const ERRORI_RECENTI = 20;

/** Pagina `/status`: ritardo di sincronizzazione, importazioni, email da analizzare, pause ed errori (solo codici). */
export async function vistaStato(dip: DipendenzeViste, ctx: ContestoUtente): Promise<VistaStatoDto> {
  const ora = dip.orologio.ora();
  const [caselle, conteggi, pause, preferenze, falliti, inErrore, elaborazione] = await Promise.all([
    viste.caselle(ctx),
    posta.conteggioDaAnalizzare(ctx),
    impostazioni.pauseAttive(ctx),
    impostazioni.preferenze(ctx),
    viste.erroriAnalisi(ctx, ERRORI_RECENTI),
    viste.funzioniInErrore(ctx, ERRORI_RECENTI),
    viste.statoElaborazione(ctx),
  ]);
  const erroriRecenti = [
    ...falliti.map((f) => ({ analisiId: f.analisiId, funzione: f.funzione, emailId: f.emailId, codice: f.codice, il: f.il })),
    ...inErrore.map((f) => ({ analisiId: null, funzione: f.funzione, emailId: f.emailId, codice: f.codice, il: f.il })),
  ]
    .sort((a, b) => b.il.getTime() - a.il.getTime())
    .slice(0, ERRORI_RECENTI)
    .map((e) => ({ ...e, il: iso(e.il) }));

  return {
    ora: iso(ora),
    caselle: caselle.map((c) => ({
      casellaId: c.id,
      indirizzo: c.indirizzo,
      stato: c.stato,
      ultimaSyncOk: isoOpzionale(c.ultimaSyncOk),
      ritardoMs: c.ultimaSyncOk ? Math.max(0, ora.getTime() - c.ultimaSyncOk.getTime()) : null,
      faseImportazione: c.faseImportazione,
      avanzamento: c.avanzamento
        ? { totale: c.avanzamento.totale, acquisite: c.avanzamento.acquisite, elenchiPendenti: c.avanzamento.elenchiPendenti, lottiPendenti: c.avanzamento.lottiPendenti }
        : null,
      erroreSincronizzazione: c.erroreSincronizzazione,
      erroriConsecutivi: c.erroriConsecutivi,
      prossimoTentativo: isoOpzionale(c.nonPrimaDi),
      erroreCasella: c.ultimoErrore,
    })),
    analisi: conteggi,
    pause: [
      ...(preferenze.pausaManuale ? [{ funzione: "*" as const, motivo: "pausa_manuale" as const, dal: null, prossimaVerifica: null }] : []),
      ...pause.map((p) => ({ funzione: p.funzione, motivo: p.motivo, dal: iso(p.dal), prossimaVerifica: isoOpzionale(p.prossimaVerifica) })),
    ],
    erroriRecenti,
    elaborazione: elaborazione
      ? {
          riconciliazioneErrori: elaborazione.riconciliazioneErrori,
          riconciliazioneErrore: elaborazione.riconciliazioneErrore,
          newsErrori: elaborazione.newsErrori,
          newsErrore: elaborazione.newsErrore,
        }
      : null,
  };
}

/**
 * Pagina `/settings`: caselle, stato della chiave (mai il valore), modello per ogni Funzione AI,
 * versioni del Contesto AI, preferenze, consumo degli ultimi 30 giorni e consenso.
 */
export async function vistaImpostazioni(dip: DipendenzeViste, ctx: ContestoUtente): Promise<VistaImpostazioniDto> {
  const ora = dip.orologio.ora();
  const [caselle, chiave, modelli, versioni, preferenze, consumo, consenso] = await Promise.all([
    viste.caselle(ctx),
    impostazioni.infoChiave(ctx),
    impostazioni.modelli(ctx),
    impostazioni.versioniContesto(ctx),
    impostazioni.preferenze(ctx),
    analisi.consumo(ctx, new Date(ora.getTime() - 30 * GIORNO_MS)),
    impostazioni.haConsenso(ctx, dip.configurazione.versioneInformativa),
  ]);
  return {
    caselle: caselle.map((c) => ({
      id: c.id,
      indirizzo: c.indirizzo,
      connettore: c.connettore,
      stato: c.stato,
      lettura: c.scopeConcessi.includes(SCOPE_LETTURA),
      invio: c.scopeConcessi.includes(SCOPE_INVIO),
      faseImportazione: c.faseImportazione,
      collegataIl: iso(c.collegataIl),
    })),
    chiave: chiave
      ? { stato: chiave.stato, ultimeCifre: chiave.ultimeCifre, etichetta: chiave.etichetta, limiteResiduo: chiave.limiteResiduo, verificataIl: isoOpzionale(chiave.verificataIl) }
      : null,
    modelli: FUNZIONI_AI.map((f) => ({
      funzione: f,
      etichetta: REGISTRO_FUNZIONI[f].etichettaI18n,
      descrizione: REGISTRO_FUNZIONI[f].descrizioneI18n,
      modello: modelli[f].modello,
      predefinito: REGISTRO_FUNZIONI[f].modelloPredefinito,
      stato: modelli[f].stato,
      verificataIl: isoOpzionale(modelli[f].verificataIl),
    })),
    contestoAi: {
      corrente: versioni[0]?.numero ?? null,
      versioni: versioni.map((v) => ({ numero: v.numero, creatoIl: iso(v.creatoIl), testo: v.testo })),
    },
    preferenze: { lingua: preferenze.lingua, tema: preferenze.tema, fusoOrario: preferenze.fusoOrario, pausaManuale: preferenze.pausaManuale },
    consumo: consumo
      .map((c) => ({ funzione: c.funzione, invocazioni: c.invocazioni, costo: c.costo, tokenIngresso: c.tokenIngresso, tokenUscita: c.tokenUscita }))
      .sort((a, b) => (a.funzione < b.funzione ? -1 : 1)),
    consenso: { versione: dip.configurazione.versioneInformativa, accettato: consenso },
  };
}
