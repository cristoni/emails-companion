"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { confermaInvioAzione } from "@/app/(app)/drafts/azioni";
import { classiPulsante, Pulsante } from "@/components/ui/pulsante";

const ESITI = ["confermato", "gia_in_corso", "versione_superata", "casella_non_pronta", "non_trovata", "bozza_vuota"];

/**
 * Conferma esplicita dell'invio: versione e hash della busta sono quelli della schermata di conferma che
 * l'utente sta guardando. Il pulsante è disabilitato durante l'azione, così un doppio clic non la ripete
 * (il caso d'uso resta comunque idempotente).
 */
export function ModuloInvio({ bozzaId, versione, hashBusta, disabilitato }: { bozzaId: string; versione: number; hashBusta: string; disabilitato: boolean }) {
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
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm">
          <p>{messaggio}</p>
          {esito === "versione_superata" ? (
            <Link href={`/drafts/${bozzaId}`} className={classiPulsante("secondario", "sm")}>
              {t("riesame")}
            </Link>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link href={`/drafts/${bozzaId}`} className={classiPulsante("fantasma", "md")}>
          {t("modifica")}
        </Link>
        <Pulsante type="submit" variante="primario" dimensione="md" disabled={inCorso || disabilitato} aria-busy={inCorso}>
          <Send className="size-4" aria-hidden />
          {inCorso ? t("invio") : t("invia")}
        </Pulsante>
      </div>
    </form>
  );
}
