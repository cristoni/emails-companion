import { useTranslations } from "next-intl";
import { CirclePause } from "lucide-react";
import { pausaAnalisiAzione } from "@/app/(app)/settings/azioni";
import { ModuloAzione } from "@/components/comuni/modulo-azione";
import { Distintivo } from "@/components/ui/distintivo";
import { Espandibile } from "@/components/ui/espandibile";
import type { Tema } from "./formato";
import { ModuloFuso, ModuloLingua, SceltaTema } from "./preferenze";
import { Gruppo, Sezione } from "./sezione";

/** Gruppo `#preferences`: lingua, tema e fuso orario, una riga ciascuno. */
export function GruppoPreferenze({
  lingua,
  lingue,
  tema,
  fuso,
  fusi,
}: {
  lingua: string;
  lingue: { codice: string; nome: string }[];
  tema: Tema;
  fuso: string;
  fusi: string[];
}) {
  const t = useTranslations("impostazioni");
  return (
    <Gruppo id="preferences" titolo={t("gruppi.preferenze")}>
      <ModuloLingua lingua={lingua} lingue={lingue} />
      <SceltaTema temaSalvato={tema} />
      <ModuloFuso fuso={fuso} fusi={fusi} />
    </Gruppo>
  );
}

/**
 * Sezione `#pause`: "Pausa analisi AI". Lo stato compare solo quando l'analisi è in pausa; cosa si ferma e
 * cosa continua sono a richiesta.
 */
export function SezionePausa({ pausaManuale }: { pausaManuale: boolean }) {
  const t = useTranslations("impostazioni.pausa");
  return (
    <Sezione
      id="pause"
      titolo={
        <>
          {t("titolo")}
          {pausaManuale ? (
            <Distintivo tono="urgente" icona={<CirclePause className="size-3" aria-hidden />}>
              {t("inPausa")}
            </Distintivo>
          ) : null}
        </>
      }
      descrizione={pausaManuale ? t("inPausaTesto") : t("attivaTesto")}
      azioni={
        <ModuloAzione
          azione={pausaAnalisiAzione}
          campi={{ pausa: pausaManuale ? "0" : "1" }}
          etichetta={pausaManuale ? t("riprendi") : t("pausa")}
          variante={pausaManuale ? "primario" : "secondario"}
        />
      }
    >
      <Espandibile titolo={t("dettagli")} classeContenuto="space-y-2">
        <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[9rem_minmax(0,1fr)]">
          <dt className="font-medium">{t("siFerma")}</dt>
          <dd className="text-text-muted">{t("siFermaTesto")}</dd>
          <dt className="font-medium">{t("continua")}</dt>
          <dd className="text-text-muted">{t("continuaTesto")}</dd>
        </dl>
        <p className="text-xs text-text-muted">{t("ripresa")}</p>
      </Espandibile>
    </Sezione>
  );
}
