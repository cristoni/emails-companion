import { useFormatter, useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, KeyRound } from "lucide-react";
import type { VistaImpostazioniDto } from "@ec/applicazione";
import { rimuoviChiaveAzione } from "@/app/(app)/settings/azioni";
import { testoCodice } from "@/components/comuni/codici";
import { Istante } from "@/components/comuni/istante";
import { Distintivo, type TonoDistintivo } from "@/components/ui/distintivo";
import { ConfermaAzione } from "./conferma-azione";
import { EspandibileStabile } from "./dettagli-stabili";
import { opzioniImporto } from "./formato";
import { ModuloChiave } from "./modulo-chiave";
import { RigaMeta, Sezione } from "./sezione";
import { ConsumoChiave } from "./sezione-consumo";

const TONO_CHIAVE: Record<string, TonoDistintivo> = {
  valida: "accento",
  non_verificata: "neutro",
  non_valida: "pericolo",
  credito_esaurito: "urgente",
  limitata: "urgente",
};

/** Stati in cui la chiave va sostituita: il modulo di sostituzione è già aperto. */
const DA_SOSTITUIRE = new Set(["non_valida", "non_verificata"]);
/** Stati che si risolvono su OpenRouter (credito, limite), non cambiando chiave. */
const DA_RICARICARE = new Set(["credito_esaurito", "limitata"]);

/**
 * Sezione `#openrouter`: riepilogo della Chiave OpenRouter (stato e sole ultime cifre, mai il valore), spesa
 * degli ultimi 30 giorni (`#usage`), sostituzione a richiesta e, in fondo a destra, rimozione discreta con
 * conferma. Il modulo è aperto solo se la chiave manca o va sostituita (non valida o non verificata); per
 * credito esaurito o limite raggiunto una riga dice di intervenire su OpenRouter. Chiuso, il modulo resta
 * nella pagina (`<details>`), sempre nella stessa posizione: così l'esito del salvataggio resta visibile
 * anche quando la pagina riletta passa da "nessuna chiave" al riepilogo.
 */
export function SezioneChiave({ chiave, consumo }: { chiave: VistaImpostazioniDto["chiave"]; consumo: VistaImpostazioniDto["consumo"] }) {
  const t = useTranslations("impostazioni");
  const formato = useFormatter();

  const limite = (() => {
    if (!chiave) return null;
    if (chiave.limiteResiduo !== null) return t("chiave.limite", { importo: formato.number(chiave.limiteResiduo, opzioniImporto(chiave.limiteResiduo)) });
    return chiave.stato === "valida" ? t("chiave.senzaLimite") : null;
  })();
  const valida = chiave?.stato === "valida";

  return (
    <Sezione id="openrouter" titolo={t("chiave.titolo")}>
      {chiave ? (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Distintivo
              tono={TONO_CHIAVE[chiave.stato] ?? "neutro"}
              icona={valida ? <CheckCircle2 className="size-3" aria-hidden /> : <AlertTriangle className="size-3" aria-hidden />}
            >
              {testoCodice(t, "chiave.stati", chiave.stato, "chiave.stati.sconosciuto")}
            </Distintivo>
            <span className="inline-flex items-center gap-1.5">
              <KeyRound className="size-3.5 text-text-muted" aria-hidden />
              <span className="sr-only">{t("chiave.finale")}</span>
              <span className="font-mono">••••&thinsp;{chiave.ultimeCifre}</span>
            </span>
          </div>
          <RigaMeta
            parti={[
              chiave.etichetta ? <span title={t("chiave.etichetta")}>{chiave.etichetta}</span> : null,
              limite,
              chiave.verificataIl ? (
                <span>
                  {t("chiave.verificata")} <Istante iso={chiave.verificataIl} stile="data_ora" />
                </span>
              ) : null,
            ]}
          />
          {DA_RICARICARE.has(chiave.stato) ? <p className="text-xs text-text-muted">{t("chiave.aiutoCredito")}</p> : null}
        </div>
      ) : (
        <p className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-urgent" aria-hidden />
          {t("chiave.nessuna")}
        </p>
      )}

      <ConsumoChiave consumo={consumo} />

      <EspandibileStabile
        titolo={chiave ? t("chiave.sostituisci") : t("chiave.aggiungi")}
        apertoIniziale={!chiave || DA_SOSTITUIRE.has(chiave.stato)}
        classeContenuto="max-w-xl"
      >
        <ModuloChiave />
      </EspandibileStabile>

      {chiave ? (
        <div className="flex">
          <ConfermaAzione
            discreta
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
