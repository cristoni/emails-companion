import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { AlertTriangle, Clock, Info, RefreshCw } from "lucide-react";
import type { VistaStatoDto } from "@ec/applicazione";
import type { StatoCasella } from "@ec/core/dominio";
import { Istante } from "@/components/comuni/istante";
import { Distintivo, type TonoDistintivo } from "@/components/ui/distintivo";
import { Scheda } from "@/components/ui/scheda";
import { cn } from "@/components/ui/cn";
import { AREA_TOCCO, CLASSE_LINK_AZIONE } from "./classi";
import { testoErrore } from "./testi";

type CasellaStato = VistaStatoDto["caselle"][number];

/** Oltre questo ritardo una casella collegata è "in ritardo" (la sincronizzazione normale gira ogni minuto). */
const SOGLIA_RITARDO_MS = 15 * 60_000;

/**
 * Tentativi falliti di seguito dopo i quali un errore di sincronizzazione va segnalato: i primi vengono
 * ritentati entro pochi minuti (30 s, 1 min, 2 min…) e di solito si risolvono da soli.
 */
const SOGLIA_ERRORI = 3;

/** Toni dei soli stati da segnalare: "collegata" è lo stato normale e non ha distintivo. */
const TONO_STATO: Record<Exclude<StatoCasella, "collegata">, TonoDistintivo> = {
  permessi_incompleti: "urgente",
  da_ricollegare: "urgente",
  scollegamento_in_corso: "neutro",
  scollegata: "neutro",
};

const CODICE_RECUPERO_LIMITATO = "recupero_limitato";

/** Errore vero e proprio: "recupero_limitato" è solo un'informazione (il recupero copre 90 giorni). */
function erroreReale(codice: string | null): string | null {
  return codice === CODICE_RECUPERO_LIMITATO ? null : codice;
}

function inRitardo(c: CasellaStato): boolean {
  return c.stato === "collegata" && c.ritardoMs !== null && c.ritardoMs > SOGLIA_RITARDO_MS;
}

/** Errore di sincronizzazione che non si è risolto con i primi tentativi (o che non viene ritentato). */
function erroreSyncPersistente(c: CasellaStato): boolean {
  return erroreReale(c.erroreSincronizzazione) !== null && (c.erroriConsecutivi === 0 || c.erroriConsecutivi >= SOGLIA_ERRORI);
}

/**
 * La casella richiede un intervento o un controllo dell'utente: permessi, ricollegamento, ritardo, errori che
 * persistono, importazione interrotta o in attesa di conferma. Serve alla sintesi in cima a `/status`; un
 * singolo tentativo fallito, ritentato a breve, non basta.
 */
export function casellaDaControllare(c: CasellaStato): boolean {
  return (
    c.stato === "permessi_incompleti" ||
    c.stato === "da_ricollegare" ||
    inRitardo(c) ||
    erroreSyncPersistente(c) ||
    erroreReale(c.erroreCasella) !== null ||
    c.faseImportazione === "errore" ||
    c.faseImportazione === "stimata"
  );
}

