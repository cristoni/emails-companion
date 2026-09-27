"use client";

import { useActionState, useId } from "react";
import { useTranslations } from "next-intl";
import { salvaChiaveAzione } from "@/app/(app)/settings/azioni";
import { Aiuto, Etichetta, Input } from "@/components/ui/campi";
import { Pulsante } from "@/components/ui/pulsante";
import { cn } from "@/components/ui/cn";

/**
 * Inserimento o sostituzione della Chiave OpenRouter: campo password senza completamento automatico.
 * L'azione restituisce solo il codice d'esito; il campo si svuota dopo ogni invio (reset del modulo).
 */
export function ModuloChiave({ haChiave }: { haChiave: boolean }) {
  const t = useTranslations("impostazioni.chiave");
  const tc = useTranslations("comuni");
  const [stato, azione, inCorso] = useActionState(salvaChiaveAzione, undefined);
  const id = useId();
  const esito = stato?.esito;
  const testoEsito = esito ? (t.has(`esiti.${esito}`) ? t(`esiti.${esito}`) : tc("esiti.errore")) : null;

  return (
    <form action={azione} className="space-y-2">
      <h3 className="text-sm font-medium">{haChiave ? t("sostituisci") : t("aggiungi")}</h3>
      <Etichetta htmlFor={`${id}-chiave`} className="block text-xs font-normal text-text-muted">
        {t("campo")}
      </Etichetta>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={`${id}-chiave`}
          name="chiave"
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={t("segnaposto")}
          aria-describedby={`${id}-consiglio`}
          maxLength={512}
          required
          className="font-mono sm:flex-1"
        />
        <Pulsante type="submit" variante="primario" disabled={inCorso}>
          {inCorso ? tc("azioni.inCorso") : t("salva")}
        </Pulsante>
      </div>
      <Aiuto id={`${id}-consiglio`}>{t("consiglio")}</Aiuto>
      <p role="status" aria-live="polite" className={cn("text-sm", esito === "valida" ? "text-accent-strong" : "text-danger")}>
        {testoEsito}
      </p>
    </form>
  );
}
