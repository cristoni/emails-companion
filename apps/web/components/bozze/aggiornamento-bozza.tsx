"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Aggiornamento ravvicinato della pagina di una bozza mentre qualcosa cambia sul server (generazione,
 * invio, verifica di un esito incerto). Montato solo in quegli stati, mai accanto all'editor, così non
 * interferisce con il testo che l'utente sta scrivendo. Si ferma quando la scheda non è visibile.
 */
export function AggiornamentoBozza({ intervalloMs = 3000 }: { intervalloMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalloMs);
    return () => window.clearInterval(timer);
  }, [router, intervalloMs]);
  return null;
}
