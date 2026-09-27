"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import type { FunzioneAI } from "@ec/core/dominio";
import { impostaModelloAzione } from "@/app/(app)/settings/azioni";
import { Etichetta, Input } from "@/components/ui/campi";
import { Pulsante } from "@/components/ui/pulsante";
import { cn } from "@/components/ui/cn";
import { useInvioSenzaReset } from "./usa-invio";

/** Cambio del modello OpenRouter di una Funzione AI: la verifica di compatibilità avviene sul server. */
export function ModuloModello({ funzione, modello, nomeFunzione, idAiuto }: { funzione: FunzioneAI; modello: string; nomeFunzione: string; idAiuto: string }) {
  const t = useTranslations("impostazioni.modelli");
  const tc = useTranslations("comuni");
  const [stato, onSubmit, inCorso] = useInvioSenzaReset(impostaModelloAzione);
  const id = useId();
  const esito = stato?.esito;
  const testoEsito = esito ? (t.has(`esiti.${esito}`) ? t(`esiti.${esito}`) : tc("esiti.errore")) : null;

  return (
    <form onSubmit={onSubmit} className="space-y-1.5">
      <input type="hidden" name="funzione" value={funzione} />
      <Etichetta htmlFor={`${id}-modello`} className="block text-xs font-normal text-text-muted">
        {t("campo", { funzione: nomeFunzione })}
      </Etichetta>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          key={modello}
          id={`${id}-modello`}
          name="modello"
          defaultValue={modello}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={200}
          required
          aria-describedby={idAiuto}
          className="font-mono sm:flex-1"
        />
        <Pulsante type="submit" variante="secondario" disabled={inCorso}>
          {inCorso ? tc("azioni.inCorso") : t("salva")}
        </Pulsante>
      </div>
      <p role="status" aria-live="polite" className={cn("text-xs", esito === "ok" ? "text-accent-strong" : "text-danger")}>
        {testoEsito}
      </p>
    </form>
  );
}
