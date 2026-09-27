"use client";

import { useActionState, useId } from "react";
import { useTranslations } from "next-intl";
import { testoCodice } from "@/components/comuni/codici";
import { Etichetta, Selezione } from "@/components/ui/campi";
import { Pulsante } from "@/components/ui/pulsante";
import { spostaFuoriDalleNewsAzione } from "@/components/home/azioni";

/** Categorie verso cui un'email può uscire dalle News (etichette da `comuni.categorie`). */
const CATEGORIE = ["operativa", "informativa"] as const;

/**
 * "Sposta fuori dalle News" con la scelta della nuova categoria. È una Correzione: dopo lo spostamento
 * l'email compare tra le "Spostate fuori dalle News", da cui si può annullare.
 */
export function ModuloSpostaNews({ emailId, descrittoDa }: { emailId: string; descrittoDa?: string }) {
  const t = useTranslations("news.sposta");
  const tc = useTranslations("comuni");
  const [stato, esegui, inCorso] = useActionState(spostaFuoriDalleNewsAzione, undefined);
  const id = useId();
  const esito = stato?.esito;

  return (
    <form action={esegui} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="email" value={emailId} />
      <Etichetta htmlFor={id} className="text-xs font-normal text-text-muted">
        {t("categoria")}
      </Etichetta>
      <Selezione id={id} name="categoria" defaultValue="operativa" className="h-8 w-auto py-1 pr-8">
        {CATEGORIE.map((c) => (
          <option key={c} value={c}>
            {tc(`categorie.${c}`)}
          </option>
        ))}
      </Selezione>
      <Pulsante type="submit" dimensione="sm" disabled={inCorso} aria-describedby={descrittoDa}>
        {inCorso ? tc("azioni.inCorso") : t("azione")}
      </Pulsante>
      {esito ? (
        <span role="status" className={esito === "ok" ? "text-xs text-accent-strong" : "text-xs text-danger"}>
          {esito === "ok" ? t("spostata") : testoCodice(tc, "esiti", esito, "esiti.errore")}
        </span>
      ) : null}
    </form>
  );
}
