"use client";

import { useEffect } from "react";

/**
 * Un'ancora dentro un `<details>` chiuso (cronologia, elementi chiusi, urgenza dell'email) non sarebbe
 * visibile: all'apertura della pagina e a ogni cambio di hash apre i `<details>` che la contengono e la porta
 * in vista. Non tocca le prop di React: i `<details>` restano non controllati e sopravvivono agli aggiornamenti.
 */
export function ApriAncora() {
  useEffect(() => {
    const apri = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id || id.startsWith("perche")) return;
      const elemento = document.getElementById(id);
      if (!elemento) return;
      let chiuso = false;
      for (let d = elemento.closest("details"); d; d = d.parentElement?.closest("details") ?? null) {
        if (!d.open) {
          d.open = true;
          chiuso = true;
        }
      }
      if (chiuso) requestAnimationFrame(() => elemento.scrollIntoView({ block: "start" }));
    };
    apri();
    window.addEventListener("hashchange", apri);
    return () => window.removeEventListener("hashchange", apri);
  }, []);
  return null;
}
