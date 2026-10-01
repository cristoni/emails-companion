import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { EvidenzaDto } from "@ec/applicazione";
import { CLASSE_LINK } from "@/components/ui/collegamento";
import { TestoSemplice } from "./testo-semplice";

/**
 * Evidenze di un'affermazione dell'AI: ogni citazione porta all'email da cui deriva e dice se è stata
 * trovata alla lettera nel testo, così ogni affermazione resta verificabile.
 */
export function ElencoEvidenze({
  evidenze,
  className,
  emailCorrente,
}: {
  evidenze: readonly EvidenzaDto[];
  className?: string;
  /** Sulla pagina di un'email, le citazioni tratte da quella email portano al suo testo invece di ricaricare la pagina. */
  emailCorrente?: string;
}) {
  const t = useTranslations("comuni.fonte");
  if (evidenze.length === 0) return null;
  return (
    <ul className={className ?? "space-y-2"} aria-label={t("evidenza")}>
      {evidenze.map((e, i) => (
        <li key={`${e.emailId}-${i}`} className="border-l-2 border-border-strong py-0.5 pl-3 text-sm">
          <TestoSemplice come="blockquote" testo={`“${e.citazione}”`} className="text-text" />
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-text-muted">
            <span className="inline-flex items-center gap-1">
              {e.verificata ? <CheckCircle2 className="size-3.5 text-accent-strong" aria-hidden /> : <AlertTriangle className="size-3.5 text-urgent" aria-hidden />}
              {t(e.verificata ? "verificata" : "nonVerificata")}
            </span>
            <Link href={e.emailId === emailCorrente ? `/mail/${e.emailId}#testo` : `/mail/${e.emailId}`} className={CLASSE_LINK}>
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
    <Link href={`/mail/${emailId}`} title={title} className={className ?? CLASSE_LINK}>
      {children ?? t("apri")}
    </Link>
  );
}

/** Link all'email nel provider (per esempio Gmail), in una nuova scheda e senza referrer. */
export function LinkProvider({ href, children, className }: { href: string | null; children?: React.ReactNode; className?: string }) {
  const t = useTranslations("comuni.fonte");
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className ?? CLASSE_LINK}>
      {children ?? t("apriNelProvider")}
    </a>
  );
}
