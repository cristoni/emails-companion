import {
  correzioniAttive,
  derivaStatoAttesa,
  derivaVistaSituazione,
  sollecitoConsigliato,
  valoreEffettivo,
  type Attesa,
  type Attivita,
  type Categoria,
  type CicloAttesa,
  type Collegamento,
  type Correzione,
  type EsitoAttesa,
  type Evidenza,
  type Priorita,
  type Requisito,
  type RispostaArrivata,
  type SegnaleUrgenza,
  type Situazione,
  type Soggetto,
  type StatoCollegamento,
  type StatoElemento,
  type StatoRevisione,
  type FunzioneAI,
  type Valutazione,
  type VistaSituazione,
} from "@ec/core/dominio";
import { analisi, operativo, type ContestoUtente } from "@ec/db";
import { viste } from "./repository";
import type { CorrezioneDto, EvidenzaDto, PercheDto, ProssimaAzioneDto } from "./tipi";

export const iso = (d: Date): string => d.toISOString();
export const isoOpzionale = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valori di data salvati nelle correzioni: Date o stringa ISO con fuso esplicito. */
export function comeData(valore: unknown): Date | null {
  const data =
    valore instanceof Date ? valore : typeof valore === "string" && /(?:Z|[+-]\d{2}:\d{2})$/i.test(valore.trim()) ? new Date(valore.trim()) : null;
  return data !== null && !Number.isNaN(data.getTime()) ? data : null;
}

export function evidenzeDto(evidenze: readonly Evidenza[]): EvidenzaDto[] {
  return evidenze.map((e) => ({ emailId: e.emailId, citazione: e.citazione, inizio: e.inizio, fine: e.fine, verificata: e.verificata }));
}

/** Correzioni attive di un soggetto, su tutti i campi, dalla più vecchia. */
export function correzioniDto(correzioni: readonly Correzione[], soggetto: Soggetto): CorrezioneDto[] {
  const campi = [...new Set(correzioni.filter((c) => c.soggetto.tipo === soggetto.tipo && c.soggetto.id === soggetto.id).map((c) => c.campo))];
  return campi
    .flatMap((campo) => correzioniAttive(correzioni, soggetto, campo))
    .sort((a, b) => a.creataIl.getTime() - b.creataIl.getTime() || (a.id < b.id ? -1 : 1))
    .map((c) => ({ id: c.id, campo: c.campo, valore: c.valore, creataIl: iso(c.creataIl) }));
}

/** Attività con le correzioni dell'utente applicate (descrizione, scadenza, priorità, stato). */
export function attivitaEffettiva(a: Attivita, correzioni: readonly Correzione[]): Attivita {
  const soggetto = { tipo: "attivita", id: a.id } as const;
  const stato = valoreEffettivo<StatoElemento>(a.stato, correzioni, soggetto, "stato");
  const scadenza = valoreEffettivo<unknown>(a.scadenza, correzioni, soggetto, "scadenza");
  const completataDallUtente = stato.corretto && stato.valore === "completata";
  return {
    ...a,
    descrizione: valoreEffettivo(a.descrizione, correzioni, soggetto, "descrizione").valore,
    scadenza: scadenza.corretto ? comeData(scadenza.valore) : a.scadenza,
    priorita: valoreEffettivo<Priorita>(a.priorita, correzioni, soggetto, "priorita").valore,
    stato: stato.valore,
    completataDa: stato.corretto ? (completataDallUtente ? "utente" : null) : a.completataDa,
    completataIl: stato.corretto ? (completataDallUtente ? (stato.correzione?.creataIl ?? null) : null) : a.completataIl,
    emailCompletamentoId: stato.corretto ? null : a.emailCompletamentoId,
  };
}

/** Attesa con il ciclo effettivo (conferma o scarto dell'utente). */
export function attesaEffettiva(a: Attesa, correzioni: readonly Correzione[]): Attesa {
  return { ...a, ciclo: valoreEffettivo<CicloAttesa>(a.ciclo, correzioni, { tipo: "attesa", id: a.id }, "ciclo").valore };
}

export function statoCollegamentoEffettivo(c: Collegamento, correzioni: readonly Correzione[]): StatoCollegamento {
  return valoreEffettivo<StatoCollegamento>(c.stato, correzioni, { tipo: "collegamento", id: c.id }, "stato").valore;
}

