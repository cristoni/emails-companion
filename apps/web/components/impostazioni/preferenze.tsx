"use client";

import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { impostaFusoAzione, impostaLinguaAzione, impostaTemaAzione } from "@/app/(app)/settings/azioni";
import type { StatoAzione } from "@/components/comuni/modulo-azione";
import { Aiuto, Etichetta, Selezione } from "@/components/ui/campi";
import { Pulsante } from "@/components/ui/pulsante";
import { cn } from "@/components/ui/cn";
import type { Tema } from "./formato";
import { useInvioSenzaReset } from "./usa-invio";

/** Riga delle preferenze: etichetta a sinistra e comando a destra; sui telefoni uno sotto l'altro. */
const CLASSE_RIGA = "grid gap-x-6 gap-y-2 px-4 py-4 text-sm sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center sm:px-5";

function Esito({ stato, nascondiOk = false }: { stato: StatoAzione; nascondiOk?: boolean }) {
  const t = useTranslations("impostazioni.preferenze");
  const tc = useTranslations("comuni");
  const esito = stato?.esito;
  const testo = esito && !(nascondiOk && esito === "ok") ? (t.has(`esiti.${esito}`) ? t(`esiti.${esito}`) : tc("esiti.errore")) : null;
  return (
    <span role="status" aria-live="polite" className={cn("text-xs", esito === "ok" ? "text-accent-strong" : "text-danger")}>
      {testo}
    </span>
  );
}

/**
 * Valore scelto in una selezione, che riparte dal valore salvato quando questo cambia (dopo il salvataggio
 * la pagina viene riletta). Il pulsante "Salva" compare solo se la scelta è diversa dal valore salvato: niente
 * invio al cambio, che con le frecce su una selezione chiusa partirebbe a ogni tasto. I moduli usano
 * `useInvioSenzaReset`: il reset automatico di React riporterebbe la selezione al valore iniziale.
 */
function useScelta(salvato: string) {
  const [scelta, setScelta] = useState(salvato);
  const [precedente, setPrecedente] = useState(salvato);
  if (salvato !== precedente) {
    setPrecedente(salvato);
    setScelta(salvato);
  }
  return [scelta, setScelta, scelta !== salvato] as const;
}

/** Lingua dell'interfaccia: dopo il salvataggio l'intera app viene riletta nella nuova lingua. */
export function ModuloLingua({ lingua, lingue }: { lingua: string; lingue: { codice: string; nome: string }[] }) {
  const t = useTranslations("impostazioni.preferenze");
  const tc = useTranslations("comuni");
  const [stato, onSubmit, inCorso] = useInvioSenzaReset(impostaLinguaAzione);
  const [scelta, setScelta, modificata] = useScelta(lingua);
  const id = useId();
  return (
    <form onSubmit={onSubmit} className={CLASSE_RIGA}>
      <Etichetta htmlFor={`${id}-lingua`}>{t("lingua")}</Etichetta>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Selezione
            id={`${id}-lingua`}
            name="lingua"
            value={scelta}
            onChange={(e) => setScelta(e.target.value)}
            aria-describedby={`${id}-aiuto`}
            className="w-auto min-w-48"
          >
            {lingue.map((l) => (
              <option key={l.codice} value={l.codice} lang={l.codice}>
                {l.nome}
              </option>
            ))}
          </Selezione>
          {modificata ? (
            <Pulsante type="submit" variante="primario" dimensione="sm" disabled={inCorso}>
              {inCorso ? tc("azioni.inCorso") : t("salva")}
            </Pulsante>
          ) : null}
          <Esito stato={modificata ? undefined : stato} />
        </div>
        <Aiuto id={`${id}-aiuto`}>{t("linguaAiuto")}</Aiuto>
      </div>
    </form>
  );
}

const ICONE_TEMA = { system: Monitor, light: Sun, dark: Moon } as const;

/**
 * Tema: applicato subito su questo dispositivo con next-themes e salvato nelle preferenze. Dopo il montaggio
 * mostra il tema effettivamente in uso (la barra laterale può cambiarlo senza salvarlo).
 */
