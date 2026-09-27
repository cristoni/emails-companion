"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Pulsante, type VariantePulsante } from "@/components/ui/pulsante";
import { cn } from "@/components/ui/cn";
import { testoCodice } from "./codici";

/** Stato restituito da una Server Action: solo un codice d'esito, mai dati sensibili. */
export type StatoAzione = { esito: string } | undefined;
export type AzioneModulo = (stato: StatoAzione, dati: FormData) => Promise<StatoAzione>;

/**
 * Pulsante che esegue una Server Action con campi nascosti. Disabilitato mentre l'azione è in corso, così
 * un doppio clic non la ripete. Con `conferma` chiede un secondo clic esplicito. L'esito è mostrato come
 * testo tradotto: `messaggi` (già tradotti dalla pagina), poi `comuni.esiti`, poi un errore generico.
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
  const esito = stato?.esito;
  const testoEsito = esito && (esito !== "ok" || mostraOk) ? (messaggi[esito] ?? testoCodice(t, "esiti", esito, "esiti.errore")) : null;

  return (
    <form action={esegui} className={cn("inline-flex flex-wrap items-center gap-2", className)} onSubmit={() => setChiedi(false)}>
      {Object.entries(campi).map(([nome, valore]) => (
        <input key={nome} type="hidden" name={nome} value={valore} />
      ))}
      {conferma && !chiedi ? (
        <Pulsante variante={variante} dimensione={dimensione} disabled={inCorso} onClick={() => setChiedi(true)}>
          {etichetta}
        </Pulsante>
      ) : conferma ? (
        <>
          <span className="text-sm text-text-muted">{conferma.domanda}</span>
          <Pulsante type="submit" variante={variante === "pericolo" ? "pericolo" : "primario"} dimensione={dimensione} disabled={inCorso}>
            {inCorso ? t("azioni.inCorso") : conferma.etichetta}
          </Pulsante>
          <Pulsante variante="fantasma" dimensione={dimensione} disabled={inCorso} onClick={() => setChiedi(false)}>
            {t("azioni.annulla")}
          </Pulsante>
        </>
      ) : (
        <Pulsante type="submit" variante={variante} dimensione={dimensione} disabled={inCorso}>
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
