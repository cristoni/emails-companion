import type { Attesa, Attivita, Correzione, RispostaArrivata, Situazione } from "./entita";
import {
  AREE,
  PRIORITA,
  type Area,
  type IdAttesa,
  type IdAttivita,
  type IdEmail,
  type IdRisposta,
  type Priorita,
  type StatoAttesa,
  type StatoCollegamento,
  type StatoElemento,
  type StatoRevisione,
} from "./tipi";
import { valoreEffettivo } from "./valori-effettivi";

export const ORE_SCADENZA_URGENTE = 48;

export type MotivoUrgenza = "utente" | "email_urgente" | "attivita_urgente" | "scadenza_vicina";

export type ProssimaAzione =
  | { tipo: "rivedi_risposta"; rispostaId: IdRisposta }
  | { tipo: "attivita"; attivitaId: IdAttivita; scadenza: Date | null }
  | { tipo: "sollecito"; attesaId: IdAttesa }
  | { tipo: "attendi"; attesaId: IdAttesa }
  | { tipo: "gestisci_urgenza" }
  | { tipo: "nessuna" };

export interface VistaSituazione {
  attiva: boolean;
  archiviata: boolean;
  /** Aree in cui rientra, in ordine di precedenza. */
  aree: Area[];
  areaPrincipale: Area | null;
  urgente: boolean;
  motivoUrgenza: MotivoUrgenza | null;
  /**
   * Con motivo "email_urgente", l'email che rende urgente la Situazione: l'email d'origine se conta,
   * altrimenti la più recente tra quelle che contano. null con ogni altro motivo.
   */
  emailUrgente: IdEmail | null;
  prossimaAzione: ProssimaAzione;
  haProposte: boolean;
  scadenzaPiuVicina: Date | null;
  prioritaMassima: Priorita | null;
}

export interface SegnaleUrgenza {
  emailId: IdEmail;
  ricevutaIl: Date;
  urgente: boolean;
}

const confrontaId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Date nulle in fondo. */
function confrontaDate(a: Date | null, b: Date | null): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return a.getTime() - b.getTime();
}

/** Priorità nulle in fondo; "alta" prima. */
function confrontaPriorita(a: Priorita | null, b: Priorita | null): number {
  const rango = (p: Priorita | null) => (p === null ? PRIORITA.length : PRIORITA.indexOf(p));
  return rango(a) - rango(b);
}

/** Stringhe accettate solo con fuso esplicito: senza, `new Date` userebbe il fuso della macchina. */
function comeData(valore: unknown): Date | null {
  const conFuso = typeof valore === "string" && /(?:Z|[+-]\d{2}:\d{2})$/i.test(valore.trim());
  const data = valore instanceof Date ? valore : conFuso ? new Date(valore.trim()) : null;
  return data !== null && !Number.isNaN(data.getTime()) ? data : null;
}

export function sollecitoConsigliato(attesa: Attesa, stato: StatoAttesa, ora: Date): boolean {
  return (stato === "aperta" || stato === "parziale") && attesa.dataAttesa !== null && attesa.dataAttesa < ora;
}

