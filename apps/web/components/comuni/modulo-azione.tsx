"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Pulsante, type VariantePulsante } from "@/components/ui/pulsante";
import { cn } from "@/components/ui/cn";
import { testoCodice } from "./codici";

/** Stato restituito da una Server Action: solo un codice d'esito, mai dati sensibili. */
export type StatoAzione = { esito: string } | undefined;
export type AzioneModulo = (stato: StatoAzione, dati: FormData) => Promise<StatoAzione>;

/**
 * Pulsante che esegue una Server Action con campi nascosti. Mentre l'azione è in corso il pulsante è
 * `aria-disabled` e ignora i clic, così un doppio clic non la ripete; non è `disabled`, che toglierebbe il
 * fuoco al pulsante premuto. Con `conferma` chiede un secondo clic esplicito: la domanda compare al posto del
 * pulsante, il fuoco passa alla conferma (che ha la domanda come descrizione) e torna al pulsante iniziale
 * quando si rinuncia o si conferma. L'esito è mostrato come testo tradotto: `messaggi` (già tradotti dalla
 * pagina), poi `comuni.esiti`, poi un errore generico.
 */
export function ModuloAzione({
  azione,
  campi = {},
  etichetta,
  variante = "secondario",
  dimensione = "sm",
  conferma,
  messaggi = {},
  mostraOk = false,
  className,
}: {
  azione: AzioneModulo;
  campi?: Record<string, string>;
  etichetta: React.ReactNode;
  variante?: VariantePulsante;
  dimensione?: "sm" | "md" | "lg";
  conferma?: { domanda: string; etichetta: string };
  messaggi?: Record<string, string>;
  mostraOk?: boolean;
  className?: string;
}) {
  const t = useTranslations("comuni");
  const [stato, esegui, inCorso] = useActionState(azione, undefined);
  const [chiedi, setChiedi] = useState(false);
  const idDomanda = useId();
  const pulsanteIniziale = useRef<HTMLButtonElement>(null);
  const pulsanteConferma = useRef<HTMLButtonElement>(null);
  const eraChiesto = useRef(false);
  const esito = stato?.esito;
  const testoEsito = esito && (esito !== "ok" || mostraOk) ? (messaggi[esito] ?? testoCodice(t, "esiti", esito, "esiti.errore")) : null;

  // La domanda sostituisce il pulsante premuto: il fuoco va alla conferma e, alla chiusura, torna al pulsante.
  useEffect(() => {
    if (chiedi) pulsanteConferma.current?.focus();
    else if (eraChiesto.current) pulsanteIniziale.current?.focus();
    eraChiesto.current = chiedi;
  }, [chiedi]);

  // Durante l'azione i pulsanti restano nel percorso del fuoco ma non rispondono (vedi `classiPulsante`).
  const occupato = inCorso || undefined;
  const bloccaSeOccupato = (e: React.MouseEvent) => {
    if (inCorso) e.preventDefault();
  };

  return (
    <form action={esegui} className={cn("inline-flex flex-wrap items-center gap-2", className)} onSubmit={() => setChiedi(false)}>
      {Object.entries(campi).map(([nome, valore]) => (
        <input key={nome} type="hidden" name={nome} value={valore} />
      ))}
      {conferma && !chiedi ? (
        <Pulsante
          ref={pulsanteIniziale}
          variante={variante}
          dimensione={dimensione}
          aria-disabled={occupato}
          aria-expanded={false}
          onClick={() => {
            if (!inCorso) setChiedi(true);
          }}
        >
          {inCorso ? t("azioni.inCorso") : etichetta}
        </Pulsante>
      ) : conferma ? (
        <>
          <span id={idDomanda} className="text-sm text-text-muted">
            {conferma.domanda}
          </span>
          <Pulsante
            ref={pulsanteConferma}
            type="submit"
            variante={variante === "pericolo" ? "pericolo" : "primario"}
            dimensione={dimensione}
            aria-describedby={idDomanda}
            aria-disabled={occupato}
            onClick={bloccaSeOccupato}
          >
            {inCorso ? t("azioni.inCorso") : conferma.etichetta}
          </Pulsante>
          <Pulsante
            variante="fantasma"
            dimensione={dimensione}
            aria-disabled={occupato}
            onClick={() => {
              if (!inCorso) setChiedi(false);
            }}
          >
            {t("azioni.rinuncia")}
          </Pulsante>
        </>
      ) : (
        <Pulsante type="submit" variante={variante} dimensione={dimensione} aria-disabled={occupato} onClick={bloccaSeOccupato}>
          {inCorso ? t("azioni.inCorso") : etichetta}
        </Pulsante>
      )}
      {testoEsito ? (
        <span role="status" className={cn("text-xs", esito === "ok" ? "text-accent-strong" : "text-danger")}>
          {testoEsito}
        </span>
      ) : null}
    </form>
  );
}
