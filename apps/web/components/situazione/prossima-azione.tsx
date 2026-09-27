import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import type { ProssimaAzioneDto, VistaSituazioneDto } from "@ec/applicazione";
import { testoCodice } from "@/components/comuni/codici";
import { LinkEmail } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { Distintivo } from "@/components/ui/distintivo";
import { PulsanteProponiSollecito } from "@/components/bozze/pulsanti-proposta";
import { ANCORA_URGENZA } from "./intestazione";
import { ancora, linguaDi, type ContestoDettaglio } from "./comuni";

const collegamento = "inline-flex items-center gap-1 text-sm font-medium text-accent-strong underline-offset-4 hover:underline";

/** Prossima azione in evidenza: il passo successivo calcolato dagli elementi aperti della Situazione. */
export function ProssimaAzione({ vista, contesto }: { vista: VistaSituazioneDto; contesto: ContestoDettaglio }) {
  const t = useTranslations("situazione.prossima");
  return (
    <section aria-labelledby="prossima-titolo" className="relative overflow-hidden rounded-[var(--radius-card)] border border-accent/30 bg-accent-soft/60 px-5 py-4">
      <h2 id="prossima-titolo" className="text-xs font-semibold uppercase tracking-[0.08em] text-accent-strong">
        {t("titolo")}
      </h2>
      <div className="mt-2 space-y-2">
        <Contenuto azione={vista.prossimaAzione} vista={vista} contesto={contesto} />
      </div>
    </section>
  );
}

function Contenuto({ azione, vista, contesto }: { azione: ProssimaAzioneDto; vista: VistaSituazioneDto; contesto: ContestoDettaglio }) {
  const t = useTranslations("situazione.prossima");
  const tc = useTranslations("comuni");
  const linguaAttesa = (attesaId: string) => linguaDi(contesto, vista.attese.find((a) => a.id === attesaId)?.emailRichiestaId);

  switch (azione.tipo) {
    case "rivedi_risposta":
      return (
        <>
          <p className="text-base font-semibold">{t("rivediRisposta")}</p>
          <TestoSemplice come="p" testo={azione.oggettoAttesa} lingua={linguaAttesa(azione.attesaId)} className="text-sm" />
          <div className="flex flex-wrap items-center gap-3">
            <Distintivo tono="risposta">{testoCodice(tc, "valutazioni", azione.valutazione)}</Distintivo>
            <a href={`#${ancora.risposta(azione.rispostaId)}`} className={collegamento}>
              {t("vaiAllaRisposta")}
              <ArrowRight className="size-3.5" aria-hidden />
            </a>
            <LinkEmail emailId={azione.emailId} />
          </div>
        </>
      );
    case "attivita": {
      const attivita = vista.attivita.find((a) => a.id === azione.attivitaId);
      return (
        <>
          <p className="text-base font-semibold">{t("attivita")}</p>
          <TestoSemplice come="p" testo={azione.descrizione} lingua={linguaDi(contesto, attivita?.emailSorgenteId)} className="text-sm" />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {azione.scadenza ? (
              <span className="text-text-muted">
                {t("scadenza")} <Istante iso={azione.scadenza} stile="data" className="font-medium text-text" />
              </span>
            ) : null}
            <Distintivo tono="neutro">{testoCodice(tc, "priorita", azione.priorita)}</Distintivo>
            <a href={`#${ancora.attivita(azione.attivitaId)}`} className={collegamento}>
              {t("vaiAllAttivita")}
              <ArrowRight className="size-3.5" aria-hidden />
            </a>
          </div>
        </>
      );
    }
    case "sollecito":
    case "attendi":
      return (
        <>
          <p className="text-base font-semibold">{azione.tipo === "sollecito" ? t("sollecito") : t("attendi")}</p>
          <TestoSemplice come="p" testo={azione.oggetto} lingua={linguaAttesa(azione.attesaId)} className="text-sm" />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            {azione.destinatari.length > 0 ? (
              <span className="text-text-muted">
                {t("da")} <span className="font-mono text-xs text-text">{azione.destinatari.join(", ")}</span>
              </span>
            ) : null}
            {azione.dataAttesa ? (
              <span className="text-text-muted">
                {t("attesaEntro")} <Istante iso={azione.dataAttesa} stile="data" className="font-medium text-text" />
              </span>
            ) : null}
            <a href={`#${ancora.attesa(azione.attesaId)}`} className={collegamento}>
              {t("vaiAllAttesa")}
              <ArrowRight className="size-3.5" aria-hidden />
            </a>
          </div>
          {azione.tipo === "sollecito" ? (
            <div className="pt-1">
              <PulsanteProponiSollecito attesaId={azione.attesaId} consigliato />
            </div>
          ) : null}
        </>
      );
    case "gestisci_urgenza":
      return (
        <>
          <p className="text-base font-semibold">{t("gestisciUrgenza")}</p>
          <p className="text-sm text-text-muted">{testoCodice(tc, "motiviUrgenza", azione.motivo, "aree.urgente")}</p>
          <a href={`#${ANCORA_URGENZA}`} className={collegamento}>
            {t("vaiAllUrgenza")}
            <ArrowRight className="size-3.5" aria-hidden />
          </a>
        </>
      );
    case "nessuna":
      return (
        <>
          <p className="text-base font-semibold">{t("nessuna")}</p>
          <p className="text-sm text-text-muted">{vista.stato.archiviata ? t("nessunaArchiviata") : t("nessunaAiuto")}</p>
        </>
      );
  }
}
