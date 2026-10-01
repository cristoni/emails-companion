import { pauseEffettiveImpostazioni, vistaStato } from "@ec/applicazione";
import { comeUtente } from "@/lib/server/sessione";
import { VistaStato } from "@/components/stato/vista-stato";

/**
 * `/status`: verdetto complessivo, caselle (ultima sincronizzazione, importazione, errori), analisi AI con
 * pause e aggiornamenti automatici, errori recenti con il link all'email. Solo codici tradotti. Non chiama
 * `richiediOnboardingEssenziale`: serve anche senza chiave o caselle. Le pause arrivano da
 * `pauseEffettiveImpostazioni`, che include anche chiave assente e informativa non accettata: `vistaStato`
 * riporta solo le pause registrate e la pausa manuale.
 */
export default async function PaginaStato() {
  const { vista, pause } = await comeUtente(async (ctx, dip) => ({
    vista: await vistaStato(dip, ctx),
    pause: await pauseEffettiveImpostazioni(dip, ctx),
  }));
  return <VistaStato vista={vista} pause={pause} />;
}
