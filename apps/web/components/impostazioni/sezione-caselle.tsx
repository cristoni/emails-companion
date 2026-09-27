import { useFormatter, useTranslations } from "next-intl";
import { AlertTriangle, Check, CheckCircle2, Loader2, Plus, X } from "lucide-react";
import type { StimaImportazioneCasella, VistaImpostazioniDto } from "@ec/applicazione";
import type { StatoCasella } from "@ec/core/dominio";
import { confermaImportazioneAzione, rinviaImportazioneAzione, scollegaCasellaAzione } from "@/app/(app)/settings/azioni";
import { testoCodice } from "@/components/comuni/codici";
import { Istante } from "@/components/comuni/istante";
import { ModuloAzione } from "@/components/comuni/modulo-azione";
import { Distintivo, type TonoDistintivo } from "@/components/ui/distintivo";
import { Pulsante, classiPulsante } from "@/components/ui/pulsante";
import { StatoVuoto } from "@/components/ui/pagina";
import { ConfermaAzione } from "./conferma-azione";
import { opzioniImporto } from "./formato";
import { Dato, Sezione } from "./sezione";

type Casella = VistaImpostazioniDto["caselle"][number];

const TONO_STATO: Record<StatoCasella, TonoDistintivo> = {
  collegata: "accento",
  permessi_incompleti: "urgente",
  da_ricollegare: "urgente",
  scollegamento_in_corso: "neutro",
  scollegata: "neutro",
};

function IconaStato({ stato }: { stato: StatoCasella }) {
  if (stato === "collegata") return <CheckCircle2 className="size-3" aria-hidden />;
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

/** Sezione `#mailboxes`: stato e permessi di ogni Casella collegata, Importazione iniziale, Ricollega, Autorizza e Scollega. */
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
  };

  const stimaDi = (casella: Casella) => {
    const stima = stime[casella.id];
    const fase = casella.faseImportazione;
    if (casella.stato === "scollegamento_in_corso") return null;
    if (fase === "da_stimare" && casella.stato === "collegata") {
      return <p className="text-text-muted">{t("caselle.stima.inAttesa")}</p>;
    }
    if (fase !== "stimata" && fase !== "rifiutata") return null;
    const rinviata = fase === "rifiutata";
    // Senza accesso completo alla casella l'importazione non potrebbe leggere la posta: prima Ricollega o Autorizza.
    const accessoCompleto = casella.stato === "collegata";
    return (
      <div className="space-y-3 rounded-lg border border-accent/30 bg-accent-soft px-4 py-3">
        <div className="space-y-0.5">
          <p className="font-medium">{rinviata ? t("caselle.stima.rinviata") : t("caselle.stima.titolo")}</p>
          {stima ? (
            <p className="text-text-muted">
              {t("caselle.stima.testo", { numero: stima.numeroEmail, costo: formato.number(stima.costoStimato, opzioniImporto(stima.costoStimato)) })}
              {" · "}
              {t("caselle.stima.calcolataIl")} <Istante iso={stima.calcolataIl} stile="data_ora" />
            </p>
          ) : null}
        </div>
        {importazionePossibile && accessoCompleto ? (
          <div className="flex flex-wrap items-center gap-2">
            <ModuloAzione
              azione={confermaImportazioneAzione}
              campi={{ casella: casella.id }}
              etichetta={rinviata ? t("caselle.stima.importaOra") : t("caselle.stima.conferma")}
              variante="primario"
              messaggi={messaggi}
            />
            {rinviata ? null : <ModuloAzione azione={rinviaImportazioneAzione} campi={{ casella: casella.id }} etichetta={t("caselle.stima.rinvia")} variante="fantasma" messaggi={messaggi} />}
          </div>
        ) : (
          <div className="space-y-2">
            <Pulsante variante="primario" dimensione="sm" disabled aria-describedby={`requisiti-${casella.id}`}>
              {rinviata ? t("caselle.stima.importaOra") : t("caselle.stima.conferma")}
            </Pulsante>
            {accessoCompleto ? (
              <p id={`requisiti-${casella.id}`} className="text-xs text-text-muted">
                {t("caselle.stima.requisiti")}{" "}
                <a href="#openrouter" className="text-accent-strong underline-offset-4 hover:underline">
                  {t("indice.chiave")}
                </a>
              </p>
            ) : (
              <p id={`requisiti-${casella.id}`} className="text-xs text-text-muted">
                {t("caselle.stima.primaAccesso")}
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Sezione id="mailboxes" titolo={t("caselle.titolo")} descrizione={t("caselle.descrizione")}>
      {caselle.length === 0 ? (
        <StatoVuoto titolo={t("caselle.nessuna")}>{t("caselle.nessunaTesto")}</StatoVuoto>
      ) : (
        <ul className="space-y-4">
          {caselle.map((c) => {
            const riautorizza = c.stato === "da_ricollegare" || c.stato === "permessi_incompleti";
            return (
              <li key={c.id} className="space-y-4 rounded-lg border border-border px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1.5">
                    <h3 className="break-all font-mono text-sm font-medium">{c.indirizzo}</h3>
                    <Distintivo tono={TONO_STATO[c.stato]} icona={<IconaStato stato={c.stato} />}>
                      {tc(`statiCasella.${c.stato}`)}
                    </Distintivo>
                  </div>
                  {riautorizza ? (
                    <a href={`/api/caselle/google/avvia?casella=${encodeURIComponent(c.id)}`} className={classiPulsante("primario", "sm")}>
                      {c.stato === "da_ricollegare" ? t("caselle.ricollega") : t("caselle.autorizza")}
                    </a>
                  ) : null}
                </div>

                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Dato etichetta={t("caselle.connettore")}>{testoCodice(t, "caselle.connettori", c.connettore, "caselle.connettori.altro")}</Dato>
                  <Dato etichetta={t("caselle.permessi")}>
                    <ul className="space-y-0.5">
                      <Permesso concesso={c.lettura} etichetta={t("caselle.lettura")} testo={c.lettura ? t("caselle.concesso") : t("caselle.mancante")} />
                      <Permesso concesso={c.invio} etichetta={t("caselle.invio")} testo={c.invio ? t("caselle.concesso") : t("caselle.mancante")} />
                    </ul>
                  </Dato>
                  <Dato etichetta={t("caselle.importazione")}>
                    {tc(`fasiImportazione.${c.faseImportazione ?? "da_stimare"}`)}
                  </Dato>
                  <Dato etichetta={t("caselle.collegataIl")}>
                    <Istante iso={c.collegataIl} stile="data" />
                  </Dato>
                </dl>

                {c.stato === "da_ricollegare" ? <p className="text-text-muted">{t("caselle.ricollegaTesto")}</p> : null}
                {c.stato === "permessi_incompleti" ? <p className="text-text-muted">{t("caselle.autorizzaTesto")}</p> : null}
                {c.stato === "scollegamento_in_corso" ? <p className="text-text-muted">{t("caselle.scollegamentoInCorso")}</p> : null}

                {stimaDi(c)}

                {c.stato === "scollegamento_in_corso" ? null : (
                  <div className="border-t border-border pt-4">
                    <ConfermaAzione
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
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div>
        <a href="/api/caselle/google/avvia" className={classiPulsante("secondario", "md")}>
          <Plus className="size-4" aria-hidden />
          {t("caselle.collega")}
        </a>
      </div>
    </Sezione>
  );
}
