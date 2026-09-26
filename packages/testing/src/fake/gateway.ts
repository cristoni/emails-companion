import type { FunzioneAI } from "@ec/core/dominio";
import type {
  CodiceErroreModello,
  CompatibilitaModello,
  EsitoModello,
  GatewayModelli,
  PrezziModello,
  RichiestaModello,
  StatoChiave,
} from "@ec/core/porte";

export type RispostaScriptata = { output: unknown } | { errore: CodiceErroreModello; riprovaDopoMs?: number };
export type Script = (dati: any, richiesta: RichiestaModello) => RispostaScriptata;

/** Estrae il JSON dei dati compreso tra i delimitatori del prompt. */
export function datiDalPrompt(dati: string): any {
  const inizio = dati.indexOf("{");
  const fine = dati.lastIndexOf("}");
  return JSON.parse(dati.slice(inizio, fine + 1));
}

const UTILIZZO = { modelloServito: "openai/gpt-6-luna", fornitore: "azure", tokenIngresso: 100, tokenUscita: 50, costo: 0.0001, idGenerazione: "gen-finta", latenzaMs: 5 };

/** Gateway dei modelli con risposte scriptate per Funzione AI; registra ogni chiamata. */
export class GatewayModelliFinto implements GatewayModelli {
  readonly chiamate: { funzione: FunzioneAI; modello: string; dati: any; richiesta: RichiestaModello }[] = [];
  readonly script = new Map<FunzioneAI, Script>();
  statoChiave: StatoChiave = { stato: "valida", etichetta: "test", limiteResiduo: null };
  compatibilita: CompatibilitaModello = "ok";

  quando(funzione: FunzioneAI, script: Script): this {
    this.script.set(funzione, script);
    return this;
  }

  chiamateDi(funzione: FunzioneAI) {
    return this.chiamate.filter((c) => c.funzione === funzione);
  }

  async invoca(richiesta: RichiestaModello): Promise<EsitoModello> {
    const dati = datiDalPrompt(richiesta.dati);
    this.chiamate.push({ funzione: richiesta.funzione, modello: richiesta.modello, dati, richiesta });
    const script = this.script.get(richiesta.funzione);
    if (!script) throw new Error(`nessuno script per ${richiesta.funzione}`);
    const risposta = script(dati, richiesta);
    if ("errore" in risposta) return { ok: false, codice: risposta.errore, riprovaDopoMs: risposta.riprovaDopoMs ?? null, utilizzo: null };
    return { ok: true, output: risposta.output, utilizzo: UTILIZZO };
  }

  async verificaChiave(): Promise<StatoChiave> {
    return this.statoChiave;
  }

  async verificaModello(): Promise<CompatibilitaModello> {
    return this.compatibilita;
  }

  async prezzi(): Promise<PrezziModello> {
    return { ingressoPerToken: 0.1 / 1_000_000, uscitaPerToken: 0.5 / 1_000_000 };
  }
}
