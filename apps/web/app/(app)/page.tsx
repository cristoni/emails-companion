import { getTranslations } from "next-intl/server";
import { AREE, type Area } from "@ec/core/dominio";
import { vistaHome } from "@ec/applicazione";
import { richiediOnboardingEssenziale } from "@/lib/server/onboarding";
import { comeUtente } from "@/lib/server/sessione";
import { StatoVuoto } from "@/components/ui/pagina";
import { AvvisiHome } from "@/components/home/avvisi-home";
import { ImportazioniInCorso } from "@/components/home/importazioni-in-corso";
import { RiepilogoNews } from "@/components/home/riepilogo-news";
import { SezioneArea } from "@/components/home/sezione-area";
import { SommarioAree } from "@/components/home/sommario-aree";

/**
 * Home (§13): il sommario delle Aree, gli avvisi e l'avanzamento dell'Importazione iniziale, poi le Aree non
 * vuote nell'ordine di precedenza (Urgente, Risposte arrivate, Da fare, In attesa) in una sola colonna, con una
 * card per Situazione. Il Riepilogo News sta a destra sugli schermi larghi e dopo le Aree negli altri.
 */
export default async function Home() {
  await richiediOnboardingEssenziale();
  const t = await getTranslations("home");
  const vista = await comeUtente((ctx, dip) => vistaHome(dip, ctx));

  const conteggi = Object.fromEntries(AREE.map((a) => [a, vista.aree[a].length])) as Record<Area, number>;
  const areeAperte = AREE.filter((a) => conteggi[a] > 0);
  // La casella compare sulle card solo se quelle mostrate provengono da più di una casella: con una sola,
  // ripeterla ovunque non dice nulla. Regola indicata dal lead; il conteggio delle caselle collegate non è
  // ancora nella vista della home (vedi PROJECT.md, Home).
  const mostraCaselle = new Set(AREE.flatMap((a) => vista.aree[a].flatMap((c) => c.caselle))).size > 1;
  // "Tutto in ordine" solo se nulla spiega il vuoto: con avvisi o importazioni l'analisi potrebbe non essere girata.
  const tuttoFatto = areeAperte.length === 0 && vista.avvisi.length === 0 && vista.importazioni.length === 0;

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <h1 className="text-2xl">{t("titolo")}</h1>
        {areeAperte.length > 0 ? <SommarioAree conteggi={conteggi} news={vista.news.membri.length} /> : null}
      </header>

      <div className="space-y-8 xl:grid xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start xl:gap-8 xl:space-y-0">
        <div className="min-w-0 space-y-8">
          {vista.avvisi.length > 0 || vista.importazioni.length > 0 ? (
            <div className="space-y-2">
              <AvvisiHome avvisi={vista.avvisi} />
              <ImportazioniInCorso importazioni={vista.importazioni} />
            </div>
          ) : null}

          {tuttoFatto ? <StatoVuoto titolo={t("tuttoFatto.titolo")}>{t("tuttoFatto.testo")}</StatoVuoto> : null}

          {areeAperte.map((area) => (
            <SezioneArea key={area} area={area} card={vista.aree[area]} mostraCaselle={mostraCaselle} />
          ))}
        </div>

        <RiepilogoNews news={vista.news} collegaPaginaNews />
      </div>
    </div>
  );
}
