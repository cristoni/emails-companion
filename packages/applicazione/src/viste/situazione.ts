import { operativo, posta, type ContestoUtente } from "@ec/db";
import type { Dipendenze } from "../dipendenze";
import {
  calcolaSituazioni,
  correzioniDto,
  evidenzeDto,
  iso,
  isoOpzionale,
  perche,
  prossimaAzioneDto,
  revisioneEffettiva,
  statoCollegamentoEffettivo,
  statoRispostaEffettivo,
  UUID,
  valutazioneEffettiva,
  type Affermazione,
  type SituazioneCalcolata,
} from "./calcolo";
import { viste, type CasellaInVista, type CopiaInVista } from "./repository";
import type { AttesaDto, AttivitaDto, CollegamentoDto, CopiaDto, FonteDto, PercheDto, RispostaDto, VistaSituazioneDto } from "./tipi";

type DipendenzeViste = Dipendenze;

/**
 * Dettaglio di una Situazione (§13 `/situations/[id]`): valori effettivi, evidenze, fonti con le loro copie,
 * pannello "Perché?" e cronologia. Una Situazione assorbita reindirizza alla destinazione.
 */
export async function vistaSituazione(dip: DipendenzeViste, ctx: ContestoUtente, id: string): Promise<VistaSituazioneDto | null> {
  if (!UUID.test(id)) return null;
  const finale = await viste.risolviSituazione(ctx, id);
  if (!finale) return null;
  const [calc] = await calcolaSituazioni(ctx, [finale], dip.orologio.ora());
  if (!calc) return null;
  const { correzioni } = calc;

  const attivita = calc.attivita.map((a): AttivitaDto => ({
    id: a.id,
    emailSorgenteId: a.emailSorgenteId,
    descrizione: a.descrizione,
    scadenza: isoOpzionale(a.scadenza),
    scadenzaCitazione: a.scadenzaCitazione,
    priorita: a.priorita,
    urgente: a.urgente,
    base: a.base,
    stato: a.stato,
    proposta: a.stato === "proposta",
    confermata: a.stato === "confermata",
    completata: a.stato === "completata",
    completataDaAi: a.stato === "completata" && a.completataDa === "ai",
    completataDa: a.completataDa,
    completataIl: isoOpzionale(a.completataIl),
    emailCompletamentoId: a.emailCompletamentoId,
    evidenze: evidenzeDto(a.evidenze),
    analisiId: a.analisiId,
    correzioni: correzioniDto(correzioni, { tipo: "attivita", id: a.id }),
  }));

  const motivazioni = await viste.motivazioniRisposte(ctx, calc.risposte.map((r) => r.id));
  const attese = calc.attese.map(({ attesa, requisiti, esito, sollecito }): AttesaDto => ({
    id: attesa.id,
    emailRichiestaId: attesa.emailRichiestaId,
    oggetto: attesa.oggetto,
    destinatari: attesa.destinatari,
    dataAttesa: isoOpzionale(attesa.dataAttesa),
    ciclo: attesa.ciclo,
    proposta: attesa.ciclo === "proposta",
    confermata: attesa.ciclo === "confermata",
    base: attesa.base,
    evidenze: evidenzeDto(attesa.evidenze),
    analisiId: attesa.analisiId,
    stato: esito.stato,
    chiusaDa: esito.chiusaDa,
    rispostaDiChiusura: esito.rispostaDiChiusura,
    daVerificare: esito.daVerificare,
    sollecitoConsigliato: sollecito,
    requisiti: requisiti.map((q) => ({ id: q.id, descrizione: q.descrizione, soddisfatto: esito.requisitiSoddisfatti.includes(q.id) })),
    risposte: calc.risposte
      .filter((r) => r.attesaId === attesa.id)
      .sort((a, b) => a.arrivataIl.getTime() - b.arrivataIl.getTime() || (a.id < b.id ? -1 : 1))
      .map((r): RispostaDto => {
        const statoCollegamento = statoRispostaEffettivo(r, correzioni);
        return {
          id: r.id,
          emailId: r.emailId,
          origine: r.origine,
          statoCollegamento,
          proposta: statoCollegamento === "proposto",
          valutazione: valutazioneEffettiva(r, correzioni),
          valutazioneAi: r.valutazione,
          revisione: revisioneEffettiva(r, correzioni),
          arrivataIl: iso(r.arrivataIl),
          confidenza: r.confidenza,
          motivazione: motivazioni.get(r.id) ?? null,
          requisiti: r.requisitiSoddisfatti.map((q) => ({ requisitoId: q.requisitoId, evidenze: evidenzeDto(q.evidenze) })),
          analisiId: r.analisiId,
          correzioni: correzioniDto(correzioni, { tipo: "risposta", id: r.id }),
        };
      }),
    correzioni: correzioniDto(correzioni, { tipo: "attesa", id: attesa.id }),
  }));

  const collegamenti = calc.collegamenti.map((c): CollegamentoDto => ({
    id: c.id,
    emailId: c.emailId,
    origine: c.origine,
    ruolo: c.ruolo,
    stato: statoCollegamentoEffettivo(c, correzioni),
    confidenza: c.confidenza,
    analisiId: c.analisiId,
    correzioni: correzioniDto(correzioni, { tipo: "collegamento", id: c.id }),
  }));

  const [fonti, spiegazioni, eventi] = await Promise.all([fontiDi(ctx, calc), percheDi(ctx, calc), operativo.eventi(ctx, calc.situazione.id)]);
  const { vista, situazione } = calc;
  return {
    id: situazione.id,
    reindirizzataDa: finale === id ? null : id,
    situazione: {
      id: situazione.id,
      titolo: situazione.titolo,
      descrizione: situazione.descrizione,
      lingua: situazione.lingua,
      emailOrigineId: situazione.emailOrigineId,
      creataIl: iso(situazione.creataIl),
      ultimaAttivita: iso(calc.ultimaAttivita),
      gestitaIl: gestitaIl(calc),
      archiviata: vista.archiviata,
      analisiId: spiegazioni.find((p) => p.soggetto.tipo === "situazione")?.analisiId ?? null,
      correzioni: correzioniDto(correzioni, { tipo: "situazione", id: situazione.id }),
    },
    stato: {
      attiva: vista.attiva,
      archiviata: vista.archiviata,
      aree: vista.aree,
      areaPrincipale: vista.areaPrincipale,
      urgente: vista.urgente,
      motivoUrgenza: vista.motivoUrgenza,
      haProposte: vista.haProposte,
      scadenzaPiuVicina: isoOpzionale(vista.scadenzaPiuVicina),
      prioritaMassima: vista.prioritaMassima,
    },
    prossimaAzione: prossimaAzioneDto(calc),
    attivita,
    attese,
    collegamenti,
    fonti,
    perche: spiegazioni,
    eventi: eventi.map((e) => ({ id: e.id, attore: e.attore, tipo: e.tipo, riferimenti: { ...e.riferimenti }, creatoIl: iso(e.creatoIl) })),
  };
}