export function derivaVistaSituazione(input: {
  situazione: Situazione;
  attivita: readonly Attivita[];
  attese: readonly { attesa: Attesa; stato: StatoAttesa }[];
  risposte: readonly RispostaArrivata[];
  segnaliUrgenza: readonly SegnaleUrgenza[];
  correzioni: readonly Correzione[];
  ora: Date;
  oreScadenzaUrgente?: number;
}): VistaSituazione {
  const { situazione, correzioni, ora } = input;
  const suSituazione = { tipo: "situazione", id: situazione.id } as const;

  const attivitaAperte = input.attivita
    .map((a) => ({ a, stato: valoreEffettivo<StatoElemento>(a.stato, correzioni, { tipo: "attivita", id: a.id }, "stato").valore }))
    .filter(({ stato }) => stato === "proposta" || stato === "confermata")
    .sort(
      (x, y) =>
        confrontaDate(x.a.scadenza, y.a.scadenza) ||
        confrontaPriorita(x.a.priorita, y.a.priorita) ||
        x.a.creataIl.getTime() - y.a.creataIl.getTime() ||
        confrontaId(x.a.id, y.a.id),
    );

  const risposteDaVedere = input.risposte
    .map((r) => {
      const soggetto = { tipo: "risposta", id: r.id } as const;
      return {
        r,
        revisione: valoreEffettivo<StatoRevisione>(r.revisione, correzioni, soggetto, "revisione").valore,
        collegamento: valoreEffettivo<StatoCollegamento>(r.statoCollegamento, correzioni, soggetto, "statoCollegamento").valore,
      };
    })
    .filter(({ revisione, collegamento }) => revisione === "da_vedere" && collegamento !== "rifiutato")
    .sort((x, y) => x.r.arrivataIl.getTime() - y.r.arrivataIl.getTime() || confrontaId(x.r.id, y.r.id));

  const atteseAperte = input.attese
    .filter(
      ({ attesa, stato }) =>
        (stato === "aperta" || stato === "parziale") && (attesa.ciclo === "proposta" || attesa.ciclo === "confermata"),
    )
    .sort(
      (x, y) =>
        confrontaDate(x.attesa.dataAttesa, y.attesa.dataAttesa) ||
        x.attesa.creataIl.getTime() - y.attesa.creataIl.getTime() ||
        confrontaId(x.attesa.id, y.attesa.id),
    );

  const archiviata =
    valoreEffettivo<unknown>(situazione.archiviataIl !== null, correzioni, suSituazione, "archiviata").valore === true;

  const gestitaIl = comeData(valoreEffettivo<unknown>(situazione.gestitaIl, correzioni, suSituazione, "gestitaIl").valore);
  const nonGestita = (istante: Date) => gestitaIl === null || istante > gestitaIl;
  const limiteScadenza = ora.getTime() + (input.oreScadenzaUrgente ?? ORE_SCADENZA_URGENTE) * 3_600_000;
  const segnataUrgente = valoreEffettivo<unknown>(null, correzioni, suSituazione, "urgente");
  const segnaliAttivi = input.segnaliUrgenza.filter((s) => s.urgente && nonGestita(s.ricevutaIl));

  const motivoCalcolato: MotivoUrgenza | null =
    segnataUrgente.valore === true && segnataUrgente.correzione !== null && nonGestita(segnataUrgente.correzione.creataIl)
      ? "utente"
      : segnaliAttivi.length > 0
        ? "email_urgente"
        : attivitaAperte.some(({ a }) => a.urgente && nonGestita(a.creataIl))
          ? "attivita_urgente"
          : attivitaAperte.some(({ a }) => a.scadenza !== null && a.scadenza.getTime() <= limiteScadenza)
            ? "scadenza_vicina"
            : null;
  const motivoUrgenza = archiviata ? null : motivoCalcolato;
  const emailUrgente =
    motivoUrgenza !== "email_urgente"
      ? null
      : (segnaliAttivi.find((s) => s.emailId === situazione.emailOrigineId) ??
          [...segnaliAttivi].sort((x, y) => y.ricevutaIl.getTime() - x.ricevutaIl.getTime() || confrontaId(x.emailId, y.emailId))[0]!
        ).emailId;

  const presenti: Record<Area, boolean> = {
    urgente: motivoUrgenza !== null,
    risposte_arrivate: risposteDaVedere.length > 0,
    da_fare: attivitaAperte.length > 0,
    in_attesa: atteseAperte.length > 0,
  };
  const aree = archiviata ? [] : AREE.filter((area) => presenti[area]);

  const primaAttivita = attivitaAperte[0]?.a;
  const primaRisposta = risposteDaVedere[0]?.r;
  const daSollecitare = atteseAperte.find(({ attesa, stato }) => sollecitoConsigliato(attesa, stato, ora))?.attesa;
  const primaAttesa = atteseAperte[0]?.attesa;
  const prossimaAzione: ProssimaAzione = archiviata
    ? { tipo: "nessuna" }
    : primaRisposta
      ? { tipo: "rivedi_risposta", rispostaId: primaRisposta.id }
      : primaAttivita
        ? { tipo: "attivita", attivitaId: primaAttivita.id, scadenza: primaAttivita.scadenza }
        : daSollecitare
          ? { tipo: "sollecito", attesaId: daSollecitare.id }
          : primaAttesa
            ? { tipo: "attendi", attesaId: primaAttesa.id }
            : motivoUrgenza !== null
              ? { tipo: "gestisci_urgenza" }
              : { tipo: "nessuna" };

  return {
    attiva: aree.length > 0,
    archiviata,
    aree,
    areaPrincipale: aree[0] ?? null,
    urgente: motivoUrgenza !== null,
    motivoUrgenza,
    emailUrgente,
    prossimaAzione,
    haProposte:
      attivitaAperte.some(({ stato }) => stato === "proposta") ||
      atteseAperte.some(({ attesa }) => attesa.ciclo === "proposta") ||
      risposteDaVedere.some(({ collegamento }) => collegamento === "proposto"),
    scadenzaPiuVicina: attivitaAperte.map(({ a }) => a.scadenza).find((s) => s !== null) ?? null,
    prioritaMassima: attivitaAperte.map(({ a }) => a.priorita).sort(confrontaPriorita)[0] ?? null,
  };
}

/** Ordine della home: area principale, urgenza, scadenza, priorità, attività più recente, id. */
export function ordinaVisteSituazioni<T extends { id: string; vista: VistaSituazione; ultimaAttivita: Date }>(
  elenco: readonly T[],
): T[] {
  const rangoArea = (area: Area | null) => (area === null ? AREE.length : AREE.indexOf(area));
  return [...elenco].sort(
    (x, y) =>
      rangoArea(x.vista.areaPrincipale) - rangoArea(y.vista.areaPrincipale) ||
      Number(y.vista.urgente) - Number(x.vista.urgente) ||
      confrontaDate(x.vista.scadenzaPiuVicina, y.vista.scadenzaPiuVicina) ||
      confrontaPriorita(x.vista.prioritaMassima, y.vista.prioritaMassima) ||
      y.ultimaAttivita.getTime() - x.ultimaAttivita.getTime() ||
      confrontaId(x.id, y.id),
  );
}
