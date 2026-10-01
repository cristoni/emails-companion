"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/components/ui/cn";

/** Ancore del pannello: `#perche-titolo` e `#perche-<analisi>` (vedi `ancora.perche`). */
const PREFISSO = "#perche";

/**
 * Pannello "Perché?" a comparsa, chiuso all'apertura della pagina. Lo apre qualunque link verso un'ancora
 * del pannello (il pulsante in alto e i "Perché?" accanto alle affermazioni), che porta anche alla voce
 * indicata; si chiude con la X, con Esc o, su schermi stretti, con un clic sullo sfondo. Da chiuso resta nel
 * DOM ma inerte, così le citazioni continuano a puntare alle email da cui derivano.
 */
export function CassettoPerche({
  titolo,
  etichettaChiudi,
  children,
}: {
  titolo: React.ReactNode;
  etichettaChiudi: string;
  children: React.ReactNode;
}) {
  const [aperto, setAperto] = useState(false);
  const [richiesta, setRichiesta] = useState<{ ancora: string; n: number } | null>(null);
  const contatore = useRef(0);

  useEffect(() => {
    const raggiungi = (ancora: string) => {
      setAperto(true);
      setRichiesta({ ancora, n: ++contatore.current });
    };
    if (window.location.hash.startsWith(PREFISSO)) raggiungi(window.location.hash.slice(1));

    const suClic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target instanceof Element ? e.target.closest(`a[href^="${PREFISSO}"]`) : null;
      const href = link?.getAttribute("href");
      if (!href) return;
      e.preventDefault();
      raggiungi(href.slice(1));
    };
    const suTasto = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAperto(false);
    };
    document.addEventListener("click", suClic);
    window.addEventListener("keydown", suTasto);
    return () => {
      document.removeEventListener("click", suClic);
      window.removeEventListener("keydown", suTasto);
    };
  }, []);

  // Dopo l'apertura: porta alla voce richiesta e le dà il fuoco; l'hash aggiornato la evidenzia (`:target`).
  useEffect(() => {
    if (!aperto || !richiesta) return;
    const cornice = requestAnimationFrame(() => {
      const elemento = document.getElementById(richiesta.ancora);
      if (!elemento) return;
      if (window.location.hash !== `#${richiesta.ancora}`) window.location.hash = richiesta.ancora;
      elemento.scrollIntoView({ block: "start" });
      elemento.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(cornice);
  }, [aperto, richiesta]);

  return (
    <>
      {aperto ? <div aria-hidden className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setAperto(false)} /> : null}
      <aside
        aria-labelledby="perche-titolo"
        inert={!aperto}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-border bg-surface shadow-xl transition-transform duration-200",
          aperto ? "translate-x-0" : "invisible translate-x-full",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 id="perche-titolo" tabIndex={-1} className="flex items-center gap-1.5 text-base outline-none">
            {titolo}
          </h2>
          <button
            type="button"
            onClick={() => setAperto(false)}
            aria-label={etichettaChiudi}
            className="rounded-lg p-1.5 text-text-muted hover:bg-surface-muted hover:text-text"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </aside>
    </>
  );
}