export function SceltaTema({ temaSalvato }: { temaSalvato: Tema }) {
  const t = useTranslations("impostazioni.preferenze");
  const { theme, setTheme } = useTheme();
  const [montato, setMontato] = useState(false);
  const [stato, azione] = useActionState(impostaTemaAzione, undefined);
  const [, avvia] = useTransition();
  const id = useId();
  useEffect(() => setMontato(true), []);

  const corrente: Tema = montato && (theme === "system" || theme === "light" || theme === "dark") ? theme : temaSalvato;

  const scegli = (tema: Tema) => {
    setTheme(tema);
    const dati = new FormData();
    dati.set("tema", tema);
    avvia(() => azione(dati));
  };

  return (
    <div className={CLASSE_RIGA}>
      <span id={`${id}-tema`} className="text-sm font-medium">
        {t("tema")}
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-labelledby={`${id}-tema`} className="inline-flex rounded-lg border border-border bg-surface-muted p-0.5">
          {(["system", "light", "dark"] as const).map((valore) => {
            const Icona = ICONE_TEMA[valore];
            const scelto = corrente === valore;
            return (
              <label
                key={valore}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
                  scelto ? "bg-surface-raised font-medium text-text shadow-[var(--shadow-card)]" : "text-text-muted hover:text-text",
                )}
              >
                <input type="radio" name={`${id}-tema`} value={valore} checked={scelto} onChange={() => scegli(valore)} className="sr-only" />
                <Icona className="size-3.5" aria-hidden />
                {t(`temi.${valore}`)}
              </label>
            );
          })}
        </div>
        <Esito stato={stato} nascondiOk />
      </div>
    </div>
  );
}

/** Fuso orario IANA: elenco preparato dal server, più il comando per usare quello del browser. */
export function ModuloFuso({ fuso, fusi }: { fuso: string; fusi: string[] }) {
  const t = useTranslations("impostazioni.preferenze");
  const tc = useTranslations("comuni");
  const [stato, onSubmit, inCorso] = useInvioSenzaReset(impostaFusoAzione);
  const [scelta, setScelta, modificata] = useScelta(fuso);
  const [browser, setBrowser] = useState<string | null>(null);
  const modulo = useRef<HTMLFormElement>(null);
  const id = useId();

  useEffect(() => {
    try {
      setBrowser(Intl.DateTimeFormat().resolvedOptions().timeZone || null);
    } catch {
      setBrowser(null);
    }
  }, []);

  const elenco = browser && !fusi.includes(browser) ? [...fusi, browser].sort() : fusi;

  const usaBrowser = () => {
    const campo = modulo.current?.elements.namedItem("fuso");
    if (!browser || !(campo instanceof HTMLSelectElement)) return;
    campo.value = browser;
    setScelta(browser);
    modulo.current?.requestSubmit();
  };

  return (
    <form ref={modulo} onSubmit={onSubmit} className={CLASSE_RIGA}>
      <Etichetta htmlFor={`${id}-fuso`}>{t("fuso")}</Etichetta>
      <div className="flex flex-wrap items-center gap-2">
        <Selezione id={`${id}-fuso`} name="fuso" value={scelta} onChange={(e) => setScelta(e.target.value)} className="w-auto max-w-full min-w-48">
          {elenco.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </Selezione>
        {modificata ? (
          <Pulsante type="submit" variante="primario" dimensione="sm" disabled={inCorso}>
            {inCorso ? tc("azioni.inCorso") : t("salva")}
          </Pulsante>
        ) : null}
        <Esito stato={modificata ? undefined : stato} />
        {browser && browser !== fuso && browser !== scelta ? (
          <Pulsante variante="fantasma" dimensione="sm" onClick={usaBrowser} disabled={inCorso}>
            {t("usaBrowser", { fuso: browser })}
          </Pulsante>
        ) : null}
      </div>
    </form>
  );
}
