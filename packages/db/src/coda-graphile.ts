import { sql } from "drizzle-orm";
import type { CodaJob, NomeJob, OpzioniJob, PayloadJob } from "@ec/core/porte";
import type { Esecutore } from "./connessione";

/** Accoda con graphile_worker.add_job nella stessa transazione del dominio. */
export function codaGraphile(tx: Esecutore): CodaJob {
  return {
    async accoda<N extends NomeJob>(nome: N, payload: PayloadJob[N], opzioni: OpzioniJob = {}) {
      const risultato = await tx.execute(sql`
        select (graphile_worker.add_job(
          ${nome}::text,
          payload := ${JSON.stringify(payload)}::json,
          queue_name := ${opzioni.coda ?? null}::text,
          run_at := ${opzioni.esegui?.toISOString() ?? null}::timestamptz,
          max_attempts := ${opzioni.tentativiMassimi ?? null}::int,
          job_key := ${opzioni.chiave ?? null}::text,
          priority := ${opzioni.priorita ?? null}::int,
          job_key_mode := ${opzioni.modalitaChiave ?? "replace"}::text
        )).id as id`);
      const righe = (risultato as unknown as { rows: { id: unknown }[] }).rows;
      if (!righe[0] || righe[0].id === null) throw new Error("accodamento_fallito");
    },
  };
}
