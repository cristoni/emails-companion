import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check, Lock } from "lucide-react";
import { cn } from "@/components/ui/cn";

const PASSI = ["modifica", "conferma"] as const;

/**
 * I due passi verso l'invio ("1 Modifica · 2 Rivedi e invia") con il promemoria che nulla parte senza
 * conferma. Mostrati sull'editor di una bozza ancora modificabile e sulla schermata di conferma, dove il passo
 * già fatto ("Modifica", con `hrefModifica`) riporta all'editor.
 */
export function PassiBozza({ attivo, hrefModifica }: { attivo: (typeof PASSI)[number]; hrefModifica?: string }) {
  const t = useTranslations("bozze.passi");
  const indice = PASSI.indexOf(attivo);
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      <ol aria-label={t("etichetta")} className="flex items-center gap-2">
        {PASSI.map((p, i) => {
          const corrente = i === indice;
          const fatto = i < indice;
          const contenuto = (
            <>
              <span
                aria-hidden
                className={cn(
                  "grid size-5 place-items-center rounded-full text-[11px] font-semibold",
                  corrente ? "bg-accent-strong text-accent-contrast" : "border border-border-strong",
                  fatto && hrefModifica ? "border-accent-strong/50" : null,
                )}
              >
                {fatto ? <Check className="size-3" /> : i + 1}
              </span>
              {t(p)}
              {/* L'icona di spunta è decorativa: lo stato del passo va detto anche a chi usa un lettore di schermo. */}
              {fatto ? <span className="sr-only"> ({t("fatto")})</span> : null}
            </>
          );
          return (
            <li key={p} aria-current={corrente ? "step" : undefined} className={cn("inline-flex items-center gap-1.5", corrente ? "font-medium text-text" : "text-text-muted")}>
              {i > 0 ? <span aria-hidden className="mr-0.5 h-px w-5 bg-border-strong" /> : null}
              {fatto && p === "modifica" && hrefModifica ? (
                <Link
                  href={hrefModifica}
                  className="-mx-1 inline-flex min-h-9 items-center gap-1.5 rounded-md px-1 text-accent-strong underline-offset-4 hover:underline sm:min-h-8"
                >
                  {contenuto}
                </Link>
              ) : (
                contenuto
              )}
            </li>
          );
        })}
      </ol>
      <p className="inline-flex items-center gap-1.5 text-text-muted">
        <Lock className="size-3.5 shrink-0" aria-hidden />
        {t("blocco")}
      </p>
    </div>
  );
}
