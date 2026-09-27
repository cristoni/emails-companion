import { useTranslations } from "next-intl";
import { ArrowDownLeft, ArrowUpRight, CircleCheck, CircleMinus, CirclePause, Clock, Repeat, TriangleAlert, type LucideIcon } from "lucide-react";
import type { StatoAnalisiEmail } from "@ec/applicazione";
import type { Categoria, Direzione, StatoFunzioneEmail } from "@ec/core/dominio";
import { Distintivo, type TonoDistintivo } from "@/components/ui/distintivo";

/** Stato dell'analisi di un'email nell'elenco: testo e icona, mai solo il colore. */
const ANALISI: Record<StatoAnalisiEmail, { tono: TonoDistintivo; icona: LucideIcon }> = {
  da_analizzare: { tono: "neutro", icona: Clock },
  in_pausa: { tono: "urgente", icona: CirclePause },
  errore: { tono: "pericolo", icona: TriangleAlert },
  analizzata: { tono: "neutro", icona: CircleCheck },
  non_prevista: { tono: "neutro", icona: CircleMinus },
};

export function DistintivoStatoAnalisi({ stato }: { stato: StatoAnalisiEmail }) {
  const t = useTranslations("comuni.statiAnalisi");
  const { tono, icona: Icona } = ANALISI[stato];
  return (
    <Distintivo tono={tono} icona={<Icona className="size-3" aria-hidden />}>
      {t(stato)}
    </Distintivo>
  );
}

const FUNZIONE: Record<StatoFunzioneEmail, { tono: TonoDistintivo; icona: LucideIcon }> = {
  da_eseguire: { tono: "neutro", icona: Clock },
  in_pausa: { tono: "urgente", icona: CirclePause },
  eseguita: { tono: "accento", icona: CircleCheck },
  non_necessaria: { tono: "neutro", icona: CircleMinus },
  errore: { tono: "pericolo", icona: TriangleAlert },
};

export function DistintivoStatoFunzione({ stato }: { stato: StatoFunzioneEmail }) {
  const t = useTranslations("comuni.statiFunzione");
  const { tono, icona: Icona } = FUNZIONE[stato];
  return (
    <Distintivo tono={tono} icona={<Icona className="size-3" aria-hidden />}>
      {t(stato)}
    </Distintivo>
  );
}

const DIREZIONE: Record<Direzione, LucideIcon> = { entrata: ArrowDownLeft, uscita: ArrowUpRight, interna: Repeat };

export function DistintivoDirezione({ direzione }: { direzione: Direzione }) {
  const t = useTranslations("comuni.direzioni");
  const Icona = DIREZIONE[direzione];
  return (
    <Distintivo tono="neutro" icona={<Icona className="size-3" aria-hidden />}>
      {t(direzione)}
    </Distintivo>
  );
}

export function DistintivoCategoria({ categoria }: { categoria: Categoria }) {
  const t = useTranslations("comuni.categorie");
  return <Distintivo tono={categoria === "operativa" ? "accento" : "neutro"}>{t(categoria)}</Distintivo>;
}

export function DistintivoUrgente({ etichetta }: { etichetta: string }) {
  return (
    <Distintivo tono="urgente" icona={<TriangleAlert className="size-3" aria-hidden />}>
      {etichetta}
    </Distintivo>
  );
}
