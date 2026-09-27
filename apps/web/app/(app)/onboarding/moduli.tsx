"use client";

import { useActionState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Aiuto, AreaTesto, Etichetta, Input } from "@/components/ui/campi";
import { Pulsante } from "@/components/ui/pulsante";
import { accettaInformativaAzione, salvaChiaveAzione, salvaContestoAzione } from "./azioni";

export function PulsanteInformativa({ etichetta }: { etichetta: string }) {
  const [inCorso, avvia] = useTransition();
  return (
    <Pulsante variante="primario" disabled={inCorso} onClick={() => avvia(async () => void (await accettaInformativaAzione()))}>
      {etichetta}
    </Pulsante>
  );
}

export function ModuloChiave() {
  const t = useTranslations("onboarding.chiave");
  const [stato, azione, inCorso] = useActionState(salvaChiaveAzione, undefined);
  return (
    <form action={azione} className="space-y-2">
      <Etichetta htmlFor="chiave">{t("etichetta")}</Etichetta>
      <div className="flex gap-2">
        <Input id="chiave" name="chiave" type="password" autoComplete="off" spellCheck={false} placeholder="sk-or-v1-…" required />
        <Pulsante type="submit" variante="primario" disabled={inCorso}>
          {t("verifica")}
        </Pulsante>
      </div>
      <Aiuto>{t("consiglio")}</Aiuto>
      {stato ? (
        <p role="status" className={stato.esito === "valida" ? "text-accent-strong" : "text-danger"}>
          {t(`esiti.${stato.esito}`)}
        </p>
      ) : null}
    </form>
  );
}

export function ModuloContesto({ iniziale }: { iniziale: string }) {
  const t = useTranslations("onboarding.contesto");
  const [stato, azione, inCorso] = useActionState(salvaContestoAzione, undefined);
  return (
    <form action={azione} className="space-y-2">
      <Etichetta htmlFor="contesto">{t("etichetta")}</Etichetta>
      <AreaTesto id="contesto" name="contesto" defaultValue={iniziale} rows={12} maxLength={20_000} />
      <div className="flex items-center gap-3">
        <Pulsante type="submit" variante="primario" disabled={inCorso}>
          {t("salva")}
        </Pulsante>
        {stato?.esito === "ok" ? <span className="text-accent-strong">{t("salvato")}</span> : null}
        {stato && stato.esito !== "ok" ? (
          <span role="status" className="text-danger">
            {t(stato.esito === "troppo_lungo" || stato.esito === "vuoto" ? `esiti.${stato.esito}` : "esiti.errore")}
          </span>
        ) : null}
      </div>
    </form>
  );
}
