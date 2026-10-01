"use client";

import { useEffect, useState } from "react";

const EVENTO = "ec:news-annuncio";

/**
 * Regione live della pagina `/news`. Spostando un'email fuori dalle News (o annullando lo spostamento) la sua
 * riga sparisce insieme al pulsante e al suo messaggio: l'esito si annuncia qui, che resta sempre nella pagina.
 */
export function AnnuncioNews() {
  const [testo, setTesto] = useState("");
  useEffect(() => {
    let frame = 0;
    const ascolta = (e: Event) => {
      // Svuota e riscrive: due esiti uguali di seguito vengono letti entrambi.
      setTesto("");
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setTesto((e as CustomEvent<string>).detail));
    };
    window.addEventListener(EVENTO, ascolta);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener(EVENTO, ascolta);
    };
  }, []);
  return (
    <p role="status" className="sr-only">
      {testo}
    </p>
  );
}

/** Annuncia un esito nella regione live di `/news`. */
export function annuncia(testo: string) {
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: testo }));
}

/**
 * Porta il focus su `selettore` appena compare (la pagina rivalidata arriva poco dopo l'esito dell'azione),
 * altrimenti, dopo due secondi, su `riserva`. Così chi usa la tastiera non resta su una riga sparita.
 */
export function spostaFocus(selettore: string, riserva: string) {
  const inizio = performance.now();
  const prova = () => {
    const elemento = document.querySelector<HTMLElement>(selettore);
    if (elemento) return elemento.focus();
    if (performance.now() - inizio < 2000) return void requestAnimationFrame(prova);
    document.querySelector<HTMLElement>(riserva)?.focus();
  };
  prova();
}
