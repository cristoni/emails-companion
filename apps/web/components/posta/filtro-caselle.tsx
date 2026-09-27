import Link from "next/link";
import { useTranslations } from "next-intl";
import type { CasellaPostaDto } from "@ec/applicazione";
import { cn } from "@/components/ui/cn";

const PILLOLA = "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors";

/** Filtro per Casella collegata: semplici link, funziona anche senza JavaScript e resta nell'URL. */
export function FiltroCaselle({ caselle, selezionata }: { caselle: readonly CasellaPostaDto[]; selezionata: string | null }) {
  const t = useTranslations("posta.filtro");
  const tStati = useTranslations("comuni.statiCasella");
  const voce = (attiva: boolean) =>
    cn(PILLOLA, attiva ? "border-accent/40 bg-accent-soft font-medium text-accent-strong" : "border-border text-text-muted hover:bg-surface-muted hover:text-text");

  return (
    <nav aria-label={t("etichetta")} className="mb-5">
      <ul className="flex flex-wrap gap-2">
        <li>
          <Link href="/mail" aria-current={selezionata === null ? "page" : undefined} className={voce(selezionata === null)}>
            {t("tutte")}
          </Link>
        </li>
        {caselle.map((c) => (
          <li key={c.id} className="min-w-0 max-w-full">
            <Link
              href={`/mail?${new URLSearchParams({ casella: c.id })}`}
              aria-current={selezionata === c.id ? "page" : undefined}
              className={cn(voce(selezionata === c.id), "min-w-0 max-w-full")}
            >
              <span className="min-w-0 truncate font-mono text-[13px]">{c.indirizzo}</span>
              {c.stato !== "collegata" ? <span className="shrink-0 text-xs text-urgent">· {tStati(c.stato)}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
