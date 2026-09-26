"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Aggiorna i dati della pagina al ritorno sulla finestra e ogni 60 secondi (§13), senza realtime. */
export function AggiornamentoAutomatico({ intervalloMs = 60_000 }: { intervalloMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const aggiorna = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(aggiorna, intervalloMs);
    window.addEventListener("focus", aggiorna);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", aggiorna);
    };
  }, [router, intervalloMs]);
  return null;
}
