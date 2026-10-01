import { useTranslations } from "next-intl";
import { Newspaper } from "lucide-react";
import { AREE, type Area } from "@ec/core/dominio";
import { IconaArea } from "@/components/comuni/distintivi";
import { cn } from "@/components/ui/cn";

const CLASSI_CHIP = "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-sm whitespace-nowrap";
const CLASSI_LINK = "border-border bg-surface-raised text-text transition-colors hover:border-border-strong hover:bg-surface-muted";
/** Conteggio a zero: attenuato e non cliccabile, perché non c'è una sezione verso cui andare. */
const CLASSI_VUOTO = "border-border/70 text-text-muted";
/** Sotto `sm` le voci mostrano solo icona e numero: il nome resta per i lettori di schermo. */
const CLASSI_NOME = "max-sm:sr-only";

/**
 * Sommario della home: quante Situazioni ci sono in ogni Area, nell'ordine di precedenza, più le News delle
 * ultime 24 ore. Ogni voce non vuota è un'ancora alla sua sezione nella stessa pagina; l'Urgente è evidenziata
 * quando contiene qualcosa, perché è da lì che si comincia. Sui telefoni è una sola riga: icona e numero,
 * scorrevole in orizzontale se i numeri sono grandi, senza mai far scorrere la pagina.
 */
export function SommarioAree({ conteggi, news }: { conteggi: Record<Area, number>; news: number }) {
  const t = useTranslations("home.sommario");
  const tc = useTranslations("comuni.aree");

  return (
    <nav aria-label={t("etichetta")}>
      {/* Il margine negativo porta lo scorrimento fino ai bordi dello schermo; il padding lascia spazio all'anello del focus. */}
      <ul className="flex gap-2 max-sm:-mx-4 max-sm:-my-1 max-sm:overflow-x-auto max-sm:px-4 max-sm:py-1 max-sm:[scrollbar-width:none] sm:flex-wrap">
        {AREE.map((area) => {
          const numero = conteggi[area];
          const contenuto = (
            <>
              <IconaArea area={area} className={numero === 0 ? "opacity-50 grayscale" : undefined} />
              <span className="font-semibold tabular-nums">{numero}</span>
              <span className={CLASSI_NOME}>{tc(area)}</span>
            </>
          );
          return (
            <li key={area} className="shrink-0">
              {numero === 0 ? (
                <span className={cn(CLASSI_CHIP, CLASSI_VUOTO)}>{contenuto}</span>
              ) : (
                <a
                  href={`#area-${area}`}
                  className={cn(CLASSI_CHIP, area === "urgente" ? "border-urgent/40 bg-urgent-soft text-urgent transition-colors hover:border-urgent" : CLASSI_LINK)}
                >
                  {contenuto}
                </a>
              )}
            </li>
          );
        })}
        <li className="shrink-0">
          {news === 0 ? (
            <span className={cn(CLASSI_CHIP, CLASSI_VUOTO)}>
              <Newspaper className="size-4 shrink-0 opacity-50" aria-hidden />
              <span className="font-semibold tabular-nums">0</span>
              <span className={CLASSI_NOME}>{t("news")}</span>
            </span>
          ) : (
            <a href="#riepilogo-news-titolo" className={cn(CLASSI_CHIP, CLASSI_LINK)}>
              <Newspaper className="size-4 shrink-0 text-text-muted" aria-hidden />
              <span className="font-semibold tabular-nums">{news}</span>
              <span className={CLASSI_NOME}>{t("news")}</span>
            </a>
          )}
        </li>
      </ul>
    </nav>
  );
}
