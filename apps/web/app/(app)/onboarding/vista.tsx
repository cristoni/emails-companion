import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { AREA_TOCCO } from "@/components/impostazioni/classi";
import { opzioniImporto } from "@/components/impostazioni/formato";
import { CLASSE_LINK_AZIONE } from "@/components/ui/collegamento";
import { classiPulsante } from "@/components/ui/pulsante";
import { IntestazionePagina } from "@/components/ui/pagina";
import { Scheda } from "@/components/ui/scheda";
import { cn } from "@/components/ui/cn";
import { decidiImportazioneAzione } from "./azioni";
import { ModuloChiave, ModuloContesto, PulsanteInformativa } from "./moduli";
import { Passo, type StatoPasso } from "./passo";

/** Dati dell'onboarding già letti dal server: solo stati e ultime cifre della chiave, mai il suo valore. */
export interface DatiOnboarding {
  consenso: boolean;
  chiave: { stato: string; ultimeCifre: string } | null;
  /** Testo del Contesto AI salvato; null se valgono le Direttive predefinite (anche se salvate come versione). */
  contesto: string | null;
  predefinite: string;
  caselle: { id: string; indirizzo: string; stato: string; fase: string | null; stima: { numeroEmail: number; costoStimato: number } | null }[];
  importazioniDecise: boolean;
  essenziale: boolean;
  completo: boolean;
}

const PASSI_OBBLIGATORI = ["informativa", "chiave", "importazione"] as const;

/**
 * Onboarding in passi: informativa (1), chiave OpenRouter (2), Contesto AI (facoltativo, senza numero) e
 * Importazione iniziale (3). È aperto solo il primo passo obbligatorio non completato; i passi completati si
 * chiudono sul titolo con la spunta (più, se serve, una riga di riepilogo) e si riaprono con "Modifica" o
 * "Rivedi". Il Contesto AI non blocca e non
 * conta nel progresso.
 */
