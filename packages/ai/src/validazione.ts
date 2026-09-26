import {
  verificaCitazione,
  type Evidenza,
  type FunzioneAI,
  type IdAttesa,
  type IdAttivita,
  type IdEmail,
  type IdRequisito,
  type IdSituazione,
} from "@ec/core/dominio";
import { SCHEMI_OUTPUT, type OutputFunzione } from "./schemi";

export type EsitoValidazione<F extends FunzioneAI> =
  | { ok: true; output: OutputFunzione<F> }
  /** `problemi`: percorso e codice di ogni violazione, mai i valori ricevuti. */
  | { ok: false; codice: "schema"; problemi: string[] };

export function validaOutput<F extends FunzioneAI>(funzione: F, grezzo: unknown): EsitoValidazione<F> {
  const esito = SCHEMI_OUTPUT[funzione].safeParse(grezzo);
  if (esito.success) return { ok: true, output: esito.data as OutputFunzione<F> };
  const problemi = esito.error.issues.map((p) => `${p.path.map(String).join(".")}: ${p.code === "custom" ? p.message : p.code}`);
  return { ok: false, codice: "schema", problemi };
}

type Alias = Readonly<Record<string, string>>;

/** Alias → id, separati per ruolo: un alias noto ma di un altro ruolo non si risolve. */
export interface TabellaAlias {
  /** e1…: e1 è sempre l'email in esame. */
  email?: Readonly<Record<string, IdEmail>>;
  /** s1…: Situazioni candidate. */
  situazioni?: Readonly<Record<string, IdSituazione>>;
  /** t…: Attività già estratte dall'email in esame (estrazione_attivita). */
  elementiEsistenti?: Readonly<Record<string, IdAttivita>>;
  /** w…: Attese già derivate dall'email in esame (attese_risposte, `riferimento`). */
  atteseEsistenti?: Readonly<Record<string, IdAttesa>>;
  /** w…: Attese aperte candidate (valutazioni e solleciti). */
  atteseCandidate?: Readonly<Record<string, IdAttesa>>;
  /** w1r1…: requisiti delle Attese candidate, con l'alias dell'Attesa a cui appartengono. */
  requisiti?: Readonly<Record<string, { id: IdRequisito; attesa: string }>>;
  /** t…: Attività aperte candidate al completamento (attese_risposte). */
  attivitaCandidate?: Readonly<Record<string, IdAttivita>>;
}

export type EsitoAlias = { ok: true; id: string } | { ok: false; codice: "alias_sconosciuto" };

export function risolviAlias(tabella: Alias | undefined, alias: string): EsitoAlias {
  const id = tabella && Object.hasOwn(tabella, alias) ? tabella[alias] : undefined;
  return typeof id === "string" ? { ok: true, id } : { ok: false, codice: "alias_sconosciuto" };
}

export type EsitoRiferimenti<F extends FunzioneAI> = { ok: true; output: OutputFunzione<F> } | { ok: false; codice: "alias_sconosciuto" };

class AliasSconosciuto extends Error {}

type Ruolo = Exclude<keyof TabellaAlias, "requisiti">;
type Risolvi = (ruolo: Ruolo, alias: string) => string;

const RISOLUTORI: { [F in FunzioneAI]: (o: OutputFunzione<F>, r: Risolvi, t: TabellaAlias) => OutputFunzione<F> } = {
  classificazione_priorita: (o, r) => ({ ...o, evidenze: evidenze(o.evidenze, r) }),
  estrazione_attivita: (o, r) => ({
    ...o,
    elementi: o.elementi.map((e) => ({
      ...e,
      riferimento: e.riferimento === null ? null : r("elementiEsistenti", e.riferimento),
      evidenze: evidenze(e.evidenze, r),
    })),
  }),
  attese_risposte: (o, r, t) => ({
    ...o,
    richieste: o.richieste.map((q) => ({
      ...q,
      riferimento: q.riferimento === null ? null : r("atteseEsistenti", q.riferimento),
      sollecito_di: q.sollecito_di === null ? null : r("atteseCandidate", q.sollecito_di),
      evidenze: evidenze(q.evidenze, r),
    })),
    collegamenti: o.collegamenti.map((c) => ({ ...c, candidato: r("situazioni", c.candidato), evidenze: evidenze(c.evidenze, r) })),
    valutazioni: o.valutazioni.map((v) => ({
      ...v,
      attesa: r("atteseCandidate", v.attesa),
      requisiti: v.requisiti.map((q) => ({ ...q, requisito: requisito(t, q.requisito, v.attesa), evidenze: evidenze(q.evidenze, r) })),
    })),
    completamenti: o.completamenti.map((c) => ({ ...c, attivita: r("attivitaCandidate", c.attivita), evidenze: evidenze(c.evidenze, r) })),
  }),
  riepilogo_news: (o, r) => ({ voci: o.voci.map((v) => ({ ...v, email: v.email.map((e) => r("email", e)) })) }),
  bozze_assistite: (o) => ({ ...o }),
};

function evidenze<T extends { email: string }>(lista: T[], r: Risolvi): T[] {
  return lista.map((e) => ({ ...e, email: r("email", e.email) }));
}

function requisito(tabella: TabellaAlias, alias: string, attesa: string): string {
  const voce = tabella.requisiti && Object.hasOwn(tabella.requisiti, alias) ? tabella.requisiti[alias] : undefined;
  if (!voce || voce.attesa !== attesa) throw new AliasSconosciuto();
  return voce.id;
}

/** Restituisce una copia dell'output con gli id al posto degli alias; qualunque alias non risolto la rifiuta tutta. */
export function risolviRiferimenti<F extends FunzioneAI>(funzione: F, output: OutputFunzione<F>, tabella: TabellaAlias): EsitoRiferimenti<F> {
  const risolvi: Risolvi = (ruolo, alias) => {
    const esito = risolviAlias(tabella[ruolo], alias);
    if (!esito.ok) throw new AliasSconosciuto();
    return esito.id;
  };
  try {
    return { ok: true, output: RISOLUTORI[funzione](output, risolvi, tabella) };
  } catch (errore) {
    if (errore instanceof AliasSconosciuto) return { ok: false, codice: "alias_sconosciuto" };
    throw errore;
  }
}

/**
 * Verifica ogni citazione nel testo dell'email indicata. `testi` è indicizzato come il campo `email`
 * delle evidenze: per ottenere `Evidenza` con id reali si passa l'output già risolto e i testi per id.
 */
export function verificaEvidenze(evidenze: readonly { email: string; citazione: string }[], testi: Readonly<Record<string, string>>): Evidenza[] {
  return evidenze.map(({ email, citazione }) => {
    const testo = Object.hasOwn(testi, email) ? testi[email] : undefined;
    const esito = testo === undefined ? { verificata: false, inizio: null, fine: null } : verificaCitazione(testo, citazione);
    return { emailId: email, citazione, ...esito };
  });
}
