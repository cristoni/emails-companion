import { useTranslations } from "next-intl";
import { AlertTriangle, ChevronDown } from "lucide-react";
import type { VistaImpostazioniDto } from "@ec/applicazione";
import { ripristinaModelloAzione } from "@/app/(app)/settings/azioni";
import type { Traduttore } from "@/components/comuni/codici";
import { Istante } from "@/components/comuni/istante";
import { ModuloAzione } from "@/components/comuni/modulo-azione";
import { Distintivo } from "@/components/ui/distintivo";
import { cn } from "@/components/ui/cn";
import { DettagliStabili } from "./dettagli-stabili";
import { ModuloModello } from "./modulo-modello";
import { RigaMeta, Sezione } from "./sezione";

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

/**
 * ID di un modello (`fornitore/modello`) che, se non entra nella riga, va a capo dopo la barra o dopo un
 * trattino, mai a metà di una parola salvo che una parte sia più larga dell'intera colonna.
 */
function IdModello({ id, className }: { id: string; className?: string }) {
  const barra = id.indexOf("/");
  return (
    <code className={cn("font-mono [overflow-wrap:anywhere]", className)}>
      {barra === -1 ? (
        id
      ) : (
        <>
          {id.slice(0, barra + 1)}
          <wbr />
          {id.slice(barra + 1)}
        </>
      )}
    </code>
  );
}

/**
 * Sezione `#models`: una riga per Funzione AI con scopo e dati letti, il modello in uso (una sola volta),
 * "Personalizzato" solo se diverso dal predefinito e lo stato solo se c'è un problema. La riga si apre sul
 * modulo per cambiare modello e sul ripristino del predefinito; una funzione in pausa per il modello è già aperta
 * al caricamento e resta aperta dopo il salvataggio, così l'esito si vede.
 */
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
    <Sezione id="models" titolo={t("modelli.titolo")}>
      <ul className="-mt-1 divide-y divide-border">
        {modelli.map((m) => {
          const { nome, descrizione } = testiFunzione(t, tc, m.funzione);
          const ok = m.stato === "ok";
          const personalizzato = m.modello !== m.predefinito;
          return (
            <li key={m.funzione}>
              <DettagliStabili apertoIniziale={!ok} className="group/modello">
                <summary className="flex cursor-pointer list-none flex-col gap-1.5 py-3 select-none sm:flex-row sm:items-start sm:gap-6 [&::-webkit-details-marker]:hidden">
                  <span className="block min-w-0 flex-1 space-y-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{nome}</span>
                      {personalizzato ? <Distintivo tono="neutro">{t("modelli.personalizzato")}</Distintivo> : null}
                      {ok ? null : (
                        <Distintivo tono="pericolo" icona={<AlertTriangle className="size-3" aria-hidden />}>
                          {t(`modelli.stati.${m.stato}`)}
                        </Distintivo>
                      )}
                    </span>
                    <span className="block text-text-muted">{descrizione}</span>
                  </span>
                  <span className="flex min-w-0 items-center gap-2 sm:max-w-[45%] sm:shrink-0 sm:pt-0.5">
                    <IdModello id={m.modello} className="min-w-0 text-xs text-text-muted" />
                    <span className="ml-auto inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-accent-strong sm:ml-0">
                      {t("modelli.cambia")}
                      <ChevronDown className="size-3.5 transition-transform group-open/modello:rotate-180" aria-hidden />
                    </span>
                  </span>
                </summary>
                <div className="space-y-2 pb-4">
                  {ok ? null : <p className="text-danger">{t(`modelli.statiAiuto.${m.stato}`)}</p>}
                  <ModuloModello funzione={m.funzione} modello={m.modello} nomeFunzione={nome} />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <RigaMeta
                      parti={[
                        personalizzato ? (
                          <span>
                            {t("modelli.predefinito")} <IdModello id={m.predefinito} />
                          </span>
                        ) : null,
                        m.verificataIl ? (
                          <span>
                            {t("modelli.verificato")} <Istante iso={m.verificataIl} stile="data_ora" />
                          </span>
                        ) : null,
                      ]}
                    />
                    {personalizzato ? (
                      <ModuloAzione
                        azione={ripristinaModelloAzione}
                        campi={{ funzione: m.funzione }}
                        etichetta={t("modelli.ripristina")}
                        variante="fantasma"
                        messaggi={messaggiRipristino}
                      />
                    ) : null}
                  </div>
                </div>
              </DettagliStabili>
            </li>
          );
        })}
      </ul>
    </Sezione>
  );
}
