import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { VistaImpostazioniDto } from "@ec/applicazione";
import { ripristinaModelloAzione } from "@/app/(app)/settings/azioni";
import type { Traduttore } from "@/components/comuni/codici";
import { Istante } from "@/components/comuni/istante";
import { ModuloAzione } from "@/components/comuni/modulo-azione";
import { Distintivo } from "@/components/ui/distintivo";
import { ModuloModello } from "./modulo-modello";
import { Dato, Sezione } from "./sezione";

type VoceModello = VistaImpostazioniDto["modelli"][number];

/**
 * Nome e descrizione (scopo e dati interpretati) di una Funzione AI dalle traduzioni di questa pagina:
 * etichetta e descrizione del DTO non sono tradotte. Per una funzione nuova senza voce si usa il nome comune.
 */
export function testiFunzione(t: Traduttore, tc: Traduttore, funzione: string): { nome: string; descrizione: string } {
  const base = `modelli.funzioni.${funzione}`;
  if (t.has(`${base}.nome`)) return { nome: t(`${base}.nome`), descrizione: t(`${base}.descrizione`) };
  return {
    nome: tc.has(`funzioni.${funzione}`) ? tc(`funzioni.${funzione}`) : t("modelli.funzioni.sconosciuta.nome"),
    descrizione: t("modelli.funzioni.sconosciuta.descrizione"),
  };
}

/** Sezione `#models`: un modello OpenRouter per ogni Funzione AI, con compatibilità e ripristino del predefinito. */
export function SezioneModelli({ modelli }: { modelli: VoceModello[] }) {
  const t = useTranslations("impostazioni");
  const tc = useTranslations("comuni");
  const messaggiRipristino = {
    ok: t("modelli.esiti.ok"),
    incompatibile: t("modelli.esiti.incompatibile"),
    non_disponibile: t("modelli.esiti.non_disponibile"),
    non_valido: t("modelli.esiti.non_valido"),
  };

  return (
    <Sezione id="models" titolo={t("modelli.titolo")} descrizione={t("modelli.descrizione")}>
      <p id="models-aiuto" className="text-text-muted">
        {t("modelli.aiuto")}
      </p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {modelli.map((m) => {
          const { nome, descrizione } = testiFunzione(t, tc, m.funzione);
          const ok = m.stato === "ok";
          const predefinito = m.modello === m.predefinito;
          return (
            <li key={m.funzione} className="space-y-4 px-4 py-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">{nome}</h3>
                <p className="text-text-muted">{descrizione}</p>
              </div>

              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Dato etichetta={t("modelli.modello")}>
                  <span className="font-mono break-all">{m.modello}</span>
                </Dato>
                <Dato etichetta={t("modelli.predefinito")}>
                  <span className="font-mono break-all">{m.predefinito}</span>
                </Dato>
                <Dato etichetta={t("modelli.compatibilita")}>
                  <span title={t(`modelli.statiAiuto.${m.stato}`)}>
                    <Distintivo
                      tono={ok ? "accento" : "pericolo"}
                      icona={ok ? <CheckCircle2 className="size-3" aria-hidden /> : <AlertTriangle className="size-3" aria-hidden />}
                    >
                      {t(`modelli.stati.${m.stato}`)}
                    </Distintivo>
                  </span>
                </Dato>
                <Dato etichetta={t("modelli.verificato")}>
                  <Istante iso={m.verificataIl} stile="data_ora" />
                </Dato>
              </dl>

              {ok ? null : <p className="text-danger">{t(`modelli.statiAiuto.${m.stato}`)}</p>}

              <div className="space-y-2">
                <ModuloModello funzione={m.funzione} modello={m.modello} nomeFunzione={nome} idAiuto="models-aiuto" />
                {predefinito ? (
                  <Distintivo tono="neutro">{t("modelli.usaPredefinito")}</Distintivo>
                ) : (
                  <ModuloAzione azione={ripristinaModelloAzione} campi={{ funzione: m.funzione }} etichetta={t("modelli.ripristina")} variante="fantasma" messaggi={messaggiRipristino} />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Sezione>
  );
}
