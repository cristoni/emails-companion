"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { FileText, PenLine } from "lucide-react";
import { proponiRispostaAzione, proponiSollecitoAzione } from "@/app/(app)/drafts/azioni";
import type { AzioneModulo } from "@/components/comuni/modulo-azione";
import { classiPulsante, Pulsante } from "@/components/ui/pulsante";

const ESITI = ["email_non_trovata", "attesa_non_trovata", "attesa_non_attiva", "casella_non_pronta", "nessun_destinatario"] as const;

type Dimensione = "sm" | "md";

/**
 * Pulsante che chiede una bozza: la Server Action crea la bozza e porta al suo editor (`/drafts/<id>`);
 * gli altri esiti sono mostrati tradotti. Chiedere una bozza non invia nulla, e il titolo del pulsante lo dice.
 */
function PulsanteProposta({
  azione,
  campo,
  valore,
  etichetta,
  evidenza = false,
  dimensione = "sm",
}: {
  azione: AzioneModulo;
  campo: string;
  valore: string;
  etichetta: string;
  evidenza?: boolean;
  dimensione?: Dimensione;
}) {
  const t = useTranslations("bozze.proponi");
  const [stato, esegui, inCorso] = useActionState(azione, undefined);
  const esito = stato?.esito;
  const messaggio = esito ? t((ESITI as readonly string[]).includes(esito) ? `esiti.${esito}` : "esiti.errore") : null;
  return (
    <form action={esegui} className="inline-flex flex-wrap items-center gap-2">
      <input type="hidden" name={campo} value={valore} />
      <Pulsante
        type="submit"
        variante={evidenza ? "primario" : "secondario"}
        dimensione={dimensione}
        disabled={inCorso}
        title={evidenza ? `${t("consigliatoAiuto")} ${t("aiuto")}` : t("aiuto")}
      >
        <PenLine className="size-3.5" aria-hidden />
        {inCorso ? t("inCorso") : etichetta}
      </Pulsante>
      {messaggio ? (
        <span role="status" className="text-xs text-danger">
          {messaggio}
        </span>
      ) : null}
    </form>
  );
}

/** "Apri bozza": una bozza non ancora inviata esiste già, quindi non se ne chiede un'altra (né un'altra analisi). */
function ApriBozza({ bozzaId, evidenza = false, dimensione = "sm" }: { bozzaId: string; evidenza?: boolean; dimensione?: Dimensione }) {
  const t = useTranslations("bozze.proponi");
  return (
    <Link href={`/drafts/${bozzaId}`} className={classiPulsante(evidenza ? "primario" : "secondario", dimensione)}>
      <FileText className="size-3.5" aria-hidden />
      {t("apriBozza")}
    </Link>
  );
}

/**
 * "Proponi risposta" per un'email e "Proponi sollecito" per un'Attesa: creano la bozza su richiesta
 * esplicita e portano al suo editor. Con `bozzaId` (una bozza non inviata c'è già) diventano "Apri bozza".
 * Contratto usato dalla pagina `/situations/[id]`.
 */
export function PulsanteProponiRisposta({ emailId, bozzaId, dimensione }: { emailId: string; bozzaId?: string | null; dimensione?: Dimensione }): React.ReactNode {
  const t = useTranslations("bozze.proponi");
  if (bozzaId) return <ApriBozza bozzaId={bozzaId} dimensione={dimensione} />;
  return <PulsanteProposta azione={proponiRispostaAzione} campo="email" valore={emailId} etichetta={t("risposta")} dimensione={dimensione} />;
}

/**
 * Il sollecito consigliato (Attesa scaduta) è il pulsante principale; il motivo è nel suo titolo e, accanto
 * all'Attesa, nel distintivo "Sollecito consigliato".
 */
export function PulsanteProponiSollecito({
  attesaId,
  bozzaId,
  consigliato,
  dimensione,
}: {
  attesaId: string;
  bozzaId?: string | null;
  consigliato: boolean;
  dimensione?: Dimensione;
}): React.ReactNode {
  const t = useTranslations("bozze.proponi");
  if (bozzaId) return <ApriBozza bozzaId={bozzaId} evidenza={consigliato} dimensione={dimensione} />;
  return (
    <PulsanteProposta azione={proponiSollecitoAzione} campo="attesa" valore={attesaId} etichetta={t("sollecito")} evidenza={consigliato} dimensione={dimensione} />
  );
}
