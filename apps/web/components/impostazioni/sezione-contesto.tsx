import { useTranslations } from "next-intl";
import type { VistaImpostazioniDto } from "@ec/applicazione";
import { ripristinaDirettivePredefiniteAzione, ripristinaVersioneContestoAzione } from "@/app/(app)/settings/azioni";
import { Istante } from "@/components/comuni/istante";
import { ModuloAzione } from "@/components/comuni/modulo-azione";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { Distintivo } from "@/components/ui/distintivo";
import { Espandibile } from "@/components/ui/espandibile";
import { ConfermaAzione } from "./conferma-azione";
import { ModuloContesto } from "./modulo-contesto";
import { Sezione } from "./sezione";

const CLASSE_LINK = "text-accent-strong underline-offset-4 hover:underline";

/**
 * Sezione `#ai-context`: sotto il titolo una sola riga di stato (direttive predefinite o versione in uso), il testo modificabile
 * (ogni salvataggio è una nuova versione) e, a richiesta, la cronologia con "Ripristina" e il ritorno alle
 * Direttive predefinite, offerto solo quando non sono già in uso. `predefinite` arriva dalla pagina, che la
 * legge da `@ec/ai` sul server.
 */
export function SezioneContesto({ contesto, predefinite }: { contesto: VistaImpostazioniDto["contestoAi"]; predefinite: string }) {
  const t = useTranslations("impostazioni");
  const corrente = contesto.versioni.find((v) => v.numero === contesto.corrente) ?? null;
  const usaPredefinite = !corrente || corrente.testo === predefinite;
  const messaggi = {
    ok: t("contesto.esiti.ok"),
    non_trovata: t("contesto.esiti.non_trovata"),
    non_valido: t("contesto.esiti.non_valido"),
  };

  return (
    <Sezione
      id="ai-context"
      titolo={t("contesto.titolo")}
      descrizione={
        corrente && !usaPredefinite ? (
          <>
            {t("contesto.inUsoVersione", { numero: corrente.numero })} · <Istante iso={corrente.creatoIl} stile="data_ora" />
          </>
        ) : (
          t("contesto.inUsoPredefinite")
        )
      }
    >
      <ModuloContesto
        iniziale={corrente?.testo ?? predefinite}
        aiuto={t.rich("contesto.aiuto", {
          rianalisi: (parti) => (
            <a href="#reanalyse" className={CLASSE_LINK}>
              {parti}
            </a>
          ),
        })}
      />

      {contesto.versioni.length > 0 ? (
        <Espandibile titolo={t("contesto.versioni", { numero: contesto.versioni.length })} classeContenuto="space-y-3">
          {usaPredefinite ? null : (
            <ConfermaAzione
              azione={ripristinaDirettivePredefiniteAzione}
              etichetta={t("contesto.predefinite.etichetta")}
              titolo={t("contesto.predefinite.titolo")}
              punti={[t("contesto.predefinite.testo")]}
              conferma={t("contesto.predefinite.conferma")}
              annulla={t("annulla")}
              variante="secondario"
            />
          )}
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
                  <Espandibile titolo={t("contesto.mostra")}>
                    <TestoSemplice
                      testo={v.testo}
                      className="max-h-72 overflow-y-auto rounded-lg border border-border bg-surface-muted px-3 py-2 text-[13px] leading-relaxed"
                    />
                  </Espandibile>
                </li>
              );
            })}
          </ol>
        </Espandibile>
      ) : null}
    </Sezione>
  );
}
