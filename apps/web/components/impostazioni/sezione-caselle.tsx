import { useFormatter, useTranslations } from "next-intl";
import { AlertTriangle, Check, CheckCircle2, Loader2, Plus, X } from "lucide-react";
import type { StimaImportazioneCasella, VistaImpostazioniDto } from "@ec/applicazione";
import type { StatoCasella } from "@ec/core/dominio";
import { confermaImportazioneAzione, rinviaImportazioneAzione, scollegaCasellaAzione } from "@/app/(app)/settings/azioni";
import { testoCodice } from "@/components/comuni/codici";
import { Istante } from "@/components/comuni/istante";
import { ModuloAzione } from "@/components/comuni/modulo-azione";
import { Distintivo } from "@/components/ui/distintivo";
import { cn } from "@/components/ui/cn";
import { Pulsante, classiPulsante } from "@/components/ui/pulsante";
import { ConfermaAzione } from "./conferma-azione";
import { opzioniImporto } from "./formato";
import { RigaMeta, Sezione } from "./sezione";

type Casella = VistaImpostazioniDto["caselle"][number];

function IconaStato({ stato }: { stato: StatoCasella }) {
  if (stato === "scollegamento_in_corso") return <Loader2 className="size-3 motion-safe:animate-spin" aria-hidden />;
  return <AlertTriangle className="size-3" aria-hidden />;
}

function Permesso({ concesso, etichetta, testo }: { concesso: boolean; etichetta: string; testo: string }) {
  return (
    <li className="flex items-center gap-1.5">
      {concesso ? <Check className="size-3.5 text-accent-strong" aria-hidden /> : <X className="size-3.5 text-danger" aria-hidden />}
      <span>
        {etichetta}: <span className={concesso ? "text-text-muted" : "font-medium text-danger"}>{testo}</span>
      </span>
    </li>
  );
}

/**
 * Sezione `#mailboxes`. Una casella in ordine è l'indirizzo con una sola riga attenuata (connettore,
 * permessi, importazione, data); i problemi (permessi mancanti, da ricollegare) hanno il distintivo, la
 * spiegazione e il comando per risolverli. "Scollega" è discreto, a destra, con conferma delle conseguenze.
 */
