"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { AzioneModulo } from "@/components/comuni/modulo-azione";
import { testoCodice } from "@/components/comuni/codici";
import { Pulsante, type VariantePulsante } from "@/components/ui/pulsante";
import { cn } from "@/components/ui/cn";

/**
 * Azione che chiede una conferma esplicita in un pannello che ne elenca le conseguenze (per esempio
 * scollegare una casella o rimuovere la chiave). Il primo pulsante apre il pannello, solo il secondo invia
 * l'azione. L'esito è un codice tradotto con `messaggi`, poi con `comuni.esiti`.
 *
 * Con `discreta` il primo pulsante è un comando secondario (testo rosso senza riempimento) allineato a
 * destra, e il pannello aperto occupa tutta la riga anche dentro un contenitore flessibile che va a capo:
 * le azioni distruttive non sono più evidenti di quelle utili. Pannello e conferma restano quelli pericolosi.
 */
export function ConfermaAzione({
  azione,
  campi = {},
  etichetta,
  titolo,
  punti,
  conferma,
  annulla,
  variante = "pericolo",
  discreta = false,
  messaggi = {},
  className,
}: {
  azione: AzioneModulo;
  campi?: Record<string, string>;
  etichetta: string;
  titolo: string;
  punti: string[];
  conferma: string;
  annulla: string;
  variante?: VariantePulsante;
  discreta?: boolean;
  messaggi?: Record<string, string>;
  className?: string;
}) {
  const t = useTranslations("comuni");
  const [stato, esegui, inCorso] = useActionState(azione, undefined);
  const [aperto, setAperto] = useState(false);
  const idTitolo = useId();
  const idPulsante = useId();
  const pannello = useRef<HTMLDivElement>(null);
  const eraAperto = useRef(false);

  // All'apertura il focus va al pannello; alla chiusura torna al pulsante che l'ha aperto.
  useEffect(() => {
    if (aperto) pannello.current?.focus();
    else if (eraAperto.current) document.getElementById(idPulsante)?.focus();
    eraAperto.current = aperto;
  }, [aperto, idPulsante]);

  // Dopo un esito positivo il pannello si chiude: la pagina, rivalidata, mostra il nuovo stato.
  useEffect(() => {
    if (stato?.esito === "ok") setAperto(false);
  }, [stato]);

  const esito = stato?.esito;
  const testoEsito = esito && esito !== "ok" ? (messaggi[esito] ?? testoCodice(t, "esiti", esito, "esiti.errore")) : null;
  const pericolosa = variante === "pericolo" || discreta;

  if (!aperto) {
    return (
      <div className={cn(discreta ? "-my-1.5 ml-auto flex flex-col items-end gap-1" : "space-y-2", className)}>
        <Pulsante
          id={idPulsante}
          variante={discreta ? "fantasma" : variante}
          dimensione="sm"
          onClick={() => setAperto(true)}
          aria-expanded={false}
          // Il margine negativo allinea il testo rosso al bordo del contenuto, come gli altri comandi a destra.
          className={discreta ? "-mr-3 text-danger hover:bg-danger-soft hover:text-danger" : undefined}
        >
          {etichetta}
        </Pulsante>
        {testoEsito ? (
          <p role="status" className="text-xs text-danger">
            {testoEsito}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={pannello}
      tabIndex={-1}
      role="group"
      aria-labelledby={idTitolo}
      className={cn(
        "space-y-3 rounded-lg border px-4 py-3 text-sm",
        pericolosa ? "border-danger/30 bg-danger-soft" : "border-border bg-surface-muted",
        discreta && "basis-full",
        className,
      )}
    >
      <p id={idTitolo} className="font-medium text-text">
        {titolo}
      </p>
      <ul className="list-disc space-y-1 pl-5 text-text-muted">
        {punti.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <form action={esegui} className="flex flex-wrap items-center gap-2">
        {Object.entries(campi).map(([nome, valore]) => (
          <input key={nome} type="hidden" name={nome} value={valore} />
        ))}
        <Pulsante type="submit" variante={pericolosa ? "pericolo" : "primario"} dimensione="sm" disabled={inCorso}>
          {inCorso ? t("azioni.inCorso") : conferma}
        </Pulsante>
        <Pulsante variante="fantasma" dimensione="sm" disabled={inCorso} onClick={() => setAperto(false)}>
          {annulla}
        </Pulsante>
        {testoEsito ? (
          <span role="status" className="text-xs text-danger">
            {testoEsito}
          </span>
        ) : null}
      </form>
    </div>
  );
}
