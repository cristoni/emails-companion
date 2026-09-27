import { useTranslations } from "next-intl";
import type { Area } from "@ec/core/dominio";
import type { CardSituazione as CardSituazioneDto } from "@ec/applicazione";
import { StatoVuoto } from "@/components/ui/pagina";
import { cn } from "@/components/ui/cn";
import { CardSituazione } from "./card-situazione";

const PUNTO_AREA: Record<Area, string> = {
  urgente: "bg-urgent",
  risposte_arrivate: "bg-reply",
  da_fare: "bg-accent",
  in_attesa: "bg-text-muted",
};

/** Un'Area della home: titolo, conteggio, descrizione e una card per Situazione, oppure lo stato vuoto. */
export function SezioneArea({ area, card }: { area: Area; card: readonly CardSituazioneDto[] }) {
  const t = useTranslations("home");
  const tc = useTranslations("comuni.aree");
  const idTitolo = `area-${area}`;

  return (
    <section aria-labelledby={idTitolo} className="space-y-4">
      <header className="space-y-1">
        <h2 id={idTitolo} className="flex items-center gap-2 text-lg">
          <span aria-hidden className={cn("size-2 rounded-full", PUNTO_AREA[area])} />
          {tc(area)}
          <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium tabular-nums text-text-muted">
            <span aria-hidden>{card.length}</span>
            <span className="sr-only">{t("conteggio", { numero: card.length })}</span>
          </span>
        </h2>
        <p className="text-sm text-text-muted">{t(`aree.${area}.descrizione`)}</p>
      </header>
      {card.length === 0 ? (
        <StatoVuoto titolo={t(`aree.${area}.vuoto`)} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {card.map((c) => (
            <li key={c.id} className="min-w-0">
              <CardSituazione card={c} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
