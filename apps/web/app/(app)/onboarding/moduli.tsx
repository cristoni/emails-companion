"use client";

import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Aiuto, AreaTesto, Etichetta, Input } from "@/components/ui/campi";
import { Pulsante } from "@/components/ui/pulsante";
import { useInvioSenzaReset } from "@/components/impostazioni/usa-invio";
import { accettaInformativaAzione, salvaChiaveAzione, salvaContestoAzione } from "./azioni";

export function PulsanteInformativa({ etichetta }: { etichetta: string }) {
  const [inCorso, avvia] = useTransition();
  return (
    <Pulsante variante="primario" disabled={inCorso} onClick={() => avvia(async () => void (await accettaInformativaAzione()))}>
      {etichetta}
    </Pulsante>
  );
}

export function ModuloChiave() {
  const t = useTranslations("onboarding.chiave");
  const [stato, azione, inCorso] = useActionState(salvaChiaveAzione, undefined);
  return (
    <form action={azione} className="max-w-xl space-y-1.5">
      <Etichetta htmlFor="chiave" className="block text-xs font-normal text-text-muted">
        {t("etichetta")}
      </Etichetta>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="chiave"
          name="chiave"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-or-v1-…"
          aria-describedby="chiave-consiglio"
          required
          className="font-mono sm:flex-1"
        />
        <Pulsante type="submit" variante="primario" disabled={inCorso} className="shrink-0 whitespace-nowrap">
          {t("verifica")}
        </Pulsante>
      </div>
      <Aiuto id="chiave-consiglio">{t("consiglio")}</Aiuto>
      {stato ? (
        <p role="status" className={stato.esito === "valida" ? "text-accent-strong" : "text-danger"}>
          {t.has(`esiti.${stato.esito}`) ? t(`esiti.${stato.esito}`) : t("esiti.errore")}
        </p>
      ) : null}
    </form>
  );
}

/**
 * Contesto AI dell'onboarding: testo controllato, così un errore del salvataggio non cancella ciò che l'utente
 * ha scritto (niente reset automatico del modulo); "Salva" si attiva solo dopo una modifica, per non creare una
 * versione identica alle direttive in uso. Dopo il salvataggio il campo riparte dal testo salvato.
 */
export function ModuloContesto({ iniziale }: { iniziale: string }) {
  const t = useTranslations("onboarding.contesto");
  const [stato, onSubmit, inCorso] = useInvioSenzaReset(salvaContestoAzione);
  const [testo, setTesto] = useState(iniziale);
  const [precedente, setPrecedente] = useState(iniziale);
  if (iniziale !== precedente) {
    setPrecedente(iniziale);
    setTesto(iniziale);
  }
  const modificato = testo !== iniziale;
  const esito = stato?.esito;
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <Etichetta htmlFor="contesto" className="sr-only">
        {t("etichetta")}
      </Etichetta>
      <AreaTesto
        id="contesto"
        name="contesto"
        value={testo}
        onChange={(e) => setTesto(e.target.value)}
        rows={16}
        maxLength={20_000}
        className="field-sizing-content max-h-[60vh] min-h-64 font-sans text-sm sm:max-h-[36rem]"
      />
      <div className="flex items-center gap-3">
        <Pulsante type="submit" variante="primario" dimensione="sm" disabled={inCorso || !modificato || !testo.trim()}>
          {t("salva")}
        </Pulsante>
        <span role="status" aria-live="polite" className={esito === "ok" ? "text-accent-strong" : "text-danger"}>
          {esito === "ok" ? (modificato ? null : t("salvato")) : esito ? t(esito === "troppo_lungo" || esito === "vuoto" ? `esiti.${esito}` : "esiti.errore") : null}
        </span>
      </div>
    </form>
  );
}
