import { leggiConfigurazione, type ConfigurazioneAmbiente } from "@ec/composizione";

export class ErroreDemo extends Error {
  constructor(codice: string) {
    super(codice);
    this.name = "ErroreDemo";
  }
}

/**
 * Sintesi di un errore da stampare: il codice quando c'è, altrimenti nome e prima riga del messaggio,
 * più lo SQLSTATE della causa. Mai il messaggio intero: quello di una query fallita (Drizzle) riporta
 * anche i parametri, per esempio il token della sessione appena creata.
 */
export function sintesiErrore(errore: unknown): string {
  if (!(errore instanceof Error)) return "errore_sconosciuto";
  const codice = (errore as { codice?: unknown }).codice;
  if (typeof codice === "string") return codice;
  // I messaggi della demo sono codici composti qui, da parti già sintetizzate.
  if (errore instanceof ErroreDemo) return errore.message;
  const primaRiga = (errore.message.split(/\r?\n/, 1)[0] ?? "").slice(0, 200);
  const causa = (errore.cause as { code?: unknown } | undefined)?.code;
  return `${errore.name}: ${primaRiga}${typeof causa === "string" ? ` (causa ${causa})` : ""}`;
}

/**
 * Unico ingresso per tutto ciò che la demo scrive (utente sintetico, pipeline, sessioni di prova).
 * Si appoggia a `leggiConfigurazione`, che rifiuta la modalità finta in produzione, con il segreto OAuth
 * di Google o con la chiave principale marcata di produzione; in più esige la modalità finta e rifiuta
 * `NODE_ENV=production`, che `leggiConfigurazione` non considera.
 * Nel percorso di `pnpm demo` l'ambiente arriva da `ambienteDiPreparazione`, che svuota il segreto OAuth e
 * forza la chiave attiva 1: lì restano efficaci i marcatori di produzione e `NODE_ENV` (vedi i test).
 */
export function configurazioneFinta(env: Record<string, string | undefined>): ConfigurazioneAmbiente {
  if (env.NODE_ENV === "production") throw new ErroreDemo("demo_vietata_con_node_env_production");
  const cfg = leggiConfigurazione(env);
  if (cfg.modalita !== "finta") throw new ErroreDemo("demo_solo_in_modalita_finta");
  return cfg;
}
