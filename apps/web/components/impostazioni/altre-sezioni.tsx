import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { FUNZIONI_AI } from "@ec/core/dominio";
import { CLASSE_LINK_AZIONE } from "@/components/ui/collegamento";
import { cn } from "@/components/ui/cn";
import { AREA_TOCCO } from "./classi";
import { EliminaAccount } from "./elimina-account";
import { ModuloRianalisi } from "./rianalisi";
import { Blocco, Gruppo, Sezione } from "./sezione";
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

/**
 * Gruppo `#privacy`: informativa accettata con il link al testo completo e, in fondo, l'eliminazione
 * dell'account (`#account`) con il comando discreto e la conferma esplicita in due passaggi.
 */
export function GruppoPrivacy({ consenso }: { consenso: { versione: string; accettato: boolean } }) {
  const t = useTranslations("impostazioni");
  return (
    <Gruppo id="privacy" titolo={t("gruppi.privacy")}>
      <Blocco className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <p className="flex min-w-0 flex-1 items-start gap-2">
          {consenso.accettato ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent-strong" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-urgent" aria-hidden />
          )}
          <span>
            {consenso.accettato ? t("privacy.accettata", { versione: consenso.versione }) : t("privacy.nonAccettata", { versione: consenso.versione })}
          </span>
        </p>
        <span className="flex flex-wrap gap-4 pl-6 sm:pl-0">
          <Link href="/privacy" className={cn(CLASSE_LINK_AZIONE, AREA_TOCCO)}>
            {t("privacy.leggi")}
          </Link>
          {consenso.accettato ? null : (
            <Link href="/onboarding" className={cn(CLASSE_LINK_AZIONE, AREA_TOCCO)}>
              {t("privacy.accetta")}
            </Link>
          )}
        </span>
      </Blocco>
      <Blocco id="account" className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <EliminaAccount punti={[t("account.analisi"), t("account.caselle"), t("account.dati"), t("account.backup"), t("account.uscita")]} />
      </Blocco>
    </Gruppo>
  );
}
