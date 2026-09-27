"use client";

import Link from "next/link";
import { useActionState, useId, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { confermaRianalisiAzione, stimaRianalisiAzione, type StatoStimaRianalisi } from "@/app/(app)/settings/azioni";
import type { StatoAzione } from "@/components/comuni/modulo-azione";
import { Aiuto, Etichetta, Input } from "@/components/ui/campi";
import { Pulsante } from "@/components/ui/pulsante";
import { opzioniImporto } from "./formato";

type Stima = NonNullable<NonNullable<StatoStimaRianalisi>["stima"]>;

/**
 * `nomiFunzioni`: nomi tradotti delle Funzioni AI per codice, più `altro` come riserva.
 * "Rianalizza": prima la stima (nessun modello chiamato, ambito fissato alla stima), poi la conferma
 * esplicita della richiesta stimata. Cambiare ambito o annullare scarta la stima mostrata.
 */
export function ModuloRianalisi({ pausaAttiva, nomiFunzioni }: { pausaAttiva: boolean; nomiFunzioni: Record<string, string> }) {
  const t = useTranslations("impostazioni.rianalisi");
  const ti = useTranslations("impostazioni");
  const tc = useTranslations("comuni");
  const formato = useFormatter();
  const id = useId();
  const [tipo, setTipo] = useState<"aperti" | "giorni">("aperti");
  const [giorni, setGiorni] = useState("30");
  const [statoStima, stima, stimaInCorso] = useActionState(stimaRianalisiAzione, undefined);
  const [statoConferma, conferma, confermaInCorso] = useActionState(confermaRianalisiAzione, undefined);
  const [, avvia] = useTransition();
  const [scartata, setScartata] = useState<string | null>(null);
  // Stima confermata e stato dell'azione al momento dell'invio: un esito vale solo se è arrivato dopo.
  const [confermata, setConfermata] = useState<{ richiestaId: string; prima: StatoAzione } | null>(null);

  const corrente: Stima | null = statoStima?.stima && statoStima.stima.richiestaId !== scartata ? statoStima.stima : null;
  const erroreStima = statoStima && statoStima.esito !== "ok" ? statoStima.esito : null;
  const esitoConferma =
    corrente && confermata?.richiestaId === corrente.richiestaId && statoConferma !== confermata.prima ? statoConferma?.esito : undefined;
  const avviata = esitoConferma === "ok";

  const testo = (esito: string) => (t.has(`esiti.${esito}`) ? t(`esiti.${esito}`) : tc("esiti.errore"));

  const cambiaAmbito = (nuovo: "aperti" | "giorni") => {
    setTipo(nuovo);
    if (corrente) setScartata(corrente.richiestaId);
  };

  const inviaStima = (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const dati = new FormData(evento.currentTarget);
    avvia(() => stima(dati));
  };

  const inviaConferma = (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    if (!corrente) return;
    const dati = new FormData(evento.currentTarget);
    setConfermata({ richiestaId: corrente.richiestaId, prima: statoConferma });
    avvia(() => conferma(dati));
  };

  return (
    <div className="space-y-5">
      <form onSubmit={inviaStima} className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("ambito")}</legend>
          <label className="flex items-start gap-3 rounded-lg border border-border px-4 py-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
            <input
              type="radio"
              name="ambito"
              value="aperti"
              checked={tipo === "aperti"}
              onChange={() => cambiaAmbito("aperti")}
              className="mt-1 accent-accent-strong"
            />
            <span className="space-y-0.5">
              <span className="block font-medium">{t("aperti")}</span>
              <span className="block text-xs text-text-muted">{t("apertiAiuto")}</span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-border px-4 py-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
            <input
              type="radio"
              name="ambito"
              value="giorni"
              checked={tipo === "giorni"}
              onChange={() => cambiaAmbito("giorni")}
              className="mt-1 accent-accent-strong"
            />
            <span className="block font-medium">{t("giorni")}</span>
          </label>
        </fieldset>

        {tipo === "giorni" ? (
          <div className="space-y-1.5">
            <Etichetta htmlFor={`${id}-giorni`}>{t("giorniCampo")}</Etichetta>
            <Input
              id={`${id}-giorni`}
              name="giorni"
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              step={1}
              required
              value={giorni}
              onChange={(e) => {
                setGiorni(e.target.value);
                if (corrente) setScartata(corrente.richiestaId);
              }}
              aria-describedby={`${id}-giorni-aiuto`}
              className="w-32 tabular-nums"
            />
            <Aiuto id={`${id}-giorni-aiuto`}>{t("giorniAiuto")}</Aiuto>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Pulsante type="submit" disabled={stimaInCorso}>
            {stimaInCorso ? tc("azioni.inCorso") : t("stima")}
          </Pulsante>
          <Aiuto>{t("nienteParte")}</Aiuto>
        </div>
        {erroreStima ? (
          <p role="status" className="text-sm text-danger">
            {testo(erroreStima)}
          </p>
        ) : null}
      </form>

      {corrente && avviata ? (
        <div role="status" className="flex flex-wrap items-start gap-2 rounded-lg border border-accent/30 bg-accent-soft px-4 py-3">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent-strong" aria-hidden />
          <p className="flex-1">
            {testo("ok")}{" "}
            <Link href="/status" className="text-accent-strong underline-offset-4 hover:underline">
              {t("vaiStato")}
            </Link>
          </p>
        </div>
      ) : corrente ? (
        <div className="space-y-3 rounded-lg border border-border bg-surface-muted px-4 py-4" aria-live="polite">
          <p className="text-xs text-text-muted">
            {corrente.ambito.tipo === "aperti" ? t("ambitoAperti") : t("ambitoGiorni", { giorni: corrente.ambito.giorni })}
          </p>
          <p className="text-base font-semibold">{t("numero", { numero: corrente.numeroEmail })}</p>
          {corrente.numeroEmail > 0 ? (
            <>
              <p>{t("costo", { costo: formato.number(corrente.costoStimato, opzioniImporto(corrente.costoStimato)) })}</p>
              {corrente.prezziMancanti.length > 0 ? (
                <p className="text-xs text-text-muted">
                  {t("prezziMancanti", { funzioni: corrente.prezziMancanti.map((f) => nomiFunzioni[f] ?? nomiFunzioni.altro ?? "").join(", ") })}
                </p>
              ) : null}
              {pausaAttiva ? (
                <p className="flex items-start gap-1.5 text-xs text-urgent">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {t("pausaAttiva")}
                </p>
              ) : null}
              <form onSubmit={inviaConferma} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="richiesta" value={corrente.richiestaId} />
                <Pulsante type="submit" variante="primario" disabled={confermaInCorso}>
                  {confermaInCorso ? tc("azioni.inCorso") : t("conferma")}
                </Pulsante>
                <Pulsante variante="fantasma" disabled={confermaInCorso} onClick={() => setScartata(corrente.richiestaId)}>
                  {ti("annulla")}
                </Pulsante>
                {esitoConferma && esitoConferma !== "ok" ? (
                  <span role="status" className="text-xs text-danger">
                    {testo(esitoConferma)}
                  </span>
                ) : null}
              </form>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
