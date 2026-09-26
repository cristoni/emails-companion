import type { CodaJob, NomeJob, OpzioniJob, PayloadJob } from "@ec/core/porte";
import type { Orologio } from "@ec/core/porte";

export interface JobInCoda {
  id: number;
  nome: NomeJob;
  payload: unknown;
  eseguiIl: Date;
  chiave: string | null;
  priorita: number;
}

/**
 * Coda in memoria con la semantica utile ai test: i job esistono solo dopo il commit, una chiave
 * sostituisce il job pendente (`replace`) o ne conserva l'orario (`preserve_run_at`).
 */
export class CodaInMemoria {
  readonly #orologio: Orologio;
  #prossimoId = 1;
  readonly pendenti: JobInCoda[] = [];
  readonly storico: { nome: NomeJob; payload: unknown }[] = [];

  constructor(orologio: Orologio) {
    this.#orologio = orologio;
  }

  /** Fabbrica per l'unità di lavoro: la coda della transazione pubblica i job solo dopo il commit. */
  readonly fabbrica = (_tx: unknown, dopoCommit: (azione: () => void) => void): CodaJob => ({
    accoda: async <N extends NomeJob>(nome: N, payload: PayloadJob[N], opzioni: OpzioniJob = {}) => {
      const copia = structuredClone(payload);
      dopoCommit(() => this.aggiungi(nome, copia, opzioni));
    },
  });

  aggiungi<N extends NomeJob>(nome: N, payload: PayloadJob[N], opzioni: OpzioniJob = {}): void {
    const eseguiIl = opzioni.esegui ?? this.#orologio.ora();
    const chiave = opzioni.chiave ?? null;
    if (chiave) {
      const esistente = this.pendenti.find((j) => j.chiave === chiave);
      if (esistente) {
        esistente.payload = payload;
        if ((opzioni.modalitaChiave ?? "replace") === "replace") esistente.eseguiIl = eseguiIl;
        return;
      }
    }
    this.pendenti.push({ id: this.#prossimoId++, nome, payload, eseguiIl, chiave, priorita: opzioni.priorita ?? 0 });
  }

  /** Estrae il prossimo job dovuto (priorità, poi orario, poi ordine di inserimento). */
  prossimo(): JobInCoda | null {
    const adesso = this.#orologio.ora().getTime();
    const dovuti = this.pendenti.filter((j) => j.eseguiIl.getTime() <= adesso);
    if (dovuti.length === 0) return null;
    dovuti.sort((a, b) => a.priorita - b.priorita || a.eseguiIl.getTime() - b.eseguiIl.getTime() || a.id - b.id);
    const scelto = dovuti[0]!;
    this.pendenti.splice(this.pendenti.indexOf(scelto), 1);
    this.storico.push({ nome: scelto.nome, payload: scelto.payload });
    return scelto;
  }

  prossimaScadenza(): Date | null {
    if (this.pendenti.length === 0) return null;
    return new Date(Math.min(...this.pendenti.map((j) => j.eseguiIl.getTime())));
  }
}
