import { useTranslations } from "next-intl";
import { Archive, CheckCircle2, Zap } from "lucide-react";
import type { UrgenzaEmailOrigineDto, VistaSituazioneDto } from "@ec/applicazione";
import { testoCodice } from "@/components/comuni/codici";
import { DistintivoArea, DistintivoBase, DistintivoProposta } from "@/components/comuni/distintivi";
import { ElencoEvidenze, LinkEmail } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { ModuloAzione } from "@/components/comuni/modulo-azione";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { Distintivo } from "@/components/ui/distintivo";
import { archiviaAzione, cambiaUrgenzaAzione, riapriSituazioneAzione, segnaGestitaAzione } from "@/app/(app)/situations/[id]/azioni";
import { CorrezioniElemento, LinkPerche, Metadato, PulsanteAnnulla, linguaDi, type ContestoDettaglio } from "./comuni";

export const ANCORA_URGENZA = "urgenza";

/**
 * Intestazione del dettaglio: titolo e descrizione scritti dall'AI, aree e stato, urgenza con il suo motivo
 * e le azioni sulla Situazione (segna come gestita, archivia, riapri) e sull'urgenza dell'email d'origine.
 */
export function IntestazioneSituazione({
  vista,
  origine,
  contesto,
}: {
  vista: VistaSituazioneDto;
  origine: UrgenzaEmailOrigineDto | null;
  contesto: ContestoDettaglio;
}) {
  const t = useTranslations("situazione.intestazione");
  const tc = useTranslations("comuni");
  const { situazione, stato } = vista;
  const conclusa = !stato.attiva && !stato.archiviata;
  // "Segna come gestita" chiude l'urgenza delle email, non una scadenza vicina: lì non avrebbe effetto.
  const gestibile = stato.urgente && stato.motivoUrgenza !== "scadenza_vicina";

  return (
    <header className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-accent-strong">{t("etichetta")}</span>
          {stato.aree.map((area) => (
            <DistintivoArea key={area} area={area} />
          ))}
          {stato.archiviata ? (
            <Distintivo tono="neutro" icona={<Archive className="size-3" aria-hidden />}>
              {t("archiviata")}
            </Distintivo>
          ) : null}
          {conclusa ? (
            <Distintivo tono="neutro" icona={<CheckCircle2 className="size-3" aria-hidden />}>
              {t("conclusa")}
            </Distintivo>
          ) : null}
          {stato.haProposte ? <DistintivoProposta /> : null}
        </div>
        <h1 id="titolo-situazione" className="text-2xl leading-tight sm:text-3xl">
          <TestoSemplice come="span" testo={situazione.titolo} lingua={situazione.lingua} />
        </h1>
        {situazione.descrizione.trim() ? (
          <TestoSemplice come="p" testo={situazione.descrizione} lingua={situazione.lingua} className="max-w-prose text-[15px] leading-relaxed text-text-muted" />
        ) : null}
        <p className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
          <span>{t("testoAi")}</span>
          <LinkEmail emailId={situazione.emailOrigineId}>{t("emailOrigine")}</LinkEmail>
          <LinkPerche analisiId={situazione.analisiId} contesto={contesto} />
        </p>
      </div>

      <dl className="flex flex-wrap gap-x-6 gap-y-1.5">
        <Metadato etichetta={t("creata")}>
          <Istante iso={situazione.creataIl} stile="data" />
        </Metadato>
        <Metadato etichetta={t("ultimaAttivita")}>
          <Istante iso={situazione.ultimaAttivita} stile="relativo" />
        </Metadato>
        {stato.scadenzaPiuVicina ? (
          <Metadato etichetta={t("scadenzaPiuVicina")}>
            <Istante iso={stato.scadenzaPiuVicina} stile="data" />
          </Metadato>
        ) : null}
        {stato.prioritaMassima ? <Metadato etichetta={t("priorita")}>{testoCodice(tc, "priorita", stato.prioritaMassima)}</Metadato> : null}
        {situazione.gestitaIl ? (
          <Metadato etichetta={t("gestita")}>
            <Istante iso={situazione.gestitaIl} stile="data_ora" />
          </Metadato>
        ) : null}
      </dl>

      {stato.urgente ? (
        <div id={ANCORA_URGENZA} className="scroll-mt-6 space-y-3 rounded-[var(--radius-card)] border border-urgent/30 bg-urgent-soft px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Zap className="mt-0.5 size-4 shrink-0 text-urgent" aria-hidden />
              <div>
                <p className="text-sm font-semibold">{t("urgenza.titolo")}</p>
                <p className="text-sm text-text-muted">{testoCodice(tc, "motiviUrgenza", stato.motivoUrgenza, "aree.urgente")}</p>
              </div>
            </div>
            {gestibile ? (
              <ModuloAzione azione={segnaGestitaAzione} campi={{ situazione: situazione.id }} etichetta={t("urgenza.gestisci")} variante="primario" />
            ) : null}
          </div>
          <p className="text-xs text-text-muted">{gestibile ? t("urgenza.gestisciAiuto") : t("urgenza.scadenzaAiuto")}</p>
        </div>
      ) : null}

      {origine?.correggibile ? <UrgenzaOrigine origine={origine} contesto={contesto} /> : null}

      <div className="flex flex-wrap items-center gap-3">
        {stato.archiviata ? (
          <ModuloAzione azione={riapriSituazioneAzione} campi={{ situazione: situazione.id }} etichetta={t("riapri")} />
        ) : (
          <ModuloAzione azione={archiviaAzione} campi={{ situazione: situazione.id }} etichetta={t("archivia")} />
        )}
        <p className="text-xs text-text-muted">{stato.archiviata ? t("archiviataAiuto") : conclusa ? t("conclusaAiuto") : t("archiviaAiuto")}</p>
      </div>
      <CorrezioniElemento correzioni={situazione.correzioni} />
    </header>
  );
}

