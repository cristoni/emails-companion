import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { FUNZIONI_AI } from "@ec/core/dominio";
import { EliminaAccount } from "./elimina-account";
import { ModuloRianalisi } from "./rianalisi";
import { Sezione } from "./sezione";
import { testiFunzione } from "./sezione-modelli";

/** Sezione `#reanalyse`: stima e conferma esplicita della rianalisi degli elementi aperti o degli ultimi N giorni. */
export function SezioneRianalisi({ pausaAttiva }: { pausaAttiva: boolean }) {
  const t = useTranslations("impostazioni");
  const tc = useTranslations("comuni");
  const nomiFunzioni: Record<string, string> = { altro: t("consumo.funzioneSconosciuta") };
  for (const f of FUNZIONI_AI) nomiFunzioni[f] = testiFunzione(t, tc, f).nome;
  return (
    <Sezione id="reanalyse" titolo={t("rianalisi.titolo")} descrizione={t("rianalisi.descrizione")}>
      <ModuloRianalisi pausaAttiva={pausaAttiva} nomiFunzioni={nomiFunzioni} />
    </Sezione>
  );
}

/** Sezione `#privacy`: versione dell'informativa accettata e link all'informativa completa. */
export function SezionePrivacy({ consenso }: { consenso: { versione: string; accettato: boolean } }) {
  const t = useTranslations("impostazioni");
  return (
    <Sezione id="privacy" titolo={t("privacy.titolo")} descrizione={t("privacy.descrizione")}>
      <p className="flex items-start gap-2">
        {consenso.accettato ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent-strong" aria-hidden />
        ) : (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-urgent" aria-hidden />
        )}
        <span>{consenso.accettato ? t("privacy.accettata", { versione: consenso.versione }) : t("privacy.nonAccettata", { versione: consenso.versione })}</span>
      </p>
      <div className="flex flex-wrap gap-4">
        <Link href="/privacy" className="text-accent-strong underline-offset-4 hover:underline">
          {t("privacy.leggi")}
        </Link>
        {consenso.accettato ? null : (
          <Link href="/onboarding" className="text-accent-strong underline-offset-4 hover:underline">
            {t("privacy.accetta")}
          </Link>
        )}
      </div>
    </Sezione>
  );
}

/** Sezione `#account`: eliminazione dell'account con conferma esplicita in due passaggi. */
export function SezioneAccount() {
  const t = useTranslations("impostazioni");
  return (
    <Sezione id="account" titolo={t("account.titolo")} descrizione={t("account.descrizione")}>
      <EliminaAccount punti={[t("account.analisi"), t("account.caselle"), t("account.dati"), t("account.backup"), t("account.uscita")]} />
    </Sezione>
  );
}

const VOCI_INDICE = [
  ["mailboxes", "caselle"],
  ["openrouter", "chiave"],
  ["models", "modelli"],
  ["ai-context", "contesto"],
  ["preferences", "preferenze"],
  ["usage", "consumo"],
  ["reanalyse", "rianalisi"],
  ["privacy", "privacy"],
  ["account", "account"],
] as const;

/** Indice "In questa pagina" in stile documentazione: laterale e fisso su schermi larghi, a pillole su quelli stretti. */
export function IndiceImpostazioni() {
  const t = useTranslations("impostazioni.indice");
  return (
    <nav aria-label={t("etichetta")} className="lg:sticky lg:top-6">
      <p className="mb-2 hidden text-xs font-medium uppercase tracking-wide text-text-muted lg:block">{t("etichetta")}</p>
      <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-0.5">
        {VOCI_INDICE.map(([ancora, chiave]) => (
          <li key={ancora}>
            <a
              href={`#${ancora}`}
              className="inline-flex rounded-full border border-border px-3 py-1 text-xs text-text-muted transition-colors hover:border-accent hover:text-text lg:rounded-md lg:border-transparent lg:px-2 lg:py-1 lg:text-sm lg:hover:border-transparent lg:hover:bg-surface-muted"
            >
              {t(chiave)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
