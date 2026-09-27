import { AREE, ordinaVisteSituazioni, type Area, type FunzioneAI, type MotivoPausa } from "@ec/core/dominio";
import { impostazioni, type ContestoUtente } from "@ec/db";
import type { Dipendenze } from "../dipendenze";
import { vistaNews } from "../news/riepilogo";
import { calcolaSituazioni, iso, isoOpzionale, prossimaAzioneDto, type SituazioneCalcolata } from "./calcolo";
import { viste, type CasellaInVista } from "./repository";
import type { Avviso, CardSituazione, ImportazioneDto, VistaHome, VistaNewsDto } from "./tipi";

type DipendenzeViste = Dipendenze;

/** Fasi dell'Importazione iniziale di cui la home mostra l'avanzamento. */
const FASI_VISIBILI = new Set(["da_stimare", "stimata", "confermata", "in_corso", "errore"]);

/**
 * Home (§13): una card per Situazione attiva nella sua Area principale, con indicatori per le altre aree,
 * avvisi, avanzamento delle importazioni e Riepilogo News.
 */
export async function vistaHome(dip: DipendenzeViste, ctx: ContestoUtente): Promise<VistaHome> {
  const ora = dip.orologio.ora();
  const [ids, caselle] = await Promise.all([viste.idSituazioniHome(ctx), viste.caselle(ctx)]);
  const attive = (await calcolaSituazioni(ctx, ids, ora)).filter((c) => c.vista.attiva && c.vista.areaPrincipale !== null);
  const indirizzi = await indirizziPerEmail(ctx, attive.flatMap((c) => c.emailIds), caselle);

  const aree = Object.fromEntries(AREE.map((a) => [a, [] as CardSituazione[]])) as Record<Area, CardSituazione[]>;
  const ordinate = ordinaVisteSituazioni(attive.map((calc) => ({ id: calc.situazione.id, vista: calc.vista, ultimaAttivita: calc.ultimaAttivita, calc })));
  for (const { calc } of ordinate) {
    const card = cardSituazione(calc, indirizzi);
    if (card) aree[card.areaPrincipale].push(card);
  }

  return {
    ora: iso(ora),
    aree,
    avvisi: await avvisi(dip, ctx, caselle),
    importazioni: caselle
      .filter((c) => c.faseImportazione !== null && FASI_VISIBILI.has(c.faseImportazione))
      .map((c): ImportazioneDto => ({
        casellaId: c.id,
        indirizzo: c.indirizzo,
        fase: c.faseImportazione!,
        avanzamento: c.avanzamento
          ? { totale: c.avanzamento.totale, acquisite: c.avanzamento.acquisite, elenchiPendenti: c.avanzamento.elenchiPendenti, lottiPendenti: c.avanzamento.lottiPendenti }
          : null,
        stima: c.stima,
      })),
    news: await riepilogoNews(dip, ctx),
  };
}

export function cardSituazione(calc: SituazioneCalcolata, indirizzi: ReadonlyMap<string, readonly string[]>): CardSituazione | null {
  const { vista } = calc;
  if (vista.areaPrincipale === null) return null;
  const caselle = [...new Set(calc.emailIds.flatMap((id) => indirizzi.get(id) ?? []))].sort();
  return {
    id: calc.situazione.id,
    titolo: calc.situazione.titolo,
    lingua: calc.situazione.lingua,
    areaPrincipale: vista.areaPrincipale,
    indicatori: vista.aree.filter((a) => a !== vista.areaPrincipale),
    urgente: vista.urgente,
    motivoUrgenza: vista.motivoUrgenza,
    prossimaAzione: prossimaAzioneDto(calc),
    haProposte: vista.haProposte,
    scadenzaPiuVicina: isoOpzionale(vista.scadenzaPiuVicina),
    caselle,
    ultimaAttivita: iso(calc.ultimaAttivita),
  };
}

