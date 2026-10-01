import { useTranslations } from "next-intl";
import { CalendarClock, CheckCircle2, Sparkles, Zap } from "lucide-react";
import type { AttivitaDto } from "@ec/applicazione";
import { testoCodice } from "@/components/comuni/codici";
import { DistintivoBase, DistintivoProposta } from "@/components/comuni/distintivi";
import { ElencoEvidenze, LinkEmail } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { ModuloAzione } from "@/components/comuni/modulo-azione";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { cn } from "@/components/ui/cn";
import { Distintivo } from "@/components/ui/distintivo";
import { completaAttivitaAzione, confermaElementoAzione, riapriAttivitaAzione, scartaElementoAzione } from "@/app/(app)/situations/[id]/azioni";
import { ancora, AzioniScheda, CorrezioniElemento, ElencoSchede, LinkPerche, linguaDi, Sezione, type ContestoDettaglio } from "./comuni";
import { ModificaAttivita } from "./modifica-attivita";

const aperta = (a: AttivitaDto) => a.stato === "proposta" || a.stato === "confermata";

/** Attività della Situazione: le aperte in vista, le completate, scartate o non più trovate raccolte a parte. */
export function SezioneAttivita({ attivita, contesto }: { attivita: readonly AttivitaDto[]; contesto: ContestoDettaglio }) {
  const t = useTranslations("situazione.attivita");
  const scheda = (a: AttivitaDto) => <SchedaAttivita key={a.id} attivita={a} contesto={contesto} />;
  return (
    <Sezione id="attivita" titolo={t("titolo")} conteggio={attivita.filter(aperta).length || attivita.length}>
      <ElencoSchede aperte={attivita.filter(aperta).map(scheda)} chiuse={attivita.filter((a) => !aperta(a)).map(scheda)} />
    </Sezione>
  );
}

function SchedaAttivita({ attivita: a, contesto }: { attivita: AttivitaDto; contesto: ContestoDettaglio }) {
  const t = useTranslations("situazione.attivita");
  const lingua = linguaDi(contesto, a.emailSorgenteId);
  const inCorso = aperta(a);
  // Le evidenze portano già all'email da cui deriva l'attività: il link a parte serve solo se nessuna lo fa.
  const sorgenteCitata = a.evidenze.some((e) => e.emailId === a.emailSorgenteId);

  return (
    <li
      id={ancora.attivita(a.id)}
      className={cn(
        "scroll-mt-6 rounded-[var(--radius-card)] border bg-surface-raised p-4 shadow-[var(--shadow-card)] target:ring-2 target:ring-accent/40",
        a.proposta ? "border-dashed border-border-strong" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {a.proposta ? <DistintivoProposta /> : <StatoAttivita attivita={a} />}
        <DistintivoBase base={a.base} />
        {a.priorita === "alta" && inCorso ? <PrioritaAlta /> : null}
        {a.urgente && inCorso ? (
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
        className={cn("mt-2 text-[15px] leading-relaxed", !inCorso && "text-text-muted line-through decoration-border-strong")}
      />

      {a.scadenza || a.scadenzaCitazione ? (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
          <CalendarClock className="size-4 text-text-muted" aria-hidden />
          {a.scadenza ? (
            <span>
              <span className="text-text-muted">{t("scadenza")}</span> <Istante iso={a.scadenza} stile="giorno" className="font-medium" />
            </span>
          ) : (
            <span className="text-text-muted">{t("scadenzaNonLetta")}</span>
          )}
          {a.scadenzaCitazione ? (
            <TestoSemplice come="span" testo={`“${a.scadenzaCitazione}”`} lingua={lingua} className="text-text-muted italic" />
          ) : null}
        </p>
      ) : null}

      {a.completataDaAi ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border-strong bg-suggestion-soft px-3 py-2 text-sm">
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <Sparkles className="size-3.5 text-suggestion" aria-hidden />
            <span className="font-medium">{t("completataDaAi")}</span>
            <DistintivoBase base="dedotto" />
            {a.completataIl ? <Istante iso={a.completataIl} stile="relativo" className="text-text-muted" /> : null}
            {a.emailCompletamentoId ? <LinkEmail emailId={a.emailCompletamentoId}>{t("apriRisposta")}</LinkEmail> : null}
          </p>
          <ModuloAzione azione={riapriAttivitaAzione} campi={{ attivita: a.id }} etichetta={t("nonFatta")} />
        </div>
      ) : a.completata && a.completataDa === "utente" ? (
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-text-muted">
          <CheckCircle2 className="size-4 text-accent-strong" aria-hidden />
          {t("completataDaTe")} {a.completataIl ? <Istante iso={a.completataIl} stile="relativo" /> : null}
        </p>
      ) : null}

      {a.evidenze.length > 0 ? <ElencoEvidenze evidenze={a.evidenze} className="mt-3 space-y-2" /> : null}
      {!sorgenteCitata ? (
        <p className="mt-2 text-sm">
          <LinkEmail emailId={a.emailSorgenteId}>{t("apriSorgente")}</LinkEmail>
        </p>
      ) : null}

      {/* Completata dall'AI: la riapertura è già nel riquadro dell'inferenza, qui sopra. */}
      {inCorso ? (
        <AzioniScheda
          fare={
            <>
              {/* Il pulsante principale della pagina è nella scheda "Prossima azione": qui tutti secondari. */}
              {a.proposta ? <ModuloAzione azione={confermaElementoAzione} campi={{ tipo: "attivita", id: a.id }} etichetta={t("conferma")} /> : null}
              <ModuloAzione azione={completaAttivitaAzione} campi={{ attivita: a.id }} etichetta={t("completa")} />
              <ModificaAttivita attivitaId={a.id} descrizione={a.descrizione} lingua={lingua} scadenza={a.scadenza ? a.scadenza.slice(0, 10) : ""} priorita={a.priorita} />
            </>
          }
          correggere={
            <ModuloAzione
              azione={scartaElementoAzione}
              campi={{ tipo: "attivita", id: a.id }}
              etichetta={t("scarta")}
              conferma={{ domanda: t("scartaDomanda"), etichetta: t("scartaConferma") }}
            />
          }
        />
      ) : !a.completataDaAi ? (
        <AzioniScheda fare={<ModuloAzione azione={riapriAttivitaAzione} campi={{ attivita: a.id }} etichetta={t("riapri")} />} />
      ) : null}
      {a.correzioni.length > 0 ? (
        <div className="mt-3">
          <CorrezioniElemento correzioni={a.correzioni} />
        </div>
      ) : null}
    </li>
  );
}

function PrioritaAlta() {
  const tc = useTranslations("comuni");
  return <Distintivo tono="neutro">{tc("priorita.alta")}</Distintivo>;
}

/** Stato di un'attività chiusa (la confermata è lo stato normale e non ha distintivo); "Completata" è blu con la spunta. */
function StatoAttivita({ attivita }: { attivita: AttivitaDto }) {
  const tc = useTranslations("comuni");
  if (attivita.stato === "confermata") return null;
  const fatta = attivita.stato === "completata";
  return (
    <Distintivo tono={fatta ? "accento" : "neutro"} icona={fatta ? <CheckCircle2 className="size-3" aria-hidden /> : undefined}>
      {testoCodice(tc, "statiElemento", attivita.stato)}
    </Distintivo>
  );
}
