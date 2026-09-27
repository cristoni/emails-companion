import { useTranslations } from "next-intl";
import { Quote, Sparkles } from "lucide-react";
import type { Area, Base } from "@ec/core/dominio";
import { Distintivo, type TonoDistintivo } from "@/components/ui/distintivo";

/** Rilevato / Dedotto: il significato è nel testo e nell'icona, non solo nel colore (§13.1). */
export function DistintivoBase({ base }: { base: Base }) {
  const t = useTranslations("comuni.base");
  return (
    <span title={t(base === "rilevato" ? "rilevatoAiuto" : "dedottoAiuto")}>
      <Distintivo
        tono={base === "rilevato" ? "accento" : "neutro"}
        icona={base === "rilevato" ? <Quote className="size-3" aria-hidden /> : <Sparkles className="size-3" aria-hidden />}
      >
        {t(base)}
      </Distintivo>
    </span>
  );
}

/** Badge "Proposta AI" per ogni elemento o collegamento non ancora confermato dall'utente. */
export function DistintivoProposta() {
  const t = useTranslations("comuni");
  return (
    <span title={t("propostaAiuto")}>
      <Distintivo tono="proposta" icona={<Sparkles className="size-3" aria-hidden />}>
        {t("proposta")}
      </Distintivo>
    </span>
  );
}

const TONO_AREA: Record<Area, TonoDistintivo> = { urgente: "urgente", risposte_arrivate: "risposta", da_fare: "accento", in_attesa: "neutro" };

export function DistintivoArea({ area }: { area: Area }) {
  const t = useTranslations("comuni.aree");
  return <Distintivo tono={TONO_AREA[area]}>{t(area)}</Distintivo>;
}
