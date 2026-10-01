import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import type { Area } from "@ec/core/dominio";
import type { CardSituazione as CardSituazioneDto } from "@ec/applicazione";
import { IconaArea } from "@/components/comuni/distintivi";
import { CardSituazione } from "./card-situazione";

/** Card visibili prima di "Mostra altre"; si raccoglie solo quando le nascoste sarebbero almeno due. */
const VISIBILI = 5;

/**
 * Un'Area della home: titolo con icona e conteggio, poi le card in ordine di priorità in una sola colonna.
 * Le aree lunghe (non l'Urgente) mostrano le prime card e raccolgono le altre in un `<details>`, che le tiene
 * nella pagina. La home non mostra le aree vuote: il sommario in alto ne riporta già lo zero.
 */
export function SezioneArea({ area, card, mostraCaselle }: { area: Area; card: readonly CardSituazioneDto[]; mostraCaselle: boolean }) {
  const t = useTranslations("home");
  const tc = useTranslations("comuni.aree");
  const idTitolo = `area-${area}`;
  const raccogli = area !== "urgente" && card.length > VISIBILI + 1;
  const visibili = raccogli ? card.slice(0, VISIBILI) : card;
  const altre = raccogli ? card.slice(VISIBILI) : [];

  const elenco = (voci: readonly CardSituazioneDto[]) => (
    <ul className="space-y-3">
      {voci.map((c) => (
        <li key={c.id} className="min-w-0">
          <CardSituazione card={c} mostraCaselle={mostraCaselle} />
        </li>
      ))}
    </ul>
  );

  return (
    <section aria-labelledby={idTitolo} className="space-y-3">
      <h2 id={idTitolo} className="flex items-center gap-2 text-base">
        <IconaArea area={area} />
        {tc(area)}
        <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium tabular-nums text-text-muted">
          <span aria-hidden>{card.length}</span>
          <span className="sr-only">{t("conteggio", { numero: card.length })}</span>
        </span>
      </h2>
      {elenco(visibili)}
      {altre.length > 0 ? (
        <details className="group/altre">
          <summary className="-ml-2 inline-flex h-9 cursor-pointer list-none items-center gap-1 rounded-lg px-2 text-sm font-medium text-text-muted select-none hover:bg-surface-muted hover:text-text [&::-webkit-details-marker]:hidden">
            <ChevronDown className="size-4 transition-transform group-open/altre:rotate-180" aria-hidden />
            <span className="group-open/altre:hidden">{t("mostraAltre", { numero: altre.length })}</span>
            <span className="hidden group-open/altre:inline">{t("mostraMeno")}</span>
          </summary>
          <div className="mt-2">{elenco(altre)}</div>
        </details>
      ) : null}
    </section>
  );
}
