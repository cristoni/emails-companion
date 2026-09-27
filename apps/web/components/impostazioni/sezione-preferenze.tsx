import { useTranslations } from "next-intl";
import { CirclePause, CirclePlay } from "lucide-react";
import { pausaAnalisiAzione } from "@/app/(app)/settings/azioni";
import { ModuloAzione } from "@/components/comuni/modulo-azione";
import { Distintivo } from "@/components/ui/distintivo";
import type { Tema } from "./formato";
import { ModuloFuso, ModuloLingua, SceltaTema } from "./preferenze";
import { Sezione } from "./sezione";

/**
 * Sezione `#preferences`: lingua, tema, fuso orario e "Pausa analisi AI" (con ancora interna `#pause`),
 * con la spiegazione di cosa si ferma e cosa continua.
 */
export function SezionePreferenze({
  lingua,
  lingue,
  tema,
  fuso,
  fusi,
  pausaManuale,
}: {
  lingua: string;
  lingue: { codice: string; nome: string }[];
  tema: Tema;
  fuso: string;
  fusi: string[];
  pausaManuale: boolean;
}) {
  const t = useTranslations("impostazioni");
  return (
    <Sezione id="preferences" titolo={t("preferenze.titolo")} descrizione={t("preferenze.descrizione")} className="space-y-6">
      <ModuloLingua lingua={lingua} lingue={lingue} />
      <SceltaTema temaSalvato={tema} />
      <ModuloFuso fuso={fuso} fusi={fusi} />

      <div id="pause" className="scroll-mt-6 space-y-4 border-t border-border pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{t("pausa.titolo")}</h3>
            {pausaManuale ? (
              <Distintivo tono="urgente" icona={<CirclePause className="size-3" aria-hidden />}>
                {t("pausa.inPausa")}
              </Distintivo>
            ) : (
              <Distintivo tono="accento" icona={<CirclePlay className="size-3" aria-hidden />}>
                {t("pausa.attiva")}
              </Distintivo>
            )}
          </div>
          <ModuloAzione
            azione={pausaAnalisiAzione}
            campi={{ pausa: pausaManuale ? "0" : "1" }}
            etichetta={pausaManuale ? t("pausa.riprendi") : t("pausa.pausa")}
            variante={pausaManuale ? "primario" : "secondario"}
            dimensione="md"
          />
        </div>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1 rounded-lg border border-border bg-surface-muted px-4 py-3">
            <dt className="font-medium">{t("pausa.siFerma")}</dt>
            <dd className="text-text-muted">{t("pausa.siFermaTesto")}</dd>
          </div>
          <div className="space-y-1 rounded-lg border border-border bg-surface-muted px-4 py-3">
            <dt className="font-medium">{t("pausa.continua")}</dt>
            <dd className="text-text-muted">{t("pausa.continuaTesto")}</dd>
          </div>
        </dl>
        <p className="text-xs text-text-muted">{t("pausa.ripresa")}</p>
      </div>
    </Sezione>
  );
}
