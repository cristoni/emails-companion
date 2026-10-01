import { useTranslations } from "next-intl";
import { AlertTriangle, Clock, ListTodo, Quote, Reply, Sparkles } from "lucide-react";
import { cn } from "@/components/ui/cn";
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

/**
 * Badge "Proposta AI" per ogni elemento o collegamento non ancora confermato dall'utente. `discreto` è la
 * forma senza pillola, per gli elenchi in cui il badge non deve prevalere sul titolo; la spiegazione resta
 * nel `title` e per i lettori di schermo.
 */
export function DistintivoProposta({ discreto = false }: { discreto?: boolean }) {
  const t = useTranslations("comuni");
  if (discreto) {
    return (
      <span title={t("propostaAiuto")} className="inline-flex items-center gap-1 whitespace-nowrap text-suggestion">
        <Sparkles className="size-3.5" aria-hidden />
        {t("proposta")}
        <span className="sr-only">: {t("propostaAiuto")}</span>
      </span>
    );
  }
  return (
    <span title={t("propostaAiuto")}>
      <Distintivo tono="proposta" icona={<Sparkles className="size-3" aria-hidden />}>
        {t("proposta")}
      </Distintivo>
    </span>
  );
}

const ICONA_AREA = { urgente: AlertTriangle, risposte_arrivate: Reply, da_fare: ListTodo, in_attesa: Clock } as const;
const COLORE_AREA: Record<Area, string> = { urgente: "text-urgent", risposte_arrivate: "text-reply", da_fare: "text-accent", in_attesa: "text-text-muted" };

/** Icona di un'Area, la stessa ovunque (titoli, sommario, indicatori); decorativa: il nome è sempre nel testo. */
export function IconaArea({ area, className }: { area: Area; className?: string }) {
  const Icona = ICONA_AREA[area];
  return <Icona className={cn("size-4 shrink-0", COLORE_AREA[area], className)} aria-hidden />;
}

const TONO_AREA: Record<Area, TonoDistintivo> = { urgente: "urgente", risposte_arrivate: "risposta", da_fare: "accento", in_attesa: "neutro" };

export function DistintivoArea({ area }: { area: Area }) {
  const t = useTranslations("comuni.aree");
  return <Distintivo tono={TONO_AREA[area]}>{t(area)}</Distintivo>;
}
