import { useFormatter, useTranslations } from "next-intl";
import { KeyRound, ShieldCheck } from "lucide-react";
import type { VistaImpostazioniDto } from "@ec/applicazione";
import { rimuoviChiaveAzione } from "@/app/(app)/settings/azioni";
import { testoCodice } from "@/components/comuni/codici";
import { Istante } from "@/components/comuni/istante";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { Avviso } from "@/components/ui/avviso";
import { Distintivo, type TonoDistintivo } from "@/components/ui/distintivo";
import { ConfermaAzione } from "./conferma-azione";
import { opzioniImporto } from "./formato";
import { ModuloChiave } from "./modulo-chiave";
import { Dato, Sezione } from "./sezione";

const TONO_CHIAVE: Record<string, TonoDistintivo> = {
  valida: "accento",
  non_verificata: "neutro",
  non_valida: "pericolo",
  credito_esaurito: "urgente",
  limitata: "urgente",
};

/**
 * Sezione `#openrouter`: stato della Chiave OpenRouter (solo ultime cifre, mai il valore), sostituzione e
 * rimozione con conferma, consiglio di una chiave dedicata e promemoria sulla registrazione dei prompt.
 */
export function SezioneChiave({ chiave }: { chiave: VistaImpostazioniDto["chiave"] }) {
  const t = useTranslations("impostazioni");
  const formato = useFormatter();

  const limite = (() => {
    if (!chiave) return null;
    if (chiave.limiteResiduo !== null) return formato.number(chiave.limiteResiduo, opzioniImporto(chiave.limiteResiduo));
    return chiave.stato === "valida" ? t("chiave.senzaLimite") : null;
  })();

  return (
    <Sezione id="openrouter" titolo={t("chiave.titolo")} descrizione={t("chiave.descrizione")}>
      {chiave ? (
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Dato etichetta={t("chiave.stato")}>
            <Distintivo tono={TONO_CHIAVE[chiave.stato] ?? "neutro"}>{testoCodice(t, "chiave.stati", chiave.stato, "chiave.stati.sconosciuto")}</Distintivo>
          </Dato>
          <Dato etichetta={t("chiave.chiave")}>
            <span className="inline-flex items-center gap-1.5">
              <KeyRound className="size-3.5 text-text-muted" aria-hidden />
              <span className="font-mono">{t("chiave.finale", { cifre: `••••${chiave.ultimeCifre}` })}</span>
            </span>
          </Dato>
          {chiave.etichetta ? (
            <Dato etichetta={t("chiave.etichetta")}>
              <TestoSemplice come="span" testo={chiave.etichetta} />
            </Dato>
          ) : null}
          {limite ? <Dato etichetta={t("chiave.limite")}>{limite}</Dato> : null}
          <Dato etichetta={t("chiave.verificata")}>
            <Istante iso={chiave.verificataIl} stile="data_ora" />
          </Dato>
        </dl>
      ) : (
        <Avviso tono="attenzione" titolo={t("chiave.nessuna")}>
          {t("chiave.nessunaTesto")}
        </Avviso>
      )}

      <ModuloChiave haChiave={Boolean(chiave)} />

      <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-muted px-4 py-3 text-text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent-strong" aria-hidden />
        <p>{t("chiave.registrazione")}</p>
      </div>

      {chiave ? (
        <div className="border-t border-border pt-4">
          <ConfermaAzione
            azione={rimuoviChiaveAzione}
            etichetta={t("chiave.rimuovi.etichetta")}
            titolo={t("chiave.rimuovi.titolo")}
            punti={[t("chiave.rimuovi.pausa"), t("chiave.rimuovi.openrouter")]}
            conferma={t("chiave.rimuovi.conferma")}
            annulla={t("annulla")}
          />
        </div>
      ) : null}
    </Sezione>
  );
}