function gestitaIl(calc: SituazioneCalcolata): string | null {
  const corrette = correzioniDto(calc.correzioni, { tipo: "situazione", id: calc.situazione.id }).filter((c) => c.campo === "gestitaIl");
  const ultima = corrette.at(-1);
  if (ultima) return typeof ultima.valore === "string" ? ultima.valore : null;
  return isoOpzionale(calc.situazione.gestitaIl);
}

export function copiaDto(copia: CopiaInVista, perId: ReadonlyMap<string, string>): CopiaDto {
  return {
    casellaId: copia.casellaId,
    indirizzo: perId.get(copia.casellaId) ?? "",
    idConnettore: copia.idConnettore,
    thread: copia.thread,
    cartelle: copia.cartelle,
    origineInvio: copia.origineInvio,
    eliminataNelProvider: copia.eliminataNelProvider,
    linkOriginale: null,
  };
}

/** Email da cui derivano la Situazione e i suoi elementi, in ordine cronologico, con le loro copie. */
async function fontiDi(ctx: ContestoUtente, calc: SituazioneCalcolata): Promise<FonteDto[]> {
  const ids = new Set<string>(calc.emailIds);
  for (const a of calc.attivita) {
    ids.add(a.emailSorgenteId);
    if (a.emailCompletamentoId) ids.add(a.emailCompletamentoId);
    for (const e of a.evidenze) ids.add(e.emailId);
  }
  for (const { attesa } of calc.attese) {
    ids.add(attesa.emailRichiestaId);
    for (const e of attesa.evidenze) ids.add(e.emailId);
  }
  for (const r of calc.risposte) if (statoRispostaEffettivo(r, calc.correzioni) !== "rifiutato") ids.add(r.emailId);
  const elenco = [...ids];
  const [email, copie, caselle] = await Promise.all([posta.leggiMolte(ctx, elenco, false), viste.copie(ctx, elenco), viste.caselle(ctx)]);
  const perId = indirizziCaselle(caselle);
  return email
    .sort((a, b) => a.ricevutaIl.getTime() - b.ricevutaIl.getTime() || (a.id < b.id ? -1 : 1))
    .map((e) => {
      const proprie = copie.filter((c) => c.emailId === e.id).map((c) => copiaDto(c, perId));
      return {
        emailId: e.id,
        direzione: e.direzione,
        mittente: e.mittente,
        destinatari: { a: e.a, cc: e.cc },
        oggetto: e.oggetto,
        anteprima: e.anteprima,
        ricevutaIl: iso(e.ricevutaIl),
        lingua: e.lingua,
        thread: proprie.find((c) => c.thread !== null)?.thread ?? null,
        caselle: proprie,
      };
    });
}

export function indirizziCaselle(caselle: readonly CasellaInVista[]): Map<string, string> {
  return new Map(caselle.map((c) => [c.id, c.indirizzo]));
}

async function percheDi(ctx: ContestoUtente, calc: SituazioneCalcolata): Promise<PercheDto[]> {
  const origine = calc.situazione.emailOrigineId;
  const classificazioni = await viste.classificazioni(ctx, calc.emailIds);
  const titolo =
    classificazioni.get(origine)?.analisiId ??
    calc.attivita.find((a) => a.emailSorgenteId === origine)?.analisiId ??
    calc.attese.find((a) => a.attesa.emailRichiestaId === origine)?.attesa.analisiId ??
    null;
  const affermazioni: Affermazione[] = [{ soggetto: { tipo: "situazione", id: calc.situazione.id }, analisiId: titolo }];
  for (const [emailId, c] of classificazioni) affermazioni.push({ soggetto: { tipo: "classificazione", id: emailId }, analisiId: c.analisiId });
  for (const a of calc.attivita) affermazioni.push({ soggetto: { tipo: "attivita", id: a.id }, analisiId: a.analisiId });
  for (const { attesa } of calc.attese) affermazioni.push({ soggetto: { tipo: "attesa", id: attesa.id }, analisiId: attesa.analisiId });
  for (const r of calc.risposte) affermazioni.push({ soggetto: { tipo: "risposta", id: r.id }, analisiId: r.analisiId });
  for (const c of calc.collegamenti) affermazioni.push({ soggetto: { tipo: "collegamento", id: c.id }, analisiId: c.analisiId });
  return perche(ctx, affermazioni);
}