export function statoRispostaEffettivo(r: RispostaArrivata, correzioni: readonly Correzione[]): StatoCollegamento {
  return valoreEffettivo<StatoCollegamento>(r.statoCollegamento, correzioni, { tipo: "risposta", id: r.id }, "statoCollegamento").valore;
}

export function valutazioneEffettiva(r: RispostaArrivata, correzioni: readonly Correzione[]): Valutazione {
  return valoreEffettivo<Valutazione>(r.valutazione, correzioni, { tipo: "risposta", id: r.id }, "valutazione").valore;
}

export function revisioneEffettiva(r: RispostaArrivata, correzioni: readonly Correzione[]): StatoRevisione {
  return valoreEffettivo<StatoRevisione>(r.revisione, correzioni, { tipo: "risposta", id: r.id }, "revisione").valore;
}

export interface Affermazione {
  soggetto: PercheDto["soggetto"];
  analisiId: string | null;
}

/** Pannello "Perché?": per ogni affermazione dell'AI la funzione, il modello servito, la versione del Contesto AI e la data. */
export async function perche(ctx: ContestoUtente, affermazioni: readonly Affermazione[]): Promise<PercheDto[]> {
  const ids = [...new Set(affermazioni.map((a) => a.analisiId).filter((x): x is string => x !== null))];
  const informazioni = new Map<string, NonNullable<Awaited<ReturnType<typeof analisi.informazioni>>>>();
  for (const id of ids) {
    const info = await analisi.informazioni(ctx, id);
    if (info) informazioni.set(id, info);
  }
  return affermazioni.flatMap(({ soggetto, analisiId }) => {
    const info = analisiId ? informazioni.get(analisiId) : undefined;
    if (!info) return [];
    return [
      {
        soggetto,
        analisiId: info.id,
        funzione: info.funzione as FunzioneAI,
        modelloRichiesto: info.modelloRichiesto,
        modelloServito: info.modelloServito,
        contestoAiVersione: info.contestoAiVersione,
        completataIl: isoOpzionale(info.completataIl),
      },
    ];
  });
}

export interface SituazioneCalcolata {
  situazione: Situazione;
  attivita: Attivita[];
  attese: { attesa: Attesa; requisiti: Requisito[]; esito: EsitoAttesa; sollecito: boolean }[];
  risposte: RispostaArrivata[];
  collegamenti: Collegamento[];
  /** Correzioni degli elementi e delle email della Situazione. */
  correzioni: Correzione[];
  vista: VistaSituazione;
  /** Email di appartenenza: origine e collegamenti non rifiutati. */
  emailIds: string[];
  ultimaAttivita: Date;
}

/**
 * Stato derivato delle Situazioni (§10.1, §10.3) sui valori effettivi: correzioni dell'utente prima
 * dei valori dell'AI, urgenza dalle email in entrata collegate.
 */
