import { DIRETTIVE_PREDEFINITE } from "@ec/ai";
import { statoOnboarding } from "@ec/applicazione";
import { caselle, impostazioni, sincronizzazione } from "@ec/db";
import { comeUtente } from "@/lib/server/sessione";
import { VistaOnboarding } from "./vista";

/** `/onboarding`: legge stato di informativa, chiave (mai il valore), Contesto AI e caselle, poi mostra i passi. */
export default async function PaginaOnboarding() {
  const dati = await comeUtente(async (ctx, dip) => {
    const elenco = await caselle.elenca(ctx);
    const [consenso, chiave, contesto, sync, stato] = await Promise.all([
      impostazioni.haConsenso(ctx, dip.configurazione.versioneInformativa),
      impostazioni.infoChiave(ctx),
      impostazioni.contestoCorrente(ctx),
      Promise.all(elenco.map((c) => sincronizzazione.leggi(ctx, c.id))),
      statoOnboarding(dip, ctx),
    ]);
    return {
      consenso,
      chiave: chiave ? { stato: chiave.stato, ultimeCifre: chiave.ultimeCifre } : null,
      // Come in Impostazioni: un testo uguale alle Direttive predefinite (per esempio dopo un ripristino) vale come predefinito.
      contesto: contesto && contesto.testo !== DIRETTIVE_PREDEFINITE ? contesto.testo : null,
      predefinite: DIRETTIVE_PREDEFINITE,
      caselle: elenco.map((c, i) => {
        const s = sync[i];
        return {
          id: c.id,
          indirizzo: c.indirizzo,
          stato: c.stato,
          fase: s?.faseImportazione ?? null,
          stima: s?.stima ? { numeroEmail: s.stima.numeroEmail, costoStimato: s.stima.costoStimato } : null,
        };
      }),
      importazioniDecise: stato.importazioniDaDecidere.length === 0,
      essenziale: stato.essenziale,
      completo: stato.completo,
    };
  });
  return <VistaOnboarding dati={dati} />;
}
