"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import type { Priorita } from "@ec/core/dominio";
import { testoCodice } from "@/components/comuni/codici";
import type { StatoAzione } from "@/components/comuni/modulo-azione";
import { Aiuto, AreaTesto, Etichetta, Input, Selezione } from "@/components/ui/campi";
import { Pulsante } from "@/components/ui/pulsante";
import { modificaAttivitaAzione } from "@/app/(app)/situations/[id]/azioni";

/** Solo tipi dal dominio nel bundle del browser: l'elenco è ricontrollato dalla Server Action. */
const PRIORITA: readonly Priorita[] = ["alta", "media", "bassa"];

/**
 * Modifica in linea di un'Attività: descrizione, scadenza e priorità. La scadenza è una data di calendario
 * (mezzanotte UTC, come quelle estratte dall'AI); lasciarla vuota la toglie. Ogni modifica è una correzione
 * annullabile. Riceve solo dati serializzabili.
 */
export function ModificaAttivita({
  attivitaId,
  descrizione,
  lingua,
  scadenza,
  priorita,
}: {
  attivitaId: string;
  descrizione: string;
  lingua: string;
  /** Data `YYYY-MM-DD` mostrata nel campo, o stringa vuota. */
  scadenza: string;
  priorita: Priorita;
}) {
  const t = useTranslations("situazione.attivita.modifica");
  const tc = useTranslations("comuni");
  const id = useId();
  const [aperto, setAperto] = useState(false);
  // Alla chiusura il pulsante "Modifica" torna al suo posto: il focus ci ritorna, invece di finire sul body.
  const [rifocalizza, setRifocalizza] = useState(false);
  const contenitore = useRef<HTMLSpanElement>(null);
  const chiudi = () => {
    setAperto(false);
    setRifocalizza(true);
  };
  useEffect(() => {
    if (aperto || !rifocalizza) return;
    contenitore.current?.querySelector("button")?.focus();
    setRifocalizza(false);
  }, [aperto, rifocalizza]);
  const [stato, azione, inCorso] = useActionState(async (precedente: StatoAzione, dati: FormData) => {
    const esito = await modificaAttivitaAzione(precedente, dati);
    if (esito?.esito === "ok") chiudi();
    return esito;
  }, undefined);

  if (!aperto) {
    return (
      <span ref={contenitore} className="inline-flex flex-wrap items-center gap-2">
        <Pulsante dimensione="sm" onClick={() => setAperto(true)}>
          <Pencil className="size-3.5" aria-hidden />
          {t("apri")}
        </Pulsante>
        {stato?.esito === "ok" ? (
          <span role="status" className="text-xs text-accent-strong">
            {t("salvata")}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <form id={`${id}-modulo`} action={azione} className="w-full space-y-3 rounded-lg border border-border bg-surface-muted p-3">
      <input type="hidden" name="attivita" value={attivitaId} />
      <input type="hidden" name="descrizioneIniziale" value={descrizione} />
      <input type="hidden" name="scadenzaIniziale" value={scadenza} />
      <div className="space-y-1.5">
        <Etichetta htmlFor={`${id}-descrizione`}>{t("descrizione")}</Etichetta>
        <AreaTesto
          id={`${id}-descrizione`}
          name="descrizione"
          defaultValue={descrizione}
          lang={lingua}
          dir="auto"
          // Il modulo si apre solo su richiesta dell'utente: il focus va al primo campo.
          autoFocus
          required
          maxLength={1000}
          rows={3}
          className="min-h-20 font-sans text-sm"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Etichetta htmlFor={`${id}-scadenza`}>{t("scadenza")}</Etichetta>
          <Input id={`${id}-scadenza`} name="scadenza" type="date" defaultValue={scadenza} aria-describedby={`${id}-scadenza-aiuto`} />
          <Aiuto id={`${id}-scadenza-aiuto`}>{t("scadenzaAiuto")}</Aiuto>
        </div>
        <div className="space-y-1.5">
          <Etichetta htmlFor={`${id}-priorita`}>{t("priorita")}</Etichetta>
          <Selezione id={`${id}-priorita`} name="priorita" defaultValue={priorita}>
            {PRIORITA.map((p) => (
              <option key={p} value={p}>
                {tc(`priorita.${p}`)}
              </option>
            ))}
          </Selezione>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Pulsante type="submit" variante="primario" dimensione="sm" disabled={inCorso}>
          {inCorso ? tc("azioni.inCorso") : t("salva")}
        </Pulsante>
        <Pulsante variante="fantasma" dimensione="sm" disabled={inCorso} onClick={chiudi}>
          {t("chiudi")}
        </Pulsante>
        {stato && stato.esito !== "ok" ? (
          <span role="status" className="text-xs text-danger">
            {testoCodice(tc, "esiti", stato.esito, "esiti.errore")}
          </span>
        ) : null}
      </div>
    </form>
  );
}
