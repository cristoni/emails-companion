import type { Attesa, Correzione, Requisito, RispostaArrivata } from "./entita";
import type { IdRequisito, IdRisposta, StatoAttesa, StatoCollegamento, Valutazione } from "./tipi";
import { valoreEffettivo } from "./valori-effettivi";

export interface EsitoAttesa {
  stato: StatoAttesa;
  chiusaDa: "ai" | "utente" | null;
  rispostaDiChiusura: IdRisposta | null;
  requisitiSoddisfatti: IdRequisito[];
  daVerificare: IdRisposta[];
}

interface Contributo {
  risposta: RispostaArrivata;
  completa: boolean;
  /** L'utente l'ha corretta in "completa": copre tutti i requisiti per sua decisione. */
  dellUtente: boolean;
  contribuisce: boolean;
  copre: ReadonlySet<IdRequisito>;
  /** Valutazione dell'AI con un requisito dichiarato senza evidenza verificata. */
  nonVerificata: boolean;
  /** Valutazione "completa" dell'AI che da sola non copre tutti i requisiti. */
  completaNonCoperta: boolean;
}

const perArrivo = (a: RispostaArrivata, b: RispostaArrivata) =>
  a.arrivataIl.getTime() - b.arrivataIl.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function contributo(r: RispostaArrivata, requisiti: readonly IdRequisito[], correzioni: readonly Correzione[]): Contributo | null {
  const soggetto = { tipo: "risposta", id: r.id } as const;
  const collegamento = valoreEffettivo<StatoCollegamento>(r.statoCollegamento, correzioni, soggetto, "statoCollegamento");
  if (collegamento.valore === "rifiutato") return null;
  const valutazione = valoreEffettivo<Valutazione>(r.valutazione, correzioni, soggetto, "valutazione");
  if (valutazione.valore === "non_pertinente") return null;
  const completa = valutazione.valore === "completa";

  if (valutazione.corretto && completa) {
    const copre = new Set(requisiti);
    return { risposta: r, completa, dellUtente: true, contribuisce: true, copre, nonVerificata: false, completaNonCoperta: false };
  }
  const dichiarati = r.requisitiSoddisfatti.filter((d) => requisiti.includes(d.requisitoId));
  const copre = new Set(dichiarati.filter((d) => d.evidenze.some((e) => e.verificata)).map((d) => d.requisitoId));
  const dellAI = !valutazione.corretto;
  return {
    risposta: r,
    completa,
    dellUtente: false,
    contribuisce: copre.size > 0,
    copre,
    nonVerificata: dellAI && dichiarati.some((d) => !copre.has(d.requisitoId)),
    completaNonCoperta: dellAI && completa && (requisiti.length === 0 || requisiti.some((q) => !copre.has(q))),
  };
}

/** Soddisfatta solo con tutti i requisiti coperti e almeno una risposta completa tra quelle che contribuiscono. */
function valuta(requisiti: readonly IdRequisito[], contributi: readonly Contributo[]) {
  const soddisfatti = new Set(contributi.flatMap((c) => [...c.copre]));
  const contribuenti = contributi.filter((c) => c.contribuisce);
  const tutti = contribuenti.some((c) => c.completa) && requisiti.every((q) => soddisfatti.has(q));
  const stato: StatoAttesa = tutti ? "soddisfatta" : soddisfatti.size > 0 ? "parziale" : "aperta";
  const chiusura = tutti ? (contribuenti.map((c) => c.risposta).sort(perArrivo).at(-1) ?? null) : null;
  return { stato, soddisfatti, chiusura };
}

export function derivaStatoAttesa(input: {
  attesa: Attesa;
  requisiti: readonly Requisito[];
  risposte: readonly RispostaArrivata[];
  correzioni: readonly Correzione[];
}): EsitoAttesa {
  const { attesa, correzioni } = input;
  const requisiti = input.requisiti
    .filter((q) => q.attesaId === attesa.id)
    .sort((a, b) => a.ordine - b.ordine || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((q) => q.id);
  const contributi = input.risposte
    .filter((r) => r.attesaId === attesa.id)
    .map((r) => contributo(r, requisiti, correzioni))
    .filter((c): c is Contributo => c !== null);

  const { stato, soddisfatti, chiusura } = valuta(requisiti, contributi);
  const requisitiSoddisfatti = requisiti.filter((q) => soddisfatti.has(q));
  const daVerificare = contributi
    .filter((c) => c.nonVerificata || (c.completaNonCoperta && stato !== "soddisfatta"))
    .map((c) => c.risposta)
    .sort(perArrivo)
    .map((r) => r.id);
  const dettagli = { requisitiSoddisfatti, daVerificare };

  if (attesa.ciclo === "scartata" || attesa.ciclo === "superata") {
    return { stato: "annullata", chiusaDa: null, rispostaDiChiusura: null, ...dettagli };
  }
  const decisione = valoreEffettivo<unknown>(null, correzioni, { tipo: "attesa", id: attesa.id }, "stato").valore;
  if (decisione === "annullata" || decisione === "soddisfatta") {
    return { stato: decisione, chiusaDa: "utente", rispostaDiChiusura: null, ...dettagli };
  }
  if (stato !== "soddisfatta") return { stato, chiusaDa: null, rispostaDiChiusura: null, ...dettagli };

  const soloAI = valuta(requisiti, contributi.filter((c) => !c.dellUtente));
  return {
    stato,
    chiusaDa: soloAI.stato === "soddisfatta" ? "ai" : "utente",
    rispostaDiChiusura: chiusura?.id ?? null,
    ...dettagli,
  };
}
