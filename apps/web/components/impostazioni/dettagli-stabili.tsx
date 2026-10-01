"use client";

import { useState } from "react";
import { Espandibile } from "@/components/ui/espandibile";

/**
 * `<details>` aperto o chiuso secondo lo stato del primo caricamento, che poi resta all'utente. Senza, un
 * `open` calcolato dai dati del server si chiuderebbe da solo dopo un salvataggio riuscito (la pagina riletta
 * non ha più il problema) e nasconderebbe l'esito appena mostrato dal modulo al suo interno.
 */
export function DettagliStabili({ apertoIniziale, className, children }: { apertoIniziale: boolean; className?: string; children: React.ReactNode }) {
  const [aperto] = useState(apertoIniziale);
  return (
    <details open={aperto} className={className}>
      {children}
    </details>
  );
}

/** `Espandibile` con la stessa regola: lo stato iniziale viene dal server, poi non cambia più da solo. */
export function EspandibileStabile({ apertoIniziale, ...props }: Omit<React.ComponentProps<typeof Espandibile>, "aperto"> & { apertoIniziale: boolean }) {
  const [aperto] = useState(apertoIniziale);
  return <Espandibile aperto={aperto} {...props} />;
}
