import { useTranslations } from "next-intl";
import { cn } from "@/components/ui/cn";

/**
 * Gruppi della pagina e loro sezioni, nello stesso ordine della pagina. Un gruppo con una sola sezione porta
 * direttamente alla sua ancora; gli altri portano alla prima sezione ed elencano le proprie.
 */
const GRUPPI = [
  {
    gruppo: "collegamenti",
    ancora: "mailboxes",
    voci: [
      ["mailboxes", "caselle"],
      ["openrouter", "chiave"],
    ],
  },
  {
    gruppo: "ai",
    ancora: "pause",
    voci: [
      ["pause", "pausa"],
      ["ai-context", "contesto"],
      ["models", "modelli"],
      ["reanalyse", "rianalisi"],
    ],
  },
  { gruppo: "preferenze", ancora: "preferences", voci: [] },
  {
    gruppo: "privacy",
    ancora: "privacy",
    voci: [
      ["privacy", "privacy"],
      ["account", "account"],
    ],
  },
] as const;

const CLASSE_VOCE = "block rounded-md px-2 py-1 transition-colors hover:bg-surface-muted hover:text-text";

/**
 * Indice "In questa pagina". Su schermi larghi è una colonna fissa con i gruppi e le loro sezioni; su quelli
 * stretti i soli quattro gruppi, che al massimo vanno su due righe.
 */
export function IndiceImpostazioni() {
  const t = useTranslations("impostazioni");
  return (
    <nav aria-label={t("indice.etichetta")} className="xl:sticky xl:top-8">
      <ul className="flex flex-wrap gap-2 xl:hidden">
        {GRUPPI.map(({ gruppo, ancora }) => (
          <li key={gruppo}>
            <a
              href={`#${ancora}`}
              className="inline-flex h-9 items-center rounded-full border border-border px-3.5 text-sm whitespace-nowrap text-text-muted transition-colors hover:border-border-strong hover:text-text"
            >
              {t(`gruppi.${gruppo}`)}
            </a>
          </li>
        ))}
      </ul>
      <ul className="hidden space-y-3 text-sm xl:block">
        {GRUPPI.map(({ gruppo, ancora, voci }) => (
          <li key={gruppo}>
            <a href={`#${ancora}`} className={cn(CLASSE_VOCE, "font-medium text-text")}>
              {t(`gruppi.${gruppo}`)}
            </a>
            {voci.length > 1 ? (
              <ul className="mt-0.5 space-y-0.5 border-l border-border pl-2 ml-2">
                {voci.map(([id, chiave]) => (
                  <li key={id}>
                    <a href={`#${id}`} className={cn(CLASSE_VOCE, "text-text-muted")}>
                      {t(`indice.${chiave}`)}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </nav>
  );
}
