"use client";

import { useActionState, useTransition } from "react";
import type { AzioneModulo } from "@/components/comuni/modulo-azione";

/**
 * Invio di un modulo a una Server Action senza il reset automatico dei campi di React 19: un errore non
 * cancella ciò che l'utente ha scritto (testo del Contesto AI, ID di un modello). Restituisce lo stato
 * dell'azione, il gestore `onSubmit` e se l'invio è in corso.
 */
export function useInvioSenzaReset(azione: AzioneModulo) {
  const [stato, esegui, inCorso] = useActionState(azione, undefined);
  const [, avvia] = useTransition();
  const onSubmit = (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const dati = new FormData(evento.currentTarget);
    avvia(() => esegui(dati));
  };
  return [stato, onSubmit, inCorso] as const;
}
