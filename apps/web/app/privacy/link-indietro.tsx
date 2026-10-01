"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * "Indietro" dell'informativa: se la pagina precedente è dell'app (navigazione interna o referrer della stessa
 * origine) torna lì con la cronologia, così chi arriva da Impostazioni o dall'onboarding non perde il punto in
 * cui era; altrimenti segue `href`, calcolato dal server (impostazioni per chi ha una sessione, altrimenti accesso).
 */
export function LinkIndietro({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();
  const torna = (evento: React.MouseEvent<HTMLAnchorElement>) => {
    if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.button !== 0) return;
    try {
      const caricamento = performance.getEntriesByType("navigation")[0];
      // Se la pagina caricata dal browser non è questa, ci si è arrivati con una navigazione interna all'app.
      const navigazioneInterna = caricamento ? new URL(caricamento.name).pathname !== window.location.pathname : false;
      const referrerInterno = document.referrer !== "" && new URL(document.referrer).origin === window.location.origin;
      if ((navigazioneInterna || referrerInterno) && window.history.length > 1) {
        evento.preventDefault();
        router.back();
      }
    } catch {
      // Senza informazioni affidabili sulla pagina precedente vale il collegamento normale.
    }
  };
  return (
    <Link href={href} onClick={torna} className="-ml-2 inline-flex min-h-9 items-center rounded-md px-2 text-sm text-accent-strong underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}
