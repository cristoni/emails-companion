import type { Metadata } from "next";
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

/** Oltre questo numero di card la pagina non si legge più a colpo d'occhio e il sommario serve da indice. */
const CARD_SENZA_SOMMARIO = 4;

/** Il titolo della scheda del browser è il nome della voce di navigazione, non il titolo della pagina. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("navigazione");
  return { title: t("home") };
}

/**
 * Home (§13): gli avvisi e l'avanzamento dell'Importazione iniziale, poi le Aree non vuote nell'ordine di
 * precedenza (Urgente, Risposte arrivate, Da fare, In attesa) in una sola colonna, con una card per Situazione.
 * Il sommario delle Aree compare solo quando la pagina è lunga: su una pagina corta ripeterebbe i titoli
 * delle sezioni subito sotto. Il Riepilogo News sta a destra sugli schermi larghi e dopo le Aree negli altri.
 */
export default async function Home() {
  await richiediOnboardingEssenziale();
  const t = await getTranslations("home");
  const vista = await comeUtente((ctx, dip) => vistaHome(dip, ctx));

  const conteggi = Object.fromEntries(AREE.map((a) => [a, vista.aree[a].length])) as Record<Area, number>;
  const areeAperte = AREE.filter((a) => conteggi[a] > 0);
  const totaleCard = areeAperte.reduce((somma, a) => somma + conteggi[a], 0);
  const mostraSommario = totaleCard > CARD_SENZA_SOMMARIO || areeAperte.filter((a) => conteggi[a] > 1).length >= 2;
  // Con una sola casella collegata ripeterla su ogni card non dice nulla (PROJECT.md §2.3).
  const mostraCaselle = vista.numeroCaselle > 1;
  // "Tutto in ordine" solo se nulla spiega il vuoto: con avvisi o importazioni l'analisi potrebbe non essere girata.
  const tuttoFatto = areeAperte.length === 0 && vista.avvisi.length === 0 && vista.importazioni.length === 0;

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <h1 className="text-2xl">{t("titolo")}</h1>
        {mostraSommario ? <SommarioAree conteggi={conteggi} news={vista.news.membri.length} /> : null}
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