export function SezioneCaselle({
  caselle,
  stime,
  importazionePossibile,
}: {
  caselle: Casella[];
  stime: Record<string, StimaImportazioneCasella>;
  /** Informativa accettata e chiave valida: senza, l'importazione non può partire. */
  importazionePossibile: boolean;
}) {
  const t = useTranslations("impostazioni");
  const tc = useTranslations("comuni");
  const formato = useFormatter();

  const messaggi = {
    ok: t("caselle.esiti.ok"),
    gia_decisa: t("caselle.esiti.gia_decisa"),
    non_trovata: t("caselle.esiti.non_trovata"),
    non_valido: t("caselle.esiti.non_valido"),
    casella_non_pronta: t("caselle.esiti.casella_non_pronta"),
  };

  /** Pannello dell'Importazione iniziale da confermare o rinviata: è l'invito all'azione della casella. */
  const stimaDi = (casella: Casella) => {
    const fase = casella.faseImportazione;
    if (casella.stato === "scollegamento_in_corso" || (fase !== "stimata" && fase !== "rifiutata")) return null;
    const stima = stime[casella.id];
    const rinviata = fase === "rifiutata";
    // Senza accesso completo alla casella l'importazione non potrebbe leggere la posta: prima Ricollega o Autorizza.
    const accessoCompleto = casella.stato === "collegata";
    const etichetta = rinviata ? t("caselle.stima.importaOra") : t("caselle.stima.conferma");
    return (
      <div className="space-y-3 rounded-lg border border-accent/30 bg-accent-soft px-4 py-3">
        <p>
          <span className="font-medium">{rinviata ? t("caselle.stima.rinviata") : t("caselle.stima.titolo")}</span>
          {stima ? (
            <span className="text-text-muted">
              {" · "}
              {t("caselle.stima.testo", { numero: stima.numeroEmail, costo: formato.number(stima.costoStimato, opzioniImporto(stima.costoStimato)) })}
            </span>
          ) : null}
        </p>
        {importazionePossibile && accessoCompleto ? (
          <div className="flex flex-wrap items-center gap-2">
            <ModuloAzione azione={confermaImportazioneAzione} campi={{ casella: casella.id }} etichetta={etichetta} variante="primario" messaggi={messaggi} />
            {rinviata ? null : (
              <ModuloAzione
                azione={rinviaImportazioneAzione}
                campi={{ casella: casella.id }}
                etichetta={t("caselle.stima.rinvia")}
                variante="fantasma"
                messaggi={messaggi}
              />
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Pulsante variante="primario" dimensione="sm" disabled aria-describedby={`requisiti-${casella.id}`}>
              {etichetta}
            </Pulsante>
            <p id={`requisiti-${casella.id}`} className="text-xs text-text-muted">
              {accessoCompleto ? (
                <>
                  {t("caselle.stima.requisiti")}{" "}
                  <a href="#openrouter" className="text-accent-strong underline-offset-4 hover:underline">
                    {t("indice.chiave")}
                  </a>
                </>
              ) : (
                t("caselle.stima.primaAccesso")
              )}
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <Sezione id="mailboxes" titolo={t("caselle.titolo")}>
      {caselle.length === 0 ? <p className="text-text-muted">{t("caselle.nessuna")}</p> : null}
      {caselle.length > 0 ? (
        <ul className="-mt-1 divide-y divide-border">
          {caselle.map((c) => {
            const inOrdine = c.stato === "collegata" && c.lettura && c.invio;
            const riautorizza = c.stato === "da_ricollegare" || c.stato === "permessi_incompleti";
            const fase = c.faseImportazione ?? "da_stimare";
            // Con il pannello della stima la fase non si ripete nella riga.
            const mostraFase = fase !== "stimata" && fase !== "rifiutata";
            return (
              <li key={c.id} className="space-y-3 py-3 first:pt-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  {/* Con il comando per risolvere un problema, sui telefoni i pulsanti vanno sotto l'indirizzo. */}
                  <div className={cn("min-w-0 flex-1 space-y-1", riautorizza && "max-sm:basis-full")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-medium break-all">{c.indirizzo}</h4>
                      {c.stato === "collegata" ? null : (
                        <Distintivo
                          tono={c.stato === "scollegamento_in_corso" || c.stato === "scollegata" ? "neutro" : "urgente"}
                          icona={<IconaStato stato={c.stato} />}
                        >
                          {tc(`statiCasella.${c.stato}`)}
                        </Distintivo>
                      )}
                    </div>
                    <RigaMeta
                      icona={
                        inOrdine ? (
                          <>
                            <CheckCircle2 className="size-3.5 shrink-0 text-accent-strong" aria-hidden />
                            <span className="sr-only">{tc("statiCasella.collegata")}</span>
                          </>
                        ) : null
                      }
                      parti={[
                        testoCodice(t, "caselle.connettori", c.connettore, "caselle.connettori.altro"),
                        inOrdine ? t("caselle.permessiOk") : null,
                        mostraFase && c.stato !== "scollegamento_in_corso" ? (
                          <span className={fase === "errore" ? "text-danger" : undefined}>{t(`caselle.fasi.${fase}`)}</span>
                        ) : null,
                        <span>
                          {t("caselle.collegataIl")} <Istante iso={c.collegataIl} stile="data" />
                        </span>,
                      ]}
                    />
                  </div>
                  {riautorizza ? (
                    <a href={`/api/caselle/google/avvia?casella=${encodeURIComponent(c.id)}`} className={classiPulsante("primario", "sm")}>
                      {c.stato === "da_ricollegare" ? t("caselle.ricollega") : t("caselle.autorizza")}
                    </a>
                  ) : null}
                  {c.stato === "scollegamento_in_corso" ? null : (
                    <ConfermaAzione
                      discreta
                      azione={scollegaCasellaAzione}
                      campi={{ casella: c.id }}
                      etichetta={t("caselle.scollega.etichetta")}
                      titolo={t("caselle.scollega.titolo", { indirizzo: c.indirizzo })}
                      punti={[
                        t("caselle.scollega.revoca"),
                        t("caselle.scollega.dati"),
                        t("caselle.scollega.altre"),
                        t("caselle.scollega.nuovaImportazione"),
                        t("caselle.scollega.irreversibile"),
                      ]}
                      conferma={t("caselle.scollega.conferma")}
                      annulla={t("annulla")}
                      messaggi={messaggi}
                    />
                  )}
                </div>

                {c.stato === "permessi_incompleti" ? (
                  <ul className="space-y-0.5">
                    <Permesso concesso={c.lettura} etichetta={t("caselle.lettura")} testo={c.lettura ? t("caselle.concesso") : t("caselle.mancante")} />
                    <Permesso concesso={c.invio} etichetta={t("caselle.invio")} testo={c.invio ? t("caselle.concesso") : t("caselle.mancante")} />
                  </ul>
                ) : null}
                {c.stato === "da_ricollegare" ? <p className="text-text-muted">{t("caselle.ricollegaTesto")}</p> : null}
                {c.stato === "permessi_incompleti" ? <p className="text-text-muted">{t("caselle.autorizzaTesto")}</p> : null}
                {c.stato === "scollegamento_in_corso" ? <p className="text-text-muted">{t("caselle.scollegamentoInCorso")}</p> : null}

                {stimaDi(c)}
              </li>
            );
          })}
        </ul>
      ) : null}
      <div>
        <a href="/api/caselle/google/avvia" className={classiPulsante(caselle.length === 0 ? "primario" : "secondario", "sm")}>
          <Plus className="size-4" aria-hidden />
          {caselle.length === 0 ? t("caselle.collegaPrima") : t("caselle.collega")}
        </a>
      </div>
    </Sezione>
  );
}