function Campo({ etichetta, children }: { etichetta: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-xs text-text-muted">{etichetta}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/**
 * Stato di sincronizzazione e importazione di una Casella collegata, con errori tradotti e prossimo tentativo.
 * L'importazione compare solo finché non è completata; un errore che la sincronizzazione sta ancora ritentando
 * è una riga attenuata, quello che persiste un riquadro urgente.
 */
export function SchedaCasellaStato({ casella }: { casella: CasellaStato }) {
  const t = useTranslations("stato.caselle");
  const tc = useTranslations("comuni");
  const tr = useTranslations();
  const formato = useFormatter();
  const c = casella;
  const avanzamento = c.avanzamento;
  const percentuale = avanzamento && avanzamento.totale > 0 ? Math.min(100, Math.round((avanzamento.acquisite / avanzamento.totale) * 100)) : null;
  const mostraAvanzamento = avanzamento !== null && (c.faseImportazione === "in_corso" || c.faseImportazione === "errore");
  const testoAvanzamento = avanzamento && avanzamento.totale > 0 ? t("avanzamento", { acquisite: formato.number(avanzamento.acquisite), totale: formato.number(avanzamento.totale) }) : null;
  const avvisoRecupero = c.erroreSincronizzazione === CODICE_RECUPERO_LIMITATO || c.erroreCasella === CODICE_RECUPERO_LIMITATO;
  const erroreSync = erroreReale(c.erroreSincronizzazione);
  const erroreCasella = erroreReale(c.erroreCasella) === c.erroreSincronizzazione ? null : erroreReale(c.erroreCasella);
  const mostraImportazione = c.faseImportazione !== null && c.faseImportazione !== "completata";
  const erroreUrgente = erroreSyncPersistente(c) || erroreCasella !== null;

  return (
    <li>
      <Scheda className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="min-w-0 text-[15px] [overflow-wrap:anywhere]">{c.indirizzo}</h3>
          {c.stato === "collegata" ? null : <Distintivo tono={TONO_STATO[c.stato]}>{tc(`statiCasella.${c.stato}`)}</Distintivo>}
        </div>

        <dl className={cn("grid gap-4", mostraImportazione && "sm:grid-cols-2")}>
          <Campo etichetta={t("ultimaSync")}>
            {c.ultimaSyncOk ? (
              <span className="flex flex-wrap items-center gap-2">
                <Istante iso={c.ultimaSyncOk} stile="relativo" />
                {/* Solo l'eccezione: una casella aggiornata non ha distintivo, basta l'ora relativa. */}
                {inRitardo(c) ? (
                  <Distintivo tono="urgente" icona={<Clock className="size-3" aria-hidden />}>
                    {t("inRitardo")}
                  </Distintivo>
                ) : null}
              </span>
            ) : (
              <span className="text-text-muted">{t("maiSincronizzata")}</span>
            )}
          </Campo>
          {mostraImportazione ? (
            <Campo etichetta={t("importazione")}>
              <span className="block">{t(`fasi.${c.faseImportazione}`)}</span>
              {mostraAvanzamento ? (
                <span className="mt-1.5 block space-y-1">
                  {percentuale !== null ? (
                    <span
                      role="progressbar"
                      aria-label={t("avanzamentoEtichetta")}
                      aria-valuemin={0}
                      aria-valuemax={avanzamento.totale}
                      aria-valuenow={avanzamento.acquisite}
                      aria-valuetext={testoAvanzamento ?? undefined}
                      className="block h-1.5 overflow-hidden rounded-full bg-surface-muted ring-1 ring-border"
                    >
                      <span className="block h-full rounded-full bg-accent" style={{ width: `${percentuale}%` }} />
                    </span>
                  ) : null}
                  {testoAvanzamento ? <span className="block text-xs text-text-muted">{testoAvanzamento}</span> : null}
                  {avanzamento.elenchiPendenti > 0 ? <span className="block text-xs text-text-muted">{t("elencoInCorso")}</span> : null}
                </span>
              ) : null}
            </Campo>
          ) : null}
        </dl>

        {avvisoRecupero ? (
          <p className="flex items-start gap-1.5 rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-sm text-text-muted">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {testoErrore(tr, CODICE_RECUPERO_LIMITATO)}
          </p>
        ) : null}

        {erroreUrgente ? (
          <div className="space-y-2 rounded-lg border border-urgent/30 bg-urgent-soft px-3 py-2.5 text-sm">
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
            {c.erroriConsecutivi > 0 || c.prossimoTentativo ? (
              <p className="text-xs text-text-muted">
                {c.erroriConsecutivi > 0 ? t("erroriConsecutivi", { numero: c.erroriConsecutivi }) : null}
                {c.erroriConsecutivi > 0 && c.prossimoTentativo ? " · " : null}
                {c.prossimoTentativo ? (
                  <>
                    {t("prossimoTentativo")} <Istante iso={c.prossimoTentativo} stile="relativo" />
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        ) : erroreSync || c.erroriConsecutivi > 0 ? (
          // Primi tentativi falliti: la sincronizzazione riprova da sola, basta una riga attenuata.
          <p className="flex items-start gap-1.5 text-xs text-text-muted">
            <RefreshCw className="mt-px size-3.5 shrink-0" aria-hidden />
            <span>
              {erroreSync ? t("ritenta", { errore: testoErrore(tr, erroreSync) }) : t("erroriConsecutivi", { numero: c.erroriConsecutivi })}
              {c.prossimoTentativo ? (
                <>
                  {" · "}
                  {t("prossimoTentativo")} <Istante iso={c.prossimoTentativo} stile="relativo" />
                </>
              ) : null}
            </span>
          </p>
        ) : null}

        {c.stato === "permessi_incompleti" || c.stato === "da_ricollegare" ? (
          <Link href="/settings#mailboxes" className={cn("text-sm", CLASSE_LINK_AZIONE, AREA_TOCCO)}>
            {t("risolvi")}
          </Link>
        ) : c.faseImportazione === "stimata" ? (
          // Nulla è guasto: l'importazione aspetta solo la conferma dell'utente.
          <Link href="/settings#mailboxes" className={cn("text-sm", CLASSE_LINK_AZIONE, AREA_TOCCO)}>
            {t("conferma")}
          </Link>
        ) : null}
      </Scheda>
    </li>
  );
}
