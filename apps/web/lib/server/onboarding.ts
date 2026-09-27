import "server-only";
import { redirect } from "next/navigation";
import { statoOnboarding } from "@ec/applicazione";
import { comeUtente } from "./sessione";

/**
 * Per le pagine dell'app: senza informativa accettata o chiave salvata porta all'onboarding. È la stessa
 * regola della pagina di onboarding (`statoOnboarding`), che non reindirizza mai: nessun ciclo possibile.
 */
export async function richiediOnboardingEssenziale(): Promise<void> {
  const stato = await comeUtente((ctx, dip) => statoOnboarding(dip, ctx));
  if (!stato.essenziale) redirect("/onboarding");
}