export async function calcolaSituazioni(ctx: ContestoUtente, ids: string[], ora: Date): Promise<SituazioneCalcolata[]> {
  const aggregati = await operativo.aggregati(ctx, ids);
  if (aggregati.length === 0) return [];

  const appartenenza = new Map<string, string[]>();
  for (const agg of aggregati) {
    const collegate = agg.collegamenti.filter((c) => statoCollegamentoEffettivo(c, agg.correzioni) !== "rifiutato").map((c) => c.emailId);
    appartenenza.set(agg.situazione.id, [...new Set([agg.situazione.emailOrigineId, ...collegate])]);
  }
  const tutte = [...new Set([...appartenenza.values()].flat())];
  const [info, classificazioni, correzioniEmail, ultime] = await Promise.all([
    viste.infoEmail(ctx, tutte),
    viste.classificazioni(ctx, tutte),
    operativo.correzioniPer(ctx, tutte.map((id) => ({ tipo: "email" as const, id }))),
    operativo.ultimaAttivitaSituazioni(ctx, aggregati.map((a) => a.situazione.id)),
  ]);

  const segnale = (emailId: string): SegnaleUrgenza | null => {
    const e = info.get(emailId);
    if (!e || e.direzione !== "entrata") return null;
    const c = classificazioni.get(emailId);
    const soggetto = { tipo: "email", id: emailId } as const;
    const urgente = valoreEffettivo<boolean>(c?.urgente ?? false, correzioniEmail, soggetto, "urgente");
    const categoria = valoreEffettivo<Categoria | null>(c?.categoria ?? null, correzioniEmail, soggetto, "categoria");
    // L'urgenza resa visibile da una correzione (email segnata urgente o spostata fuori dalle News) vale
    // dall'istante della correzione: un "segna come gestita" precedente non la assorbe.
    const istanti = [e.ricevutaIl.getTime()];
    if (urgente.correzione && urgente.valore === true && urgente.correzione.valorePrecedente !== true) istanti.push(urgente.correzione.creataIl.getTime());
    if (categoria.correzione && categoria.valore !== "news" && categoria.correzione.valorePrecedente === "news") istanti.push(categoria.correzione.creataIl.getTime());
    return { emailId, ricevutaIl: new Date(Math.max(...istanti)), urgente: urgente.valore === true && categoria.valore !== "news" };
  };

  return aggregati.map((agg) => {
    const correzioni = [...agg.correzioni, ...correzioniEmail];
    const attivita = agg.attivita.map((a) => attivitaEffettiva(a, correzioni));
    const attese = agg.attese.map(({ attesa, requisiti }) => {
      const effettiva = attesaEffettiva(attesa, correzioni);
      const esito = derivaStatoAttesa({ attesa: effettiva, requisiti, risposte: agg.risposte, correzioni });
      return { attesa: effettiva, requisiti, esito, sollecito: sollecitoConsigliato(effettiva, esito.stato, ora) };
    });
    const emailIds = appartenenza.get(agg.situazione.id) ?? [agg.situazione.emailOrigineId];
    const vista = derivaVistaSituazione({
      situazione: agg.situazione,
      attivita,
      attese: attese.map(({ attesa, esito }) => ({ attesa, stato: esito.stato })),
      risposte: agg.risposte,
      segnaliUrgenza: emailIds.map(segnale).filter((s): s is SegnaleUrgenza => s !== null),
      correzioni,
      ora,
    });
    // Un collegamento stabilito dall'AI resta una Proposta finché l'utente non lo conferma (CONTEXT.md).
    const collegamentoProposto = agg.collegamenti.some((c) => c.ruolo !== "origine" && statoCollegamentoEffettivo(c, correzioni) === "proposto");
    return {
      situazione: agg.situazione,
      attivita,
      attese,
      risposte: agg.risposte,
      collegamenti: agg.collegamenti,
      correzioni,
      vista: { ...vista, haProposte: vista.haProposte || (vista.attiva && collegamentoProposto) },
      emailIds,
      ultimaAttivita: ultime.get(agg.situazione.id) ?? agg.situazione.creataIl,
    };
  });
}

/** Prossima azione con i dati dell'elemento a cui rimanda, per i testi tradotti dell'interfaccia. */
export function prossimaAzioneDto(calc: SituazioneCalcolata): ProssimaAzioneDto {
  const p = calc.vista.prossimaAzione;
  const destinatari = (a: Attesa) => a.destinatari.map((d) => d.indirizzo);
  switch (p.tipo) {
    case "rivedi_risposta": {
      const r = calc.risposte.find((x) => x.id === p.rispostaId);
      const a = r ? calc.attese.find((x) => x.attesa.id === r.attesaId)?.attesa : undefined;
      if (!r || !a) return { tipo: "nessuna" };
      return { tipo: "rivedi_risposta", rispostaId: r.id, attesaId: a.id, emailId: r.emailId, oggettoAttesa: a.oggetto, valutazione: valutazioneEffettiva(r, calc.correzioni) };
    }
    case "attivita": {
      const a = calc.attivita.find((x) => x.id === p.attivitaId);
      if (!a) return { tipo: "nessuna" };
      return { tipo: "attivita", attivitaId: a.id, descrizione: a.descrizione, scadenza: isoOpzionale(a.scadenza), priorita: a.priorita };
    }
    case "sollecito":
    case "attendi": {
      const a = calc.attese.find((x) => x.attesa.id === p.attesaId)?.attesa;
      if (!a) return { tipo: "nessuna" };
      return { tipo: p.tipo, attesaId: a.id, oggetto: a.oggetto, destinatari: destinatari(a), dataAttesa: isoOpzionale(a.dataAttesa) };
    }
    case "gestisci_urgenza":
      return { tipo: "gestisci_urgenza", motivo: calc.vista.motivoUrgenza };
    case "nessuna":
      return { tipo: "nessuna" };
  }
}
