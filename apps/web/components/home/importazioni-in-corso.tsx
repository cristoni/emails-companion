import Link from "next/link";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import type { ImportazioneDto } from "@ec/applicazione";
import { testoCodice } from "@/components/comuni/codici";
import { Scheda } from "@/components/ui/scheda";
import { cn } from "@/components/ui/cn";

/**
 * Avanzamento dell'Importazione iniziale per casella. La fase `stimata` non compare qui: la sua conferma
 * è tra gli avvisi, con numero di email e costo stimato.
 */
export function ImportazioniInCorso({ importazioni }: { importazioni: readonly ImportazioneDto[] }) {
  const t = useTranslations("home.importazioni");
  const visibili = importazioni.filter((i) => i.fase !== "stimata");
  if (visibili.length === 0) return null;

  return (
    <section aria-labelledby="importazioni-titolo">
      <Scheda className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
          <h2 id="importazioni-titolo" className="flex items-center gap-2 text-sm">
            {visibili.some((i) => i.fase !== "errore") ? <Loader2 className="size-4 animate-spin text-accent motion-reduce:animate-none" aria-hidden /> : null}
            {t("titolo")}
          </h2>
          <p className="text-text-muted">{t("siRiempie")}</p>
        </div>
        <ul className="space-y-3">
          {visibili.map((i) => (
            <VoceImportazione key={i.casellaId} importazione={i} />
          ))}
        </ul>
      </Scheda>
    </section>
  );
}

function VoceImportazione({ importazione: i }: { importazione: ImportazioneDto }) {
  const t = useTranslations("home.importazioni");
  const tc = useTranslations("comuni");
  const totale = i.avanzamento?.totale ?? 0;
  const acquisite = Math.min(i.avanzamento?.acquisite ?? 0, totale);
  const percentuale = totale > 0 ? Math.round((acquisite / totale) * 100) : 0;
  const errore = i.fase === "errore";
  // Fase in breve: il titolo della sezione dice già "Importazione iniziale".
  const fase = t.has(`fasi.${i.fase}`) ? t(`fasi.${i.fase}`) : testoCodice(tc, "fasiImportazione", i.fase);

  return (
    <li className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
        <span className="min-w-0 truncate">{i.indirizzo}</span>
        <span className={cn("text-xs", errore ? "font-medium text-danger" : "text-text-muted")}>
          {totale > 0 ? <span className="tabular-nums">{t("avanzamento", { acquisite, totale })} · </span> : null}
          {fase}
        </span>
      </div>
      {totale > 0 ? (
        <div
          role="progressbar"
          aria-label={t("avanzamentoEtichetta", { indirizzo: i.indirizzo })}
          aria-valuemin={0}
          aria-valuemax={totale}
          aria-valuenow={acquisite}
          aria-valuetext={t("avanzamento", { acquisite, totale })}
          className="h-1.5 overflow-hidden rounded-full bg-surface-muted ring-1 ring-border ring-inset"
        >
          <div className={cn("h-full rounded-full transition-[width]", errore ? "bg-danger" : "bg-accent")} style={{ width: `${percentuale}%` }} />
        </div>
      ) : i.fase === "in_corso" || i.fase === "confermata" ? (
        <p className="text-xs text-text-muted">{t("inPreparazione")}</p>
      ) : null}
      {errore ? (
        <Link href="/status" className="inline-block text-sm font-medium text-accent-strong underline-offset-4 hover:underline">
          {t("stato")}
        </Link>
      ) : null}
    </li>
  );
}
