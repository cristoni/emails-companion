"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/components/ui/cn";

/** Ancore del pannello: `#perche-titolo` e `#perche-<analisi>` (vedi `ancora.perche`). */
const PREFISSO = "#perche";
const ID_PANNELLO = "perche-pannello";
/** Pulsanti che aprono e chiudono il pannello (il "Perché?" in cima alla pagina): link verso il suo titolo. */
const SELETTORE_INTERRUTTORE = 'a[href="#perche-titolo"]';
/**
 * Sotto `xl` il pannello copre la pagina ed è modale (sfondo oscurato, pagina inerte e ferma); da `xl` sta
 * accanto al contenuto, che gli fa posto (`data-perche` su `<html>`, vedi il layout dell'app), così nessun
 * comando della pagina resta nascosto sotto il pannello.
 */
const MEDIA_MODALE = "(max-width: 79.99rem)";
/** Durata della transizione del pannello (`duration-200`). */
const DURATA = 200;
/** Contenitore dell'app (barre, salto al contenuto e pagina), reso inerte mentre il pannello è modale. */
const ID_STRUTTURA = "struttura-app";

function iscriviModale(avvisa: () => void) {
  const media = window.matchMedia(MEDIA_MODALE);
  media.addEventListener("change", avvisa);
  return () => media.removeEventListener("change", avvisa);
}
const iscriviNulla = () => () => {};

/** Rende raggiungibile col fuoco un elemento che non lo è (per esempio un titolo) e gli dà il fuoco senza scorrere. */
function focalizza(elemento: HTMLElement) {
  if (elemento.tabIndex < 0 && !elemento.hasAttribute("tabindex")) elemento.setAttribute("tabindex", "-1");
  elemento.focus({ preventScroll: true });
}

