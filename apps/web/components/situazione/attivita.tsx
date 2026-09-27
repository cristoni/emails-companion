import { useTranslations } from "next-intl";
import { CalendarClock, CheckCircle2, Sparkles, Zap } from "lucide-react";
import type { AttivitaDto } from "@ec/applicazione";
import { testoCodice } from "@/components/comuni/codici";
import { DistintivoBase, DistintivoProposta } from "@/components/comuni/distintivi";
import { ElencoEvidenze, LinkEmail } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { ModuloAzione } from "@/components/comuni/modulo-azione";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { Distintivo } from "@/components/ui/distintivo";
import { StatoVuoto } from "@/components/ui/pagina";
import { completaAttivitaAzione, confermaElementoAzione, riapriAttivitaAzione, scartaElementoAzione } from "@/app/(app)/situations/[id]/azioni";
import { ancora, CorrezioniElemento, LinkPerche, linguaDi, Sezione, type ContestoDettaglio } from "./comuni";
import { ModificaAttivita } from "./modifica-attivita";

/** Attività della Situazione: aperte prima, poi completate, scartate o non più trovate. */
export function SezioneAttivita({ attivita, contesto }: { attivita: readonly AttivitaDto[]; contesto: ContestoDettaglio }) {
  const t = useTranslations("situazione.attivita");
  const aperta = (a: AttivitaDto) => a.stato === "proposta" || a.stato === "confermata";
  const ordinate = [...attivita.filter(aperta), ...attivita.filter((a) => !aperta(a))];
  return (
    <Sezione id="attivita" titolo={t("titolo")} descrizione={t("descrizione")} conteggio={attivita.length}>
      {ordinate.length === 0 ? (
        <StatoVuoto titolo={t("vuoto")} />
      ) : (
        <ul className="space-y-3">
          {ordinate.map((a) => (
            <SchedaAttivita key={a.id} attivita={a} contesto={contesto} />
          ))}
        </ul>
      )}
    </Sezione>
  );
}

function SchedaAttivita({ attivita: a, contesto }: { attivita: AttivitaDto; contesto: ContestoDettaglio }) {
  const t = useTranslations("situazione.attivita");
  const tc = useTranslations("comuni");
  const lingua = linguaDi(contesto, a.emailSorgenteId);
  const aperta = a.stato === "proposta" || a.stato === "confermata";
  const chiusa = !aperta;
  return (
    <li
      id={ancora.attivita(a.id)}
      className={`scroll-mt-6 rounded-[var(--radius-card)] border bg-surface-raised p-4 shadow-[var(--shadow-card)] target:ring-2 target:ring-accent/40 ${
        a.proposta ? "border-dashed border-border-strong" : "border-border"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {a.proposta ? <DistintivoProposta /> : <StatoAttivita attivita={a} />}
        <DistintivoBase base={a.base} />
        <Distintivo tono="neutro">{testoCodice(tc, "priorita", a.priorita)}</Distintivo>
        {a.urgente && aperta ? (
          <Distintivo tono="urgente" icona={<Zap className="size-3" aria-hidden />}>
            {t("urgente")}
          </Distintivo>
        ) : null}
        <LinkPerche analisiId={a.analisiId} contesto={contesto} />
      </div>

      <TestoSemplice
        come="p"
        testo={a.descrizione}
        lingua={lingua}
        className={`mt-2.5 text-[15px] leading-relaxed ${chiusa ? "text-text-muted line-through decoration-border-strong" : ""}`}
      />

      {a.scadenza || a.scadenzaCitazione ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <CalendarClock className="size-4 text-text-muted" aria-hidden />
          {a.scadenza ? (
            <span>
              <span className="text-text-muted">{t("scadenza")}</span> <Istante iso={a.scadenza} stile="data" className="font-medium" />
            </span>
          ) : (
            <span className="text-text-muted">{t("scadenzaNonLetta")}</span>
          )}
          {a.scadenzaCitazione ? (
            <span className="inline-flex min-w-0 items-baseline gap-1 text-text-muted">
              <span>{t("citazioneScadenza")}</span>
              <TestoSemplice come="span" testo={`“${a.scadenzaCitazione}”`} lingua={lingua} className="italic" />
            </span>
          ) : null}
        </div>
      ) : null}

      {a.completataDaAi ? (
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-dashed border-border-strong bg-suggestion-soft px-3 py-2.5 text-sm">
          <div className="space-y-1">
            <p className="flex flex-wrap items-center gap-1.5 font-medium">
              <Sparkles className="size-3.5 text-suggestion" aria-hidden />
              {t("completataDaAi")}
              <DistintivoBase base="dedotto" />
            </p>
            <p className="text-text-muted">
              {t("completataDaAiAiuto")} {a.completataIl ? <Istante iso={a.completataIl} stile="relativo" /> : null}
            </p>
            {a.emailCompletamentoId ? <LinkEmail emailId={a.emailCompletamentoId}>{t("apriRisposta")}</LinkEmail> : null}
          </div>
          <ModuloAzione azione={riapriAttivitaAzione} campi={{ attivita: a.id }} etichetta={t("nonFatta")} />
        </div>
      ) : a.completata && a.completataDa === "utente" ? (
        <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-text-muted">
          <CheckCircle2 className="size-4 text-accent-strong" aria-hidden />
          {t("completataDaTe")} {a.completataIl ? <Istante iso={a.completataIl} stile="relativo" /> : null}
        </p>
      ) : null}

      <div className="mt-3 space-y-2">
        <ElencoEvidenze evidenze={a.evidenze} />
        <p className="text-xs text-text-muted">
          <LinkEmail emailId={a.emailSorgenteId}>{t("apriSorgente")}</LinkEmail>
        </p>
      </div>

      {/* Completata dall'AI: la riapertura è già nel riquadro dell'inferenza, qui sopra. */}
      {aperta || !a.completataDaAi ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {a.proposta ? (
            <ModuloAzione azione={confermaElementoAzione} campi={{ tipo: "attivita", id: a.id }} etichetta={tc("azioni.conferma")} variante="primario" />
          ) : null}
          {aperta ? (
            <>
              <ModuloAzione azione={completaAttivitaAzione} campi={{ attivita: a.id }} etichetta={t("completa")} />
              <ModificaAttivita
                attivitaId={a.id}
                descrizione={a.descrizione}
                lingua={lingua}
                scadenza={a.scadenza ? a.scadenza.slice(0, 10) : ""}
                priorita={a.priorita}
              />
              <ModuloAzione
                azione={scartaElementoAzione}
                campi={{ tipo: "attivita", id: a.id }}
                etichetta={t("scarta")}
                variante="fantasma"
                conferma={{ domanda: t("scartaDomanda"), etichetta: t("scartaConferma") }}
              />
            </>
          ) : (
            <ModuloAzione azione={riapriAttivitaAzione} campi={{ attivita: a.id }} etichetta={t("riapri")} />
          )}
        </div>
      ) : null}
      {a.correzioni.length > 0 ? (
        <div className="mt-3">
          <CorrezioniElemento correzioni={a.correzioni} />
        </div>
      ) : null}
    </li>
  );
}

function StatoAttivita({ attivita }: { attivita: AttivitaDto }) {
  const tc = useTranslations("comuni");
  const tono = attivita.stato === "confermata" ? "accento" : "neutro";
  return (
    <Distintivo tono={tono} icona={attivita.stato === "completata" ? <CheckCircle2 className="size-3" aria-hidden /> : undefined}>
      {testoCodice(tc, "statiElemento", attivita.stato)}
    </Distintivo>
  );
}
