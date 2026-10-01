"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import type { FunzioneAI } from "@ec/core/dominio";
import { impostaModelloAzione } from "@/app/(app)/settings/azioni";
import { Aiuto, Etichetta, Input } from "@/components/ui/campi";
import { Pulsante } from "@/components/ui/pulsante";
import { cn } from "@/components/ui/cn";
import { useInvioSenzaReset } from "./usa-invio";

/** Cambio del modello OpenRouter di una Funzione AI: la verifica di compatibilità avviene sul server. */
export function ModuloModello({ funzione, modello, nomeFunzione }: { funzione: FunzioneAI; modello: string; nomeFunzione: string }) {
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
          aria-describedby={`${id}-aiuto`}
          className="font-mono sm:flex-1"
        />
        <Pulsante type="submit" variante="secondario" disabled={inCorso} className="shrink-0 whitespace-nowrap">
          {inCorso ? tc("azioni.inCorso") : t("salva")}
        </Pulsante>
      </div>
      <Aiuto id={`${id}-aiuto`}>{t("aiutoCampo")}</Aiuto>
      <p role="status" aria-live="polite" className={cn("text-xs", esito === "ok" ? "text-accent-strong" : "text-danger")}>
        {testoEsito}
      </p>
    </form>
  );
}
