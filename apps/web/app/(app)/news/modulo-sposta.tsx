"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Undo2 } from "lucide-react";
import { testoCodice } from "@/components/comuni/codici";
import type { StatoAzione } from "@/components/comuni/modulo-azione";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { Espandibile } from "@/components/ui/espandibile";
import { Pulsante } from "@/components/ui/pulsante";
import { cn } from "@/components/ui/cn";
import { annullaSpostamentoAzione, spostaFuoriDalleNewsAzione } from "@/components/home/azioni";
import { annuncia, spostaFocus } from "./annuncio";

/** Categorie verso cui un'email può uscire dalle News (etichette da `comuni.categorie`). */
const CATEGORIE = ["operativa", "informativa"] as const;

/** Esito di un'azione di questa pagina, accanto al pulsante: errori e attesa; il successo si annuncia nella pagina. */
function Esito({ esito, inCorso, ok, className }: { esito: string | undefined; inCorso: boolean; ok: string; className?: string }) {
  const tc = useTranslations("comuni");
  if (esito) {
    return (
      <span role="status" className={cn("text-xs", esito === "ok" ? "text-accent-strong" : "text-danger", className)}>
        {esito === "ok" ? ok : testoCodice(tc, "esiti", esito, "esiti.errore")}
      </span>
    );
  }
  return inCorso ? (
    <span role="status" className={cn("text-xs text-text-muted", className)}>
      {tc("azioni.inCorso")}
    </span>
  ) : null;
}

/**
 * "Non è una News?": correzione a richiesta, chiusa di default. Ogni pulsante invia direttamente la nuova
 * categoria (il pulsante premuto entra nel FormData come `categoria`) e dice in una riga attenuata che cosa
 * succede dopo, così non si sceglie a caso tra due nomi simili; sotto, che lo spostamento si può annullare.
 * Il nome accessibile del pulsante è solo la categoria; la spiegazione e l'oggetto sono la descrizione.
 * Chiusa sta in fondo alla riga dell'anteprima; aperta va a capo su tutta la larghezza. Dopo lo spostamento
 * la riga sparisce: l'esito si annuncia nella pagina e il focus passa alle "Spostate di recente", da cui si
 * può annullare.
 */
export function ModuloSpostaNews({ emailId, oggetto, descrittoDa, className }: { emailId: string; oggetto: string; descrittoDa?: string; className?: string }) {
  const t = useTranslations("news.sposta");
  const tc = useTranslations("comuni");
  const [stato, esegui, inCorso] = useActionState(async (precedente: StatoAzione, dati: FormData) => {
    const risultato = await spostaFuoriDalleNewsAzione(precedente, dati);
    if (risultato?.esito === "ok") {
      annuncia(t("spostata"));
      spostaFocus("#news-spostate-titolo", "#news-elenco-titolo");
    }
    return risultato;
  }, undefined);

  return (
    <Espandibile
      titolo={
        // L'area sensibile (~36px) copre anche la freccia; il nome accessibile dice a quale email si riferisce.
        <span className="relative text-xs after:absolute after:-inset-y-2.5 after:-right-2 after:-left-6 after:content-['']">
          {t("apri")}
          <TestoSemplice come="span" testo={` ${oggetto}`} className="sr-only" />
        </span>
      }
      className={cn("relative z-10 ml-auto text-right open:basis-full", className)}
      classeContenuto="mt-2"
    >
      <form action={esegui} className="ml-auto grid max-w-xl gap-2 text-left sm:grid-cols-2">
        <input type="hidden" name="email" value={emailId} />
        <p className="text-xs text-text-muted sm:col-span-2">{t("aiuto")}</p>
        {CATEGORIE.map((c) => {
          const id = `sposta-${emailId}-${c}`;
          return (
            <Pulsante
              key={c}
              type="submit"
              name="categoria"
              value={c}
              dimensione="sm"
              disabled={inCorso}
              aria-labelledby={id}
              aria-describedby={[`${id}-aiuto`, descrittoDa].filter(Boolean).join(" ")}
              className="h-auto flex-col items-start justify-start gap-0.5 py-2 text-left sm:h-auto"
            >
              <span id={id}>{tc(`categorie.${c}`)}</span>
              <span id={`${id}-aiuto`} className="text-xs font-normal text-text-muted">
                {t(`categorie.${c}`)}
              </span>
            </Pulsante>
          );
        })}
        <p className="text-xs text-text-muted sm:col-span-2">{t("annullabile")}</p>
        <Esito esito={stato?.esito} inCorso={inCorso} ok={t("spostata")} className="sm:col-span-2" />
      </form>
    </Espandibile>
  );
}

/**
 * "Annulla" di un'email spostata di recente: la riporta nelle News. La riga sparisce con il pulsante, quindi
 * l'esito si annuncia nella pagina e il focus passa all'email tornata nell'elenco.
 */
export function AnnullaSpostamento({ emailId, oggetto }: { emailId: string; oggetto: string }) {
  const t = useTranslations("news.spostate");
  const tc = useTranslations("comuni");
  const [stato, esegui, inCorso] = useActionState(async (precedente: StatoAzione, dati: FormData) => {
    const risultato = await annullaSpostamentoAzione(precedente, dati);
    if (risultato?.esito === "ok") {
      annuncia(t("annullata"));
      spostaFocus(`#news-oggetto-${emailId} a`, "#news-elenco-titolo");
    }
    return risultato;
  }, undefined);

  return (
    <form action={esegui} className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="email" value={emailId} />
      <Esito esito={stato?.esito} inCorso={false} ok={t("annullata")} />
      <Pulsante type="submit" dimensione="sm" disabled={inCorso}>
        <Undo2 className="size-3.5" aria-hidden />
        {inCorso ? tc("azioni.inCorso") : t("annulla")}
        {/* Il nome accessibile distingue i pulsanti "Annulla" delle diverse email. */}
        <TestoSemplice come="span" testo={` ${oggetto}`} className="sr-only" />
      </Pulsante>
    </form>
  );
}