/** Urgenza dell'email d'origine: valore dell'AI con base ed evidenze, correzione e annullamento. */
function UrgenzaOrigine({ origine, contesto }: { origine: UrgenzaEmailOrigineDto; contesto: ContestoDettaglio }) {
  const t = useTranslations("situazione.intestazione.origine");
  const lingua = linguaDi(contesto, origine.emailId);
  const corretta = origine.correzioni.length > 0;
  return (
    <section aria-labelledby="urgenza-origine-titolo" className="space-y-3 rounded-[var(--radius-card)] border border-border bg-surface-raised px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h2 id="urgenza-origine-titolo" className="text-sm">
            {t("titolo")}
          </h2>
          <p className="text-sm text-text-muted">
            {origine.urgente ? t("urgente") : t("nonUrgente")} · {corretta ? t("dallUtente") : origine.urgenteAi === null ? t("nonClassificata") : t("dallAi")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ModuloAzione
            azione={cambiaUrgenzaAzione}
            campi={{ email: origine.emailId, urgente: origine.urgente ? "no" : "si" }}
            etichetta={origine.urgente ? t("togli") : t("segna")}
          />
          <PulsanteAnnulla correzioni={origine.correzioni.map((c) => c.id)} />
        </div>
      </div>
      {origine.urgenteAi !== null ? (
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <span>{origine.urgenteAi ? t("aiUrgente") : t("aiNonUrgente")}</span>
            {origine.urgenteAi && origine.base ? <DistintivoBase base={origine.base} /> : null}
            <LinkPerche analisiId={origine.analisiId} contesto={contesto} />
          </div>
          {origine.motivazione ? <TestoSemplice come="p" testo={origine.motivazione} lingua={lingua} className="text-sm" /> : null}
          {origine.urgenteAi ? <ElencoEvidenze evidenze={origine.evidenze} /> : null}
        </div>
      ) : null}
    </section>
  );
}
