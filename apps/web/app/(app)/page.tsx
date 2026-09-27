import { getTranslations } from "next-intl/server";
import { AREE } from "@ec/core/dominio";
import { vistaHome } from "@ec/applicazione";
import { richiediOnboardingEssenziale } from "@/lib/server/onboarding";
import { comeUtente } from "@/lib/server/sessione";
import { IntestazionePagina } from "@/components/ui/pagina";
import { AvvisiHome } from "@/components/home/avvisi-home";
import { ImportazioniInCorso } from "@/components/home/importazioni-in-corso";
import { RiepilogoNews } from "@/components/home/riepilogo-news";
import { SezioneArea } from "@/components/home/sezione-area";

/**
 * Home (§13): avvisi, avanzamento dell'Importazione iniziale, le quattro Aree nell'ordine di precedenza
 * (Urgente, Risposte arrivate, Da fare, In attesa) con una card per Situazione, e il Riepilogo News.
 */
export default async function Home() {
  await richiediOnboardingEssenziale();
  const t = await getTranslations("home");
  const vista = await comeUtente((ctx, dip) => vistaHome(dip, ctx));

  return (
    <div className="space-y-10">
      <IntestazionePagina titolo={t("titolo")} descrizione={t("descrizione")} />

      {vista.avvisi.length > 0 || vista.importazioni.length > 0 ? (
        <div className="space-y-4">
          <AvvisiHome avvisi={vista.avvisi} />
          <ImportazioniInCorso importazioni={vista.importazioni} />
        </div>
      ) : null}

      {AREE.map((area) => (
        <SezioneArea key={area} area={area} card={vista.aree[area]} />
      ))}

      <RiepilogoNews news={vista.news} collegaPaginaNews />
    </div>
  );
}
