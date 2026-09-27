import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, CalendarClock, Inbox } from "lucide-react";
import type { CardSituazione as CardSituazioneDto } from "@ec/applicazione";
import { testoCodice } from "@/components/comuni/codici";
import { DistintivoArea, DistintivoProposta } from "@/components/comuni/distintivi";
import { Istante } from "@/components/comuni/istante";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { Scheda } from "@/components/ui/scheda";
import { ProssimaAzione } from "./prossima-azione";

/**
 * Card di una Situazione nella sua Area principale. Il titolo è il link al dettaglio e ne estende l'area
 * cliccabile a tutta la card; da lì si raggiungono le email da cui la Situazione deriva.
 */
export function CardSituazione({ card }: { card: CardSituazioneDto }) {
  const t = useTranslations("home.card");
  const tc = useTranslations("comuni");

  return (
    <Scheda className="relative flex h-full flex-col gap-4 p-5 transition-colors focus-within:border-accent hover:border-border-strong">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {card.haProposte ? <DistintivoProposta /> : null}
          {card.indicatori.length > 0 ? (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-text-muted">{t("anche")}</span>
              {card.indicatori.map((area) => (
                <DistintivoArea key={area} area={area} />
              ))}
            </span>
          ) : null}
        </div>
        <h3 className="text-[15px] leading-snug">
          <Link
            href={`/situations/${card.id}`}
            className="rounded-sm after:absolute after:inset-0 after:rounded-[var(--radius-card)] after:content-[''] hover:text-accent-strong"
          >
            <TestoSemplice come="span" testo={card.titolo} lingua={card.lingua} />
          </Link>
        </h3>
        {card.motivoUrgenza ? (
          <p className="flex items-center gap-1.5 text-sm text-urgent">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            {testoCodice(tc, "motiviUrgenza", card.motivoUrgenza, "aree.urgente")}
          </p>
        ) : null}
      </div>

      <div className="space-y-1 border-t border-border pt-3 text-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{t("prossimaAzione")}</p>
        <ProssimaAzione azione={card.prossimaAzione} lingua={card.lingua} />
      </div>

      <dl className="mt-auto flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-text-muted">
        {card.scadenzaPiuVicina ? (
          <div className="inline-flex items-center gap-1">
            <dt className="inline-flex items-center gap-1">
              <CalendarClock className="size-3.5" aria-hidden />
              {t("scadenza")}
            </dt>
            <dd className="text-text">
              <Istante iso={card.scadenzaPiuVicina} stile="giorno" />
            </dd>
          </div>
        ) : null}
        {card.caselle.length > 0 ? (
          <div className="inline-flex min-w-0 items-center gap-1">
            <dt>
              <Inbox className="size-3.5" aria-hidden />
              <span className="sr-only">{t("caselle")}</span>
            </dt>
            <dd className="truncate font-mono">{card.caselle.join(", ")}</dd>
          </div>
        ) : null}
        <div className="inline-flex items-center gap-1">
          <dt>{t("ultimaAttivita")}</dt>
          <dd>
            <Istante iso={card.ultimaAttivita} stile="relativo" />
          </dd>
        </div>
      </dl>
    </Scheda>
  );
}
