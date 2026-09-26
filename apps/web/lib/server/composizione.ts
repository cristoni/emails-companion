import "server-only";
import { componi, leggiConfigurazione, type Composizione } from "@ec/composizione";
import { codaGraphile } from "@ec/db";

let istanza: Promise<Composizione> | null = null;

/**
 * Dipendenze della webapp, una per processo. La webapp non rileva lingue né esegue job:
 * accoda il lavoro nella stessa transazione e lo lascia al worker.
 */
export function composizione(): Promise<Composizione> {
  istanza ??= componi(leggiConfigurazione(process.env), {
    coda: (tx) => codaGraphile(tx),
    massimoConnessioni: 3,
    lingua: { rileva: () => ({ lingua: null, affidabile: false }) },
  }).catch((errore: unknown) => {
    istanza = null;
    throw errore;
  });
  return istanza;
}
