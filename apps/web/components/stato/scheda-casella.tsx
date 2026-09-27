import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Clock, Info } from "lucide-react";
import type { VistaStatoDto } from "@ec/applicazione";
import type { StatoCasella } from "@ec/core/dominio";
import { Istante } from "@/components/comuni/istante";
import { Distintivo, type TonoDistintivo } from "@/components/ui/distintivo";
import { Durata, testoErrore } from "./testi";

type CasellaStato = VistaStatoDto["caselle"][number];

/** Oltre questo ritardo una casella collegata è "in ritardo" (la sincronizzazione normale gira ogni minuto). */
const SOGLIA_RITARDO_MS = 15 * 60_000;

const TONO_STATO: Record<StatoCasella, TonoDistintivo> = {
  collegata: "accento",
  permessi_incompleti: "urgente",
  da_ricollegare: "urgente",
  scollegamento_in_corso: "neutro",
  scollegata: "neutro",
};

const CODICE_RECUPERO_LIMITATO = "recupero_limitato";

const FASI_VISIBILI = new Set(["da_stimare", "stimata", "confermata", "rifiutata", "in_corso", "errore"]);

function Riga({ etichetta, children }: { etichetta: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-xs text-text-muted">{etichetta}</dt>
      <dd className="min-w-0 break-words text-sm sm:text-right">{children}</dd>
    </div>
  );
}

/** Stato di sincronizzazione e importazione di una Casella collegata, con errori tradotti e prossimo tentativo. */
export function SchedaCasellaStato({ casella }: { casella: CasellaStato }) {
  const t = useTranslations("stato.caselle");
  const tc = useTranslations("comuni");
  const tr = useTranslations();
  const formato = useFormatter();
  const c = casella;
  const inRitardo = c.stato === "collegata" && c.ritardoMs !== null && c.ritardoMs > SOGLIA_RITARDO_MS;
  const avanzamento = c.avanzamento;
  const percentuale = avanzamento && avanzamento.totale > 0 ? Math.min(100, Math.round((avanzamento.acquisite / avanzamento.totale) * 100)) : null;
  const mostraImportazione = c.faseImportazione !== null && FASI_VISIBILI.has(c.faseImportazione);
  // "recupero_limitato" non è un errore: avvisa che il recupero dopo una lunga interruzione copre solo 90 giorni.
  const avvisoRecupero = c.erroreSincronizzazione === CODICE_RECUPERO_LIMITATO || c.erroreCasella === CODICE_RECUPERO_LIMITATO;
  const erroreSync = c.erroreSincronizzazione === CODICE_RECUPERO_LIMITATO ? null : c.erroreSincronizzazione;
  const erroreCasella = c.erroreCasella === CODICE_RECUPERO_LIMITATO || c.erroreCasella === c.erroreSincronizzazione ? null : c.erroreCasella;

  return (
    <li className="space-y-4 rounded-lg border border-border px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 break-all font-mono text-sm font-medium">{c.indirizzo}</h3>
        <Distintivo tono={TONO_STATO[c.stato]}>{tc(`statiCasella.${c.stato}`)}</Distintivo>
      </div>

      <dl className="space-y-2.5">
        <Riga etichetta={t("ritardo")}>
          {c.ritardoMs === null ? (
            <span className="text-text-muted">{t("maiSincronizzata")}</span>
          ) : (
            <span className="inline-flex flex-wrap items-center justify-end gap-2">
              <Durata ms={c.ritardoMs} />
              {c.stato === "collegata" ? (
                inRitardo ? (
                  <Distintivo tono="urgente" icona={<Clock className="size-3" aria-hidden />}>
                    {t("inRitardo")}
                  </Distintivo>
                ) : (
                  <Distintivo tono="accento" icona={<CheckCircle2 className="size-3" aria-hidden />}>
                    {t("aggiornata")}
                  </Distintivo>
                )
              ) : null}
            </span>
          )}
        </Riga>
        <Riga etichetta={t("ultimaSync")}>
          <Istante iso={c.ultimaSyncOk} stile="data_ora" />
        </Riga>
        {c.faseImportazione ? <Riga etichetta={t("importazione")}>{tc(`fasiImportazione.${c.faseImportazione}`)}</Riga> : null}
      </dl>

      {mostraImportazione && avanzamento && (c.faseImportazione === "in_corso" || c.faseImportazione === "errore") ? (
        <div className="space-y-1.5">
          {percentuale !== null ? (
            <div
              role="progressbar"
              aria-label={t("avanzamentoEtichetta")}
              aria-valuemin={0}
              aria-valuemax={avanzamento.totale}
              aria-valuenow={avanzamento.acquisite}
              aria-valuetext={t("avanzamento", { acquisite: formato.number(avanzamento.acquisite), totale: formato.number(avanzamento.totale) })}
              className="h-1.5 overflow-hidden rounded-full bg-surface-muted ring-1 ring-border"
            >
              <div className="h-full rounded-full bg-accent" style={{ width: `${percentuale}%` }} />
            </div>
          ) : null}
          <p className="text-xs text-text-muted">
            {avanzamento.totale > 0 ? t("avanzamento", { acquisite: formato.number(avanzamento.acquisite), totale: formato.number(avanzamento.totale) }) : null}
            {avanzamento.elenchiPendenti > 0 ? <span className="block">{t("elencoInCorso")}</span> : null}
          </p>
        </div>
      ) : null}

      {avvisoRecupero ? (
        <p className="flex items-start gap-1.5 rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {testoErrore(tr, CODICE_RECUPERO_LIMITATO)}
        </p>
      ) : null}

      {erroreSync || erroreCasella || c.erroriConsecutivi > 0 ? (
        <div className="space-y-2 rounded-lg border border-urgent/30 bg-urgent-soft px-3 py-2.5">
          {erroreSync ? (
            <p className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-urgent" aria-hidden />
              <span>
                <span className="font-medium">{t("erroreSync")}:</span> {testoErrore(tr, erroreSync)}
              </span>
            </p>
          ) : null}
          {erroreCasella ? (
            <p className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-urgent" aria-hidden />
              <span>
                <span className="font-medium">{t("erroreCasella")}:</span> {testoErrore(tr, erroreCasella)}
              </span>
            </p>
          ) : null}
          <div className="space-y-1 text-xs text-text-muted">
            {c.erroriConsecutivi > 0 ? <p>{t("erroriConsecutivi", { numero: c.erroriConsecutivi })}</p> : null}
            {c.prossimoTentativo ? (
              <p>
                {t("prossimoTentativo")}: <Istante iso={c.prossimoTentativo} stile="data_ora" />
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {c.stato === "permessi_incompleti" || c.stato === "da_ricollegare" || c.faseImportazione === "stimata" ? (
        <Link href="/settings#mailboxes" className="inline-block text-sm text-accent-strong underline-offset-4 hover:underline">
          {t("gestisci")}
        </Link>
      ) : null}
    </li>
  );
}