export async function VistaOnboarding({ dati }: { dati: DatiOnboarding }) {
  const t = await getTranslations("onboarding");
  const formato = await getFormatter();
  const chiaveOk = dati.chiave?.stato === "valida";
  const fatti = {
    informativa: dati.consenso,
    chiave: chiaveOk,
    importazione: dati.importazioniDecise && dati.caselle.length > 0,
  };
  const attuale = PASSI_OBBLIGATORI.find((p) => !fatti[p]) ?? null;
  const stato = (passo: (typeof PASSI_OBBLIGATORI)[number]): StatoPasso => (fatti[passo] ? "fatto" : passo === attuale ? "attuale" : "dopo");
  const numeroFatti = PASSI_OBBLIGATORI.filter((p) => fatti[p]).length;
  const etichette = { fatto: t("fatto"), daFare: t("daFare") };
  const fase = (f: string | null) => t(`importazione.fasi.${f ?? "da_stimare"}`);
  const puoImportare = chiaveOk && dati.consenso;

  return (
    <div className="space-y-4">
      <IntestazionePagina
        titolo={t("titolo")}
        azioni={
          <div className="flex items-center gap-3">
            <div aria-hidden className="grid w-24 grid-cols-3 gap-1">
              {PASSI_OBBLIGATORI.map((p) => (
                <span key={p} className={cn("h-1.5 rounded-full", fatti[p] ? "bg-accent" : "bg-border")} />
              ))}
            </div>
            <p className="text-xs text-text-muted tabular-nums">{t("progresso", { fatti: numeroFatti, totale: PASSI_OBBLIGATORI.length })}</p>
          </div>
        }
      />

      <Scheda>
        <ol className="divide-y divide-border">
          <Passo
            numero={1}
            stato={stato("informativa")}
            titolo={t("informativa.titolo")}
            apri={t("rivedi")}
            etichette={etichette}
          >
            <ul className="list-disc space-y-1 pl-5 text-text-muted">
              <li>{t("informativa.dati")}</li>
              <li>{t("informativa.modelli")}</li>
              <li>{t("informativa.conservazione")}</li>
              <li>{t("informativa.limitedUse")}</li>
            </ul>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {dati.consenso ? null : <PulsanteInformativa etichetta={t("informativa.accetta")} />}
              <Link href="/privacy" className={cn(CLASSE_LINK_AZIONE, AREA_TOCCO)}>
                {t("informativa.completa")}
              </Link>
            </div>
          </Passo>

          <Passo
            numero={2}
            stato={stato("chiave")}
            titolo={t("chiave.titolo")}
            riepilogo={dati.chiave ? t("chiave.salvata", { cifre: dati.chiave.ultimeCifre, stato: t(`chiave.stati.${dati.chiave.stato}`) }) : undefined}
            apri={t("modifica")}
            etichette={etichette}
          >
            {stato("chiave") === "dopo" ? null : (
              <>
                {dati.chiave ? null : <p className="text-text-muted">{t("chiave.spiegazione")}</p>}
                <ModuloChiave />
              </>
            )}
          </Passo>

          <Passo
            stato="facoltativo"
            completato={dati.contesto !== null}
            titolo={t("contesto.titolo")}
            facoltativo={t("facoltativo")}
            riepilogo={dati.contesto !== null ? t("contesto.personali") : t("contesto.predefinite")}
            apri={t("personalizza")}
            etichette={etichette}
          >
            <p className="text-text-muted">{t("contesto.spiegazione")}</p>
            <ModuloContesto iniziale={dati.contesto ?? dati.predefinite} />
          </Passo>

          <Passo
            numero={3}
            stato={stato("importazione")}
            titolo={t("importazione.titolo")}
            riepilogo={
              fatti.importazione ? dati.caselle.map((c) => (c.fase === "completata" ? c.indirizzo : `${c.indirizzo} · ${fase(c.fase)}`)).join("; ") : undefined
            }
            apri={t("rivedi")}
            etichette={etichette}
          >
            {stato("importazione") === "dopo" ? null : (
              <>
                <p className="text-text-muted">{t("importazione.spiegazione")}</p>
                {dati.caselle.length === 0 ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <p>{t("importazione.nessunaCasella")}</p>
                    <a href="/api/caselle/google/avvia" className={classiPulsante("primario", "sm")}>
                      <Plus className="size-4" aria-hidden />
                      {t("importazione.collega")}
                    </a>
                  </div>
                ) : null}
                {dati.caselle.map((casella) => {
                  const daDecidere = casella.fase === "stimata" || casella.fase === "rifiutata";
                  const pronta = puoImportare && casella.stato === "collegata";
                  return (
                    <div key={casella.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-medium break-all">{casella.indirizzo}</p>
                        <p className="text-text-muted">
                          {casella.fase === "stimata" && casella.stima
                            ? t("importazione.stima", {
                                numero: casella.stima.numeroEmail,
                                costo: formato.number(casella.stima.costoStimato, opzioniImporto(casella.stima.costoStimato)),
                              })
                            : fase(casella.fase)}
                        </p>
                        {daDecidere && !pronta ? (
                          <p id={`requisiti-${casella.id}`} className="text-xs text-text-muted">
                            {casella.stato === "collegata" ? t("importazione.requisiti") : t("importazione.primaAccesso")}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {daDecidere ? (
                          <form action={decidiImportazioneAzione} className="flex gap-2">
                            <input type="hidden" name="casella" value={casella.id} />
                            <button
                              name="scelta"
                              value="conferma"
                              className={classiPulsante("primario", "sm")}
                              disabled={!pronta}
                              aria-describedby={pronta ? undefined : `requisiti-${casella.id}`}
                            >
                              {t("importazione.conferma")}
                            </button>
                            {casella.fase === "stimata" ? (
                              <button name="scelta" value="rinvia" className={classiPulsante("fantasma", "sm")}>
                                {t("importazione.rinvia")}
                              </button>
                            ) : null}
                          </form>
                        ) : null}
                        {casella.stato !== "collegata" ? (
                          <a href={`/api/caselle/google/avvia?casella=${encodeURIComponent(casella.id)}`} className={classiPulsante("secondario", "sm")}>
                            {t("importazione.autorizza")}
                          </a>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </Passo>
        </ol>
      </Scheda>

      <div className="flex justify-end pt-2">
        {dati.essenziale ? (
          <Link href="/" className={classiPulsante(dati.completo ? "primario" : "secondario")}>
            {dati.completo ? t("vaiHome") : t("vaiHomeComunque")}
          </Link>
        ) : (
          <p className="text-sm text-text-muted">{t("requisitiHome")}</p>
        )}
      </div>
    </div>
  );
}
