import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { EvidenzaDto } from "@ec/applicazione";
import { cn } from "@/components/ui/cn";
import { AREA_TOCCO, CLASSE_LINK } from "@/components/ui/collegamento";
import { TestoSemplice } from "./testo-semplice";

/** Classe predefinita dei link alle email: link nel testo con un'area di tocco di almeno 36px. */
const CLASSE_LINK_EMAIL = cn(CLASSE_LINK, AREA_TOCCO);

/**
 * Evidenze di un'affermazione dell'AI: ogni citazione porta all'email da cui deriva, così ogni affermazione
 * resta verificabile. La citazione trovata alla lettera nel testo è il caso normale e ha solo un'icona (con
 * il testo nel `title` e per i lettori di schermo); quella non trovata, l'eccezione da guardare, è scritta.
 */
export function ElencoEvidenze({
  evidenze,
  className,
  emailCorrente,
  hrefEmailCorrente,
}: {
  evidenze: readonly EvidenzaDto[];
  className?: string;
  /**
   * Sulla pagina di un'email, le citazioni tratte da quella email portano al suo testo invece di ricaricare la
   * pagina: una citazione verificata alla sua evidenziazione (`#citazione-<indice>`), le altre al testo.
   */
  emailCorrente?: string;
  /** Indirizzo del testo dell'email corrente, con i parametri della pagina da conservare (per esempio una stima). */
  hrefEmailCorrente?: string;
}) {
  const t = useTranslations("comuni.fonte");
  if (evidenze.length === 0) return null;
  return (
    <ul className={className ?? "space-y-2"} aria-label={t("evidenza")}>
      {evidenze.map((e, i) => (
        <li key={`${e.emailId}-${i}`} className="border-l-2 border-border-strong py-0.5 pl-3 text-sm">
          <TestoSemplice come="blockquote" testo={`“${e.citazione}”`} className="text-text" />
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-text-muted">
            {e.verificata ? (
              <span className="inline-flex items-center" title={t("verificata")}>
                <CheckCircle2 className="size-3.5 text-accent-strong" aria-hidden />
                <span className="sr-only">{t("verificata")}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <AlertTriangle className="size-3.5 text-urgent" aria-hidden />
                {t("nonVerificata")}
              </span>
            )}
            <Link
              href={
                e.emailId === emailCorrente
                  ? `${hrefEmailCorrente ?? `/mail/${e.emailId}`}#${e.verificata ? `citazione-${i}` : "testo"}`
                  : `/mail/${e.emailId}`
              }
              className={CLASSE_LINK_EMAIL}
            >
              {t(e.emailId === emailCorrente ? "mostraNelTesto" : "apri")}
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Link a un'email della posta sincronizzata, dove si trovano l'originale e il link al provider. */
export function LinkEmail({ emailId, children, className, title }: { emailId: string; children?: React.ReactNode; className?: string; title?: string }) {
  const t = useTranslations("comuni.fonte");
  return (
    <Link href={`/mail/${emailId}`} title={title} className={className ?? CLASSE_LINK_EMAIL}>
      {children ?? t("apri")}
    </Link>
  );
}

/** Link all'email nel provider (per esempio Gmail), in una nuova scheda e senza referrer. */
export function LinkProvider({ href, children, className }: { href: string | null; children?: React.ReactNode; className?: string }) {
  const t = useTranslations("comuni.fonte");
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className ?? CLASSE_LINK_EMAIL}>
      {children ?? t("apriNelProvider")}
    </a>
  );
}