/**
 * Pannello "Perché?" a comparsa, chiuso all'apertura della pagina. Lo apre qualunque link verso un'ancora
 * del pannello (il pulsante in alto e i "Perché?" accanto alle affermazioni), che porta anche alla voce
 * indicata; si chiude con la X, con Esc, con il pulsante in alto o, quando copre la pagina, con un clic sullo
 * sfondo. Alla chiusura il fuoco torna al comando che l'ha aperto e l'ancora esce dall'indirizzo, così
 * ricaricando la pagina il pannello resta chiuso.
 *
 * Il pannello è reso nel browser in fondo a `<body>`, fuori dalla pagina, così la pagina può diventare inerte
 * mentre il pannello è modale; da chiuso resta nel DOM ma inerte, così le citazioni continuano a puntare alle
 * email da cui derivano. I link interni del pannello verso la pagina (per esempio "Titolo e descrizione") chiudono il
 * pannello quando la copre, poi portano alla voce e le danno il fuoco.
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
  const pannello = useRef<HTMLDivElement>(null);
  /** Comando che ha aperto il pannello: alla chiusura riceve di nuovo il fuoco. */
  const apertoDa = useRef<HTMLElement | null>(null);
  /** Chiusura in attesa di restituire il fuoco (falso quando il fuoco va altrove, per esempio a una voce della pagina). */
  const ritorno = useRef(false);
  const apertoOra = useRef(false);
  const modaleOra = useRef(false);

  // Il pannello esiste solo nel browser, in fondo a `<body>`: il server non lo mette nella pagina, così non
  // cambia posto dopo l'idratazione (e chiuso, senza script, non servirebbe comunque).
  const nelBrowser = useSyncExternalStore(iscriviNulla, () => true, () => false);
  const modale = useSyncExternalStore(iscriviModale, () => window.matchMedia(MEDIA_MODALE).matches, () => false);
  const modaleAperto = aperto && modale;

  useEffect(() => {
    apertoOra.current = aperto;
    modaleOra.current = modale;
  }, [aperto, modale]);

  const chiudi = useCallback((restituisciFuoco = true) => {
    ritorno.current = restituisciFuoco;
    setAperto(false);
    if (window.location.hash.startsWith(PREFISSO)) {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
  }, []);

  useEffect(() => {
    const raggiungi = (ancora: string, origine: Element | null) => {
      const comando = origine instanceof HTMLElement ? origine : document.activeElement instanceof HTMLElement ? document.activeElement : null;
      // Un link interno al pannello porta a un'altra voce: il comando da cui tornare resta quello di prima.
      if (comando && comando !== document.body && !pannello.current?.contains(comando)) apertoDa.current = comando;
      setAperto(true);
      setRichiesta({ ancora, n: ++contatore.current });
    };
    if (window.location.hash.startsWith(PREFISSO)) raggiungi(window.location.hash.slice(1), null);

    const suClic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target instanceof Element ? e.target.closest('a[href^="#"]') : null;
      const href = link?.getAttribute("href");
      if (!link || !href || href === "#") return;
      const nelPannello = pannello.current?.contains(link) ?? false;

      if (href.startsWith(PREFISSO)) {
        e.preventDefault();
        // Il pulsante in alto apre e chiude il pannello.
        if (apertoOra.current && !nelPannello && link.matches(SELETTORE_INTERRUTTORE)) chiudi();
        else raggiungi(href.slice(1), link);
        return;
      }

      // Link del pannello verso una voce della pagina: la voce riceve il fuoco, e non resta sotto il pannello.
      if (!nelPannello) return;
      const bersaglio = document.getElementById(decodeURIComponent(href.slice(1)));
      if (!bersaglio) return;
      if (modaleOra.current) {
        e.preventDefault();
        chiudi(false);
        window.setTimeout(() => {
          if (window.location.hash === href) bersaglio.scrollIntoView({ block: "start" });
          else window.location.hash = href;
          focalizza(bersaglio);
        }, DURATA);
      } else {
        // Il browser porta alla voce (che sta accanto al pannello); poi la voce riceve il fuoco.
        window.setTimeout(() => focalizza(bersaglio), 0);
      }
    };

    const suTasto = (e: KeyboardEvent) => {
      if (e.key === "Escape" && apertoOra.current) {
        chiudi();
        return;
      }
      // Il pulsante in alto è un link con il ruolo di pulsante: risponde anche alla barra spaziatrice.
      if (e.key === " " && e.target instanceof HTMLElement && e.target.matches(`${SELETTORE_INTERRUTTORE}[role="button"]`)) {
        e.preventDefault();
        e.target.click();
      }
    };
    document.addEventListener("click", suClic);
    window.addEventListener("keydown", suTasto);
    return () => {
      document.removeEventListener("click", suClic);
      window.removeEventListener("keydown", suTasto);
    };
  }, [chiudi]);

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

  // Pannello aperto: la pagina gli fa posto da `xl` in su.
  useEffect(() => {
    if (!aperto) return;
    const radice = document.documentElement;
    radice.dataset.perche = "aperto";
    return () => {
      delete radice.dataset.perche;
    };
  }, [aperto]);

  // Pannello modale: il resto dell'app è inerte e la pagina sotto non scorre.
  useEffect(() => {
    if (!modaleAperto) return;
    const struttura = document.getElementById(ID_STRUTTURA);
    struttura?.setAttribute("inert", "");
    document.documentElement.classList.add("overflow-hidden");
    return () => {
      struttura?.removeAttribute("inert");
      document.documentElement.classList.remove("overflow-hidden");
    };
  }, [modaleAperto]);

  // Dopo la chiusura (e dopo che la pagina è tornata attiva) il fuoco torna al comando che ha aperto il pannello,
  // se era nel pannello o si era perso.
  useEffect(() => {
    if (aperto || !ritorno.current) return;
    ritorno.current = false;
    const attivo = document.activeElement;
    if (attivo && attivo !== document.body && !pannello.current?.contains(attivo)) return;
    const comando = apertoDa.current?.isConnected ? apertoDa.current : document.querySelector<HTMLElement>(SELETTORE_INTERRUTTORE);
    comando?.focus({ preventScroll: true });
  }, [aperto]);

  // Il pulsante in alto dice ai lettori di schermo che apre questo pannello e se è aperto.
  useEffect(() => {
    for (const comando of document.querySelectorAll<HTMLElement>(SELETTORE_INTERRUTTORE)) {
      if (pannello.current?.contains(comando)) continue;
      comando.setAttribute("role", "button");
      comando.setAttribute("aria-controls", ID_PANNELLO);
      comando.setAttribute("aria-expanded", String(aperto));
    }
  });

  const contenuto = (
    <>
      {aperto ? <div aria-hidden className="fixed inset-0 z-40 bg-black/30 xl:hidden dark:bg-black/60" onClick={() => chiudi()} /> : null}
      <div
        ref={pannello}
        id={ID_PANNELLO}
        role={modaleAperto ? "dialog" : "complementary"}
        aria-modal={modaleAperto || undefined}
        aria-labelledby="perche-titolo"
        inert={!aperto}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-border bg-surface shadow-xl duration-200 motion-reduce:transition-none",
          // `visibility` si anima solo in chiusura: in apertura il pannello è subito visibile e può ricevere il fuoco.
          aperto ? "translate-x-0 transition-transform" : "invisible translate-x-full transition-[transform,visibility]",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 id="perche-titolo" tabIndex={-1} className="flex items-center gap-1.5 text-base outline-none">
            {titolo}
          </h2>
          <button
            type="button"
            onClick={() => chiudi()}
            aria-label={etichettaChiudi}
            title={etichettaChiudi}
            className="relative -mr-1 rounded-lg p-2 text-text-muted after:absolute after:-inset-1 after:content-[''] hover:bg-surface-muted hover:text-text"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
      </div>
    </>
  );

  return nelBrowser ? createPortal(contenuto, document.body) : null;
}
