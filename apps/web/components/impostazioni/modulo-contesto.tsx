"use client";

import { useId, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { salvaContestoAzione } from "@/app/(app)/settings/azioni";
import { Aiuto, AreaTesto, Etichetta } from "@/components/ui/campi";
import { Pulsante } from "@/components/ui/pulsante";
import { cn } from "@/components/ui/cn";
import { useInvioSenzaReset } from "./usa-invio";

const MASSIMO = 20_000;

/**
 * Modifica del Contesto AI: ogni salvataggio crea una nuova versione. Il testo è controllato, così un
 * errore del salvataggio non cancella ciò che l'utente ha scritto; quando cambia la versione corrente
 * (salvataggio o ripristino) il campo riparte dal nuovo testo.
 */
export function ModuloContesto({ iniziale, idAiuto }: { iniziale: string; idAiuto: string }) {
  const t = useTranslations("impostazioni.contesto");
  const tc = useTranslations("comuni");
  const formato = useFormatter();
  const [stato, onSubmit, inCorso] = useInvioSenzaReset(salvaContestoAzione);
  const [testo, setTesto] = useState(iniziale);
  const [precedente, setPrecedente] = useState(iniziale);
  if (iniziale !== precedente) {
    setPrecedente(iniziale);
    setTesto(iniziale);
  }
  const id = useId();
  const esito = stato?.esito;
  const modificato = testo !== iniziale;
  const testoEsito = !esito || (esito === "ok" && modificato) ? null : t.has(`esiti.${esito}`) ? t(`esiti.${esito}`) : tc("esiti.errore");

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <Etichetta htmlFor={`${id}-contesto`}>{t("campo")}</Etichetta>
      <AreaTesto
        id={`${id}-contesto`}
        name="contesto"
        value={testo}
        onChange={(e) => setTesto(e.target.value)}
        rows={14}
        maxLength={MASSIMO}
        aria-describedby={idAiuto}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Aiuto>
          {formato.number(testo.length)} / {formato.number(MASSIMO)}
        </Aiuto>
        <div className="flex flex-wrap items-center gap-3">
          <span role="status" aria-live="polite" className={cn("text-xs", esito === "ok" ? "text-accent-strong" : "text-danger")}>
            {testoEsito}
          </span>
          <Pulsante type="submit" variante="primario" disabled={inCorso || !testo.trim()}>
            {inCorso ? tc("azioni.inCorso") : t("salva")}
          </Pulsante>
        </div>
      </div>
    </form>
  );
}
