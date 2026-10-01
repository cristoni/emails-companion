"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { confermaInvioAzione } from "@/app/(app)/drafts/azioni";
import { Avviso } from "@/components/ui/avviso";
import { classiPulsante, Pulsante } from "@/components/ui/pulsante";

const ESITI = ["confermato", "gia_in_corso", "versione_superata", "casella_non_pronta", "non_trovata", "bozza_vuota"];

/**
 * Conferma esplicita dell'invio: versione e hash della busta sono quelli della schermata di conferma che
 * l'utente sta guardando. Accanto ai pulsanti il `riepilogo` (da chi, a chi, avvisi da leggere). Il pulsante
 * è disabilitato durante l'azione, così un doppio clic non la ripete (il caso d'uso resta comunque
 * idempotente). Su schermi stretti "Invia ora" sta sopra, a tutta larghezza.
 */
export function ModuloInvio({
  bozzaId,
  versione,
  hashBusta,
  disabilitato,
  riepilogo,
}: {
  bozzaId: string;
  versione: number;
  hashBusta: string;
  disabilitato: boolean;
  riepilogo: React.ReactNode;
}) {
  const t = useTranslations("bozze.conferma");
  const [stato, esegui, inCorso] = useActionState(confermaInvioAzione, undefined);
  const esito = stato?.esito;
  const messaggio = esito ? t(ESITI.includes(esito) ? `esiti.${esito}` : "esiti.errore") : null;
  return (
    <form action={esegui} className="space-y-3">
      <input type="hidden" name="bozza" value={bozzaId} />
      <input type="hidden" name="versione" value={String(versione)} />
      <input type="hidden" name="hashBusta" value={hashBusta} />
      {messaggio ? (
        <Avviso
          tono="errore"
          titolo={messaggio}
          azione={
            esito === "versione_superata" ? (
              <Link href={`/drafts/${bozzaId}`} className={classiPulsante("secondario", "sm")}>
                {t("riesame")}
              </Link>
            ) : null
          }
        />
      ) : null}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">{riepilogo}</div>
        {/* "Invia ora" è primo anche nel DOM (tastiera e lettori di schermo): a destra da sm in su, sopra su mobile. */}
        <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start md:shrink-0">
          <Pulsante type="submit" variante="primario" dimensione="lg" disabled={inCorso || disabilitato} aria-busy={inCorso}>
            <Send className="size-4" aria-hidden />
            {inCorso ? t("invio") : t("invia")}
          </Pulsante>
          <Link href={`/drafts/${bozzaId}`} className={classiPulsante("fantasma", "lg")}>
            {t("modifica")}
          </Link>
        </div>
      </div>
    </form>
  );
}
