"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { Sezione } from "./sezione";

/**
 * Sezione con titolo e riga di stato sempre visibili e il contenuto (modulo, cronologia) a richiesta, aperto
 * dal comando a destra del titolo, lo stesso "Personalizza ⌄" dell'onboarding. Chiusa al caricamento; poi lo
 * stato resta all'utente, così la pagina riletta dopo un salvataggio non nasconde l'esito appena mostrato.
 * Il titolo resta un vero titolo di sezione (fuori dal comando), raggiungibile con la navigazione per titoli.
 */
export function SezioneApribile({
  id,
  titolo,
  descrizione,
  etichetta,
  children,
}: {
  id: string;
  titolo: React.ReactNode;
  descrizione?: React.ReactNode;
  etichetta: string;
  children: React.ReactNode;
}) {
  const [aperto, setAperto] = useState(false);
  const idContenuto = `${id}-contenuto`;
  return (
    <Sezione
      id={id}
      // La distanza dal titolo la dà il contenuto: chiuso, la sezione finisce subito sotto la riga di stato.
      className="space-y-0"
      titolo={titolo}
      descrizione={descrizione}
      azioni={
        <button
          type="button"
          aria-expanded={aperto}
          aria-controls={idContenuto}
          onClick={() => setAperto((a) => !a)}
          // Il margine negativo allinea il testo al bordo del contenuto, come gli altri comandi a destra.
          className="-mr-2 inline-flex h-9 items-center gap-0.5 rounded-md px-2 text-xs font-medium text-accent-strong hover:bg-surface-muted"
        >
          {etichetta}
          <ChevronDown className={cn("size-3.5 transition-transform", aperto && "rotate-180")} aria-hidden />
        </button>
      }
    >
      <div id={idContenuto} hidden={!aperto} className="mt-4 space-y-4">
        {children}
      </div>
    </Sezione>
  );
}
