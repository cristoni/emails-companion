import { useFormatter, useTranslations } from "next-intl";
import { AlertTriangle, ArrowRight, Clock, MailQuestion, Reply } from "lucide-react";
import type { ProssimaAzioneDto } from "@ec/applicazione";
import { testoCodice } from "@/components/comuni/codici";
import { LinkEmail } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { Distintivo } from "@/components/ui/distintivo";

const TONO_VALUTAZIONE = { completa: "accento", parziale: "urgente", non_pertinente: "neutro" } as const;
const TONO_PRIORITA = { alta: "urgente", media: "neutro", bassa: "neutro" } as const;

/**
 * Prossima azione di una Situazione, resa per ogni variante. I testi prodotti dall'AI (descrizioni e oggetti
 * delle Attese) sono testo semplice nella lingua della Situazione. I link interni alla card sono sopra il
 * link che la copre (`relative z-10`), così restano cliccabili.
 */
export function ProssimaAzione({ azione, lingua }: { azione: ProssimaAzioneDto; lingua: string }) {
  const t = useTranslations("home.prossimaAzione");
  const tCard = useTranslations("home.card");
  const tc = useTranslations("comuni");
  const formato = useFormatter();
  const elenco = (destinatari: readonly string[]) => formato.list(destinatari, { type: "conjunction" });

  switch (azione.tipo) {
    case "rivedi_risposta":
      return (
        <div className="space-y-1.5">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <Reply className="size-4 text-reply" aria-hidden />
            {t("rivediRisposta")}
            <Distintivo tono={TONO_VALUTAZIONE[azione.valutazione]}>{testoCodice(tc, "valutazioni", azione.valutazione)}</Distintivo>
          </p>
          <p className="text-text-muted">
            <span>{t("richiesta")} </span>
            <TestoSemplice come="span" testo={azione.oggettoAttesa} lingua={lingua} className="text-text" />
          </p>
          <LinkEmail emailId={azione.emailId} className="relative z-10 inline-flex items-center gap-1 text-accent-strong underline-offset-4 hover:underline">
            {t("apriRisposta")}
            <ArrowRight className="size-3.5" aria-hidden />
          </LinkEmail>
        </div>
      );
    case "attivita":
      return (
        <div className="space-y-1.5">
          <TestoSemplice testo={azione.descrizione} lingua={lingua} className="text-text" />
          <p className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <Distintivo tono={TONO_PRIORITA[azione.priorita]}>{testoCodice(tc, "priorita", azione.priorita)}</Distintivo>
            {azione.scadenza ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden />
                {tCard("scadenza")} <Istante iso={azione.scadenza} stile="data" />
              </span>
            ) : null}
          </p>
        </div>
      );
    case "sollecito":
      return (
        <div className="space-y-1.5">
          <p className="flex items-center gap-2 font-medium text-urgent">
            <MailQuestion className="size-4" aria-hidden />
            {t("sollecito")}
          </p>
          <TestoSemplice testo={azione.oggetto} lingua={lingua} className="text-text" />
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
            {azione.destinatari.length > 0 ? <span className="break-words">{t("sollecitoA", { destinatari: elenco(azione.destinatari) })}</span> : null}
            {azione.dataAttesa ? (
              <span>
                {t("attesaEntro")} <Istante iso={azione.dataAttesa} stile="data" />
              </span>
            ) : null}
          </p>
        </div>
      );
    case "attendi":
      return (
        <div className="space-y-1.5">
          <p className="flex items-center gap-2 font-medium">
            <Clock className="size-4 text-text-muted" aria-hidden />
            <span className="break-words">
              {azione.destinatari.length > 0 ? t("attendi", { destinatari: elenco(azione.destinatari) }) : t("attendiSenzaDestinatari")}
            </span>
          </p>
          <TestoSemplice testo={azione.oggetto} lingua={lingua} className="text-text" />
          {azione.dataAttesa ? (
            <p className="text-xs text-text-muted">
              {t("attesaEntro")} <Istante iso={azione.dataAttesa} stile="data" />
            </p>
          ) : null}
        </div>
      );
    case "gestisci_urgenza":
      return (
        <p className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-urgent" aria-hidden />
          {t("gestisciUrgenza")}
        </p>
      );
    case "nessuna":
      return <p className="text-text-muted">{t("nessuna")}</p>;
  }
}
