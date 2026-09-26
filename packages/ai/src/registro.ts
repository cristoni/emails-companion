import { MODELLO_PREDEFINITO, type FunzioneAI } from "@ec/core/dominio";
import { SCHEMI_OUTPUT } from "./schemi";

export interface DefinizioneFunzione<F extends FunzioneAI = FunzioneAI> {
  chiave: F;
  /** Nome della riga in PROJECT.md §4.4. */
  nome: string;
  etichettaI18n: string;
  descrizioneI18n: string;
  datiInterpretati: string;
  versionePrompt: string;
  versioneSchema: string;
  nomeSchema: string;
  schema: (typeof SCHEMI_OUTPUT)[F];
  /** Include i token di ragionamento dei modelli che ragionano. */
  maxTokenUscita: number;
  modelloPredefinito: typeof MODELLO_PREDEFINITO;
}

function definizione<F extends FunzioneAI>(
  chiave: F,
  voce: Pick<DefinizioneFunzione<F>, "nome" | "datiInterpretati" | "maxTokenUscita">,
): DefinizioneFunzione<F> {
  return {
    chiave,
    ...voce,
    etichettaI18n: `funzioni.${chiave}.nome`,
    descrizioneI18n: `funzioni.${chiave}.descrizione`,
    versionePrompt: "1",
    versioneSchema: "1",
    nomeSchema: chiave,
    schema: SCHEMI_OUTPUT[chiave],
    modelloPredefinito: MODELLO_PREDEFINITO,
  };
}

export const REGISTRO_FUNZIONI: { readonly [F in FunzioneAI]: Readonly<DefinizioneFunzione<F>> } = {
  classificazione_priorita: definizione("classificazione_priorita", {
    nome: "Classificazione e priorità",
    datiInterpretati:
      "Un'email in entrata (intestazioni, oggetto, testo, nomi degli allegati) per distinguere News, urgenze e altri messaggi, motivare la priorità e proporre titolo e descrizione di una nuova Situazione.",
    maxTokenUscita: 4000,
  }),
  estrazione_attivita: definizione("estrazione_attivita", {
    nome: "Estrazione attività",
    datiInterpretati:
      "Un'email in entrata non News, in uscita o interna, con le email di contesto e gli elementi già estratti in precedenza, per riconoscere azioni, impegni, promemoria e scadenze.",
    maxTokenUscita: 8000,
  }),
  attese_risposte: definizione("attese_risposte", {
    nome: "Gestione attese e risposte",
    datiInterpretati:
      "Un'email in uscita o in entrata con le Situazioni, le Attese e le Attività aperte candidate e le loro email, per rilevare richieste, collegare email tra thread e valutare risposte e completamenti.",
    maxTokenUscita: 12000,
  }),
  riepilogo_news: definizione("riepilogo_news", {
    nome: "Riepilogo News",
    datiInterpretati:
      "Le email della categoria News e Informazioni secondarie ricevute nelle ultime 24 ore, per sintetizzarle in voci collegate agli originali.",
    maxTokenUscita: 8000,
  }),
  bozze_assistite: definizione("bozze_assistite", {
    nome: "Bozze assistite",
    datiInterpretati:
      "L'email a cui si risponde o la richiesta da sollecitare, con il thread e le email di contesto ammesse, per proporre oggetto e corpo di una bozza da approvare.",
    maxTokenUscita: 6000,
  }),
};