/** Indirizzi delle caselle in cui ciascuna email ha una copia. */
export async function indirizziPerEmail(ctx: ContestoUtente, emailIds: string[], caselle: readonly CasellaInVista[]): Promise<Map<string, string[]>> {
  const perId = new Map(caselle.map((c) => [c.id, c.indirizzo]));
  const risultato = new Map<string, string[]>();
  for (const copia of await viste.copie(ctx, [...new Set(emailIds)])) {
    const indirizzo = perId.get(copia.casellaId);
    if (indirizzo) risultato.set(copia.emailId, [...(risultato.get(copia.emailId) ?? []), indirizzo]);
  }
  return risultato;
}

/** Avvisi della home e delle impostazioni: solo codici, tradotti dall'interfaccia. */
export async function avvisi(dip: DipendenzeViste, ctx: ContestoUtente, caselle: readonly CasellaInVista[]): Promise<Avviso[]> {
  const [consenso, chiave, pause, preferenze] = await Promise.all([
    impostazioni.haConsenso(ctx, dip.configurazione.versioneInformativa),
    impostazioni.infoChiave(ctx),
    impostazioni.pauseAttive(ctx),
    impostazioni.preferenze(ctx),
  ]);
  const risultato: Avviso[] = [];
  for (const c of caselle) {
    if (c.stato === "da_ricollegare") risultato.push({ codice: "casella_da_ricollegare", casellaId: c.id, indirizzo: c.indirizzo });
    if (c.stato === "permessi_incompleti") risultato.push({ codice: "permessi_incompleti", casellaId: c.id, indirizzo: c.indirizzo });
    if (c.faseImportazione === "stimata") {
      risultato.push({
        codice: "importazione_da_confermare",
        casellaId: c.id,
        indirizzo: c.indirizzo,
        numeroEmail: c.stima?.numeroEmail ?? null,
        costoStimato: c.stima?.costoStimato ?? null,
      });
    }
  }
  const globali = new Set<"consenso_mancante" | "chiave_non_valida" | "credito_esaurito">();
  if (!consenso) globali.add("consenso_mancante");
  if (chiave?.stato === "non_valida") globali.add("chiave_non_valida");
  if (chiave?.stato === "credito_esaurito" || chiave?.stato === "limitata") globali.add("credito_esaurito");
  const inPausa = new Map<string, { motivo: MotivoPausa; funzione: FunzioneAI | "*" }>();
  const pausa = (motivo: MotivoPausa, funzione: FunzioneAI | "*") => inPausa.set(`${funzione}:${motivo}`, { motivo, funzione });
  if (!chiave) pausa("chiave_mancante", "*");
  if (preferenze.pausaManuale) pausa("pausa_manuale", "*");
  for (const p of pause) {
    if (p.motivo === "consenso_mancante" || p.motivo === "chiave_non_valida" || p.motivo === "credito_esaurito") globali.add(p.motivo);
    else pausa(p.motivo, p.funzione);
  }
  for (const codice of ["consenso_mancante", "chiave_non_valida", "credito_esaurito"] as const) {
    if (globali.has(codice)) risultato.push({ codice });
  }
  for (const { motivo, funzione } of inPausa.values()) {
    risultato.push({ codice: "analisi_in_pausa", motivo, funzione });
  }
  return risultato;
}

/** Riepilogo News (§11) dal modulo che lo genera: appartenenza esatta all'istante della consultazione. */
async function riepilogoNews(dip: DipendenzeViste, ctx: ContestoUtente): Promise<VistaNewsDto> {
  const v = await vistaNews(dip, ctx);
  return {
    vuoto: v.vuoto,
    generatoIl: isoOpzionale(v.generatoIl),
    voci: v.voci.map((voce) => ({ testo: voce.testo, emailIds: [...voce.emailIds] })),
    nonIncluse: v.membri.filter((m) => !m.nelRiepilogo).map((m) => m.emailId),
    membri: v.membri.map((m) => ({
      emailId: m.emailId,
      mittente: m.mittente,
      oggetto: m.oggetto,
      anteprima: m.anteprima,
      ricevutaIl: iso(m.ricevutaIl),
      casella: m.casellaIndirizzo,
      nelRiepilogo: m.nelRiepilogo,
    })),
    errore: v.errore,
  };
}
