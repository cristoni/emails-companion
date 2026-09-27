import { useTranslations } from "next-intl";
import { History } from "lucide-react";
import type { VistaImpostazioniDto } from "@ec/applicazione";
import { ripristinaDirettivePredefiniteAzione, ripristinaVersioneContestoAzione } from "@/app/(app)/settings/azioni";
import { Istante } from "@/components/comuni/istante";
import { ModuloAzione } from "@/components/comuni/modulo-azione";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { Distintivo } from "@/components/ui/distintivo";
import { ConfermaAzione } from "./conferma-azione";
import { ModuloContesto } from "./modulo-contesto";
import { Sezione } from "./sezione";

/**
 * Sezione `#ai-context`: testo della versione corrente modificabile (ogni salvataggio è una nuova versione),
 * cronologia con "Ripristina" e ripristino delle Direttive predefinite. `predefinite` arriva dalla pagina,
 * che la legge da `@ec/ai` sul server.
 */
export function SezioneContesto({ contesto, predefinite }: { contesto: VistaImpostazioniDto["contestoAi"]; predefinite: string }) {
  const t = useTranslations("impostazioni");
  const corrente = contesto.versioni.find((v) => v.numero === contesto.corrente) ?? null;
  const messaggi = {
    ok: t("contesto.esiti.ok"),
    non_trovata: t("contesto.esiti.non_trovata"),
    non_valido: t("contesto.esiti.non_valido"),
  };

  return (
    <Sezione id="ai-context" titolo={t("contesto.titolo")} descrizione={t("contesto.descrizione")}>
      <div id="ai-context-aiuto" className="space-y-1 rounded-lg border border-border bg-surface-muted px-4 py-3">
        <p>{t("contesto.ambito")}</p>
        <a href="#reanalyse" className="text-accent-strong underline-offset-4 hover:underline">
          {t("contesto.vaiRianalisi")}
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-text-muted">
        {corrente ? (
          <>
            <Distintivo tono="accento">{t("contesto.inUsoVersione", { numero: corrente.numero })}</Distintivo>
            <Istante iso={corrente.creatoIl} stile="data_ora" className="text-xs" />
          </>
        ) : (
          <>
            <Distintivo tono="neutro">{t("contesto.inUsoPredefinite")}</Distintivo>
            <span className="text-xs">{t("contesto.senzaVersioni")}</span>
          </>
        )}
      </div>

      <ModuloContesto iniziale={corrente?.testo ?? predefinite} idAiuto="ai-context-aiuto" />

      <ConfermaAzione
        azione={ripristinaDirettivePredefiniteAzione}
        etichetta={t("contesto.predefinite.etichetta")}
        titolo={t("contesto.predefinite.titolo")}
        punti={[t("contesto.predefinite.testo")]}
        conferma={t("contesto.predefinite.conferma")}
        annulla={t("annulla")}
        variante="secondario"
      />

      {contesto.versioni.length > 0 ? (
        <div className="space-y-3 border-t border-border pt-5">
          <div className="flex items-center gap-2">
            <History className="size-4 text-text-muted" aria-hidden />
            <h3 className="text-sm font-semibold">{t("contesto.versioni")}</h3>
          </div>
          <p className="text-xs text-text-muted">{t("contesto.ripristinaAiuto")}</p>
          <ol className="divide-y divide-border rounded-lg border border-border">
            {contesto.versioni.map((v) => {
              const inUso = v.numero === contesto.corrente;
              return (
                <li key={v.numero} className="space-y-2 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{t("contesto.versione", { numero: v.numero })}</span>
                      <Istante iso={v.creatoIl} stile="data_ora" className="text-xs text-text-muted" />
                      {inUso ? <Distintivo tono="accento">{t("contesto.inUso")}</Distintivo> : null}
                    </div>
                    {inUso ? null : (
                      <ModuloAzione
                        azione={ripristinaVersioneContestoAzione}
                        campi={{ versione: String(v.numero) }}
                        etichetta={t("contesto.ripristina")}
                        messaggi={messaggi}
                      />
                    )}
                  </div>
                  <details className="group">
                    <summary className="cursor-pointer text-xs text-accent-strong underline-offset-4 hover:underline">{t("contesto.mostra")}</summary>
                    <TestoSemplice
                      testo={v.testo}
                      className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-border bg-surface-muted px-3 py-2 font-mono text-[13px] leading-relaxed"
                    />
                  </details>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
    </Sezione>
  );
}
