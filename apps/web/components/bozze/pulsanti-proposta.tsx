"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Clock, PenLine } from "lucide-react";
import { proponiRispostaAzione, proponiSollecitoAzione } from "@/app/(app)/drafts/azioni";
import type { AzioneModulo } from "@/components/comuni/modulo-azione";
import { Distintivo } from "@/components/ui/distintivo";
import { Pulsante } from "@/components/ui/pulsante";

const ESITI = ["email_non_trovata", "attesa_non_trovata", "attesa_non_attiva", "casella_non_pronta", "nessun_destinatario"] as const;

/**
 * Pulsante che chiede una bozza: la Server Action crea la bozza e porta al suo editor (`/drafts/<id>`);
 * gli altri esiti sono mostrati tradotti. Chiedere una bozza non invia nulla.
 */
function PulsanteProposta({
  azione,
  campo,
  valore,
  etichetta,
  evidenza = false,
}: {
  azione: AzioneModulo;
  campo: string;
  valore: string;
  etichetta: string;
  evidenza?: boolean;
}) {
  const t = useTranslations("bozze.proponi");
  const [stato, esegui, inCorso] = useActionState(azione, undefined);
  const esito = stato?.esito;
  const messaggio = esito ? t((ESITI as readonly string[]).includes(esito) ? `esiti.${esito}` : "esiti.errore") : null;
  return (
    <form action={esegui} className="inline-flex flex-wrap items-center gap-2">
      <input type="hidden" name={campo} value={valore} />
      <Pulsante type="submit" variante={evidenza ? "primario" : "secondario"} dimensione="sm" disabled={inCorso} title={t("aiuto")}>
        <PenLine className="size-3.5" aria-hidden />
        {inCorso ? t("inCorso") : etichetta}
      </Pulsante>
      {evidenza ? (
        <span title={t("consigliatoAiuto")}>
          <Distintivo tono="urgente" icona={<Clock className="size-3" aria-hidden />}>
            {t("consigliato")}
          </Distintivo>
        </span>
      ) : null}
      {messaggio ? (
        <span role="status" className="text-xs text-danger">
          {messaggio}
        </span>
      ) : null}
    </form>
  );
}

/**
 * "Proponi risposta" per un'email e "Proponi sollecito" per un'Attesa: creano la bozza su richiesta
 * esplicita e portano al suo editor. Contratto usato dalla pagina `/situations/[id]`.
 */
export function PulsanteProponiRisposta({ emailId }: { emailId: string }): React.ReactNode {
  const t = useTranslations("bozze.proponi");
  return <PulsanteProposta azione={proponiRispostaAzione} campo="email" valore={emailId} etichetta={t("risposta")} />;
}

/** Il sollecito consigliato (Attesa scaduta) è in evidenza, con un'etichetta che non dipende dal colore. */
export function PulsanteProponiSollecito({ attesaId, consigliato }: { attesaId: string; consigliato: boolean }): React.ReactNode {
  const t = useTranslations("bozze.proponi");
  return <PulsanteProposta azione={proponiSollecitoAzione} campo="attesa" valore={attesaId} etichetta={t("sollecito")} evidenza={consigliato} />;
}
