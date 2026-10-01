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

/** Stati dell'analisi che meritano attenzione: gli altri ("analizzata", "non prevista") non si segnalano. */
export const ANALISI_DA_SEGNALARE: readonly StatoAnalisiEmail[] = ["da_analizzare", "in_pausa", "errore"];

export function DistintivoStatoAnalisi({ stato }: { stato: StatoAnalisiEmail }) {
  const t = useTranslations("comuni.statiAnalisi");
  const { tono, icona: Icona } = ANALISI[stato];
  return (
    <Distintivo tono={tono} icona={<Icona className="size-3" aria-hidden />}>
      {t(stato)}
    </Distintivo>
  );
}

/** Stati di una Funzione AI da segnalare: "eseguita" e "non necessaria" sono normali e non hanno distintivo. */
export type StatoFunzioneDaSegnalare = Exclude<StatoFunzioneEmail, "eseguita" | "non_necessaria">;

export function funzioneDaSegnalare(stato: StatoFunzioneEmail): stato is StatoFunzioneDaSegnalare {
  return stato !== "eseguita" && stato !== "non_necessaria";
}

const FUNZIONE: Record<StatoFunzioneDaSegnalare, { tono: TonoDistintivo; icona: LucideIcon }> = {
  da_eseguire: { tono: "neutro", icona: Clock },
  in_pausa: { tono: "urgente", icona: CirclePause },
  errore: { tono: "pericolo", icona: TriangleAlert },
};

export function DistintivoStatoFunzione({ stato }: { stato: StatoFunzioneDaSegnalare }) {
  const t = useTranslations("comuni.statiFunzione");
  const { tono, icona: Icona } = FUNZIONE[stato];
  return (
    <Distintivo tono={tono} icona={<Icona className="size-3" aria-hidden />}>
      {t(stato)}
    </Distintivo>
  );
}

/** Direzione di un'email non ricevuta (inviata o interna), come icona accanto ai destinatari: decorativa. */
export function IconaDirezione({ direzione, className }: { direzione: Direzione; className?: string }) {
  const Icona = direzione === "interna" ? Repeat : direzione === "uscita" ? ArrowUpRight : ArrowDownLeft;
  return <Icona className={className} aria-hidden />;
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

