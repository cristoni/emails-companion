import { useTranslations } from "next-intl";
import type { Area } from "@ec/core/dominio";
import type { CardSituazione as CardSituazioneDto } from "@ec/applicazione";
import { IconaArea } from "@/components/comuni/distintivi";
import { Espandibile } from "@/components/ui/espandibile";
import { CardSituazione } from "./card-situazione";

/** Card visibili prima di "Mostra altre"; si raccoglie solo quando le nascoste sarebbero almeno due. */
const VISIBILI = 5;

/**
 * Un'Area della home: titolo con icona, poi le card in ordine di priorità in una sola colonna. Il conteggio
 * resta solo per i lettori di schermo: a vista lo dicono le card stesse e, sulle pagine lunghe, il sommario.
 * Le aree lunghe (non l'Urgente) mostrano le prime card e raccolgono le altre in un `Espandibile`, che le
 * tiene nella pagina. La home non mostra le aree vuote.
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
        <span className="sr-only">: {t("conteggio", { numero: card.length })}</span>
      </h2>
      {elenco(visibili)}
      {altre.length > 0 ? (
        <Espandibile
          className="font-medium"
          titolo={
            <>
              <span className="group-open/espandibile:hidden">{t("mostraAltre", { numero: altre.length })}</span>
              <span className="hidden group-open/espandibile:inline">{t("mostraMeno")}</span>
            </>
          }
        >
          {elenco(altre)}
        </Espandibile>
      ) : null}
    </section>
  );
}
