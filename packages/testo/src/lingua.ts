import type { RilevamentoLingua, RilevatoreLingua } from "@ec/core";

/** Forma minima di un rilevatore eld, sostituibile nei test. */
export interface MotoreEld {
  detect(testo: string): { language: string; isReliable(): boolean };
}

const LETTERE_MINIME = 20;
const INDIRIZZO = /https?:\/\/|www\.|@/i;

export class RilevatoreLinguaEld implements RilevatoreLingua {
  /** Il dizionario di eld occupa circa 70 MB: si carica solo quando serve un rilevatore. */
  static async crea(): Promise<RilevatoreLinguaEld> {
    const { eld } = await import("eld/medium");
    const istanza = eld.newInstance();
    istanza.enableTextCleanup(true);
    return new RilevatoreLinguaEld(istanza);
  }

  readonly #eld: MotoreEld;

  constructor(eld: MotoreEld) {
    this.#eld = eld;
  }

  rileva(testo: string): RilevamentoLingua {
    const esito = this.#eld.detect(testo);
    if (!esito.language) return { lingua: null, affidabile: false };
    const lettere = testo
      .split(/\s+/)
      .filter((parola) => !INDIRIZZO.test(parola))
      .join(" ")
      .match(/\p{L}/gu)?.length ?? 0;
    return { lingua: esito.language.toLowerCase(), affidabile: lettere >= LETTERE_MINIME && esito.isReliable() };
  }
}
