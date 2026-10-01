import { getTranslations } from "next-intl/server";
import { spostateFuoriDalleNews, vistaRiepilogoNews } from "@ec/applicazione";
import { richiediOnboardingEssenziale } from "@/lib/server/onboarding";
import { comeUtente } from "@/lib/server/sessione";
import { IntestazionePagina, StatoVuoto } from "@/components/ui/pagina";
import { RiepilogoNews } from "@/components/home/riepilogo-news";
import { AnnuncioNews } from "./annuncio";
import { ElencoNews, ElencoSpostate } from "./elenchi";

/**
 * `/news` (§13): il Riepilogo News, le email appena spostate fuori (annullabili per 24 ore) e gli originali
 * delle News delle ultime 24 ore, ognuno con il link all'email e la correzione "Non è una News?". Senza News
 * la pagina mostra un solo stato vuoto, senza sottotitolo: non c'è nulla da spostare.
 */
export default async function PaginaNews() {
  await richiediOnboardingEssenziale();
  const t = await getTranslations("news");
  const dati = await comeUtente(async (ctx, dip) => {
    const news = await vistaRiepilogoNews(dip, ctx);
    const spostate = await spostateFuoriDalleNews(dip, ctx);
    return { news, spostate };
  });
  // `vuoto` equivale a nessuna email nella finestra: niente riepilogo né elenco, un solo stato vuoto.
  const senzaNews = dati.news.vuoto && dati.news.membri.length === 0;

  return (
    <div>
      <IntestazionePagina titolo={t("titolo")} descrizione={senzaNews ? undefined : t("descrizione")} />
      <AnnuncioNews />
      <div className="space-y-8">
        {senzaNews ? <StatoVuoto titolo={t("vuoto")} /> : <RiepilogoNews news={dati.news} />}
        <ElencoSpostate spostate={dati.spostate} />
        {senzaNews ? null : <ElencoNews membri={dati.news.membri} />}
      </div>
    </div>
  );
}
