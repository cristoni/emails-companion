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

function Esito({ stato }: { stato: StatoAzione }) {
  const t = useTranslations("impostazioni.preferenze");
  const tc = useTranslations("comuni");
  const esito = stato?.esito;
  const testo = esito ? (t.has(`esiti.${esito}`) ? t(`esiti.${esito}`) : tc("esiti.errore")) : null;
  return (
    <span role="status" aria-live="polite" className={cn("text-xs", esito === "ok" ? "text-accent-strong" : "text-danger")}>
      {testo}
    </span>
  );
}

/** Lingua dell'interfaccia: dopo il salvataggio l'intera app viene riletta nella nuova lingua. */
export function ModuloLingua({ lingua, lingue }: { lingua: string; lingue: { codice: string; nome: string }[] }) {
  const t = useTranslations("impostazioni.preferenze");
  const tc = useTranslations("comuni");
  const [stato, azione, inCorso] = useActionState(impostaLinguaAzione, undefined);
  const id = useId();
  return (
    <form action={azione} className="space-y-1.5">
      <Etichetta htmlFor={`${id}-lingua`}>{t("lingua")}</Etichetta>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Selezione key={lingua} id={`${id}-lingua`} name="lingua" defaultValue={lingua} aria-describedby={`${id}-aiuto`} className="sm:max-w-xs">
          {lingue.map((l) => (
            <option key={l.codice} value={l.codice} lang={l.codice}>
              {l.nome}
            </option>
          ))}
        </Selezione>
        <Pulsante type="submit" dimensione="md" disabled={inCorso}>
          {inCorso ? tc("azioni.inCorso") : t("salva")}
        </Pulsante>
        <Esito stato={stato} />
      </div>
      <Aiuto id={`${id}-aiuto`}>{t("linguaAiuto")}</Aiuto>
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
    <fieldset className="space-y-1.5" aria-describedby={`${id}-aiuto`}>
      <legend className="text-sm font-medium">{t("tema")}</legend>
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-border bg-surface-muted p-0.5">
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
        <Esito stato={stato?.esito === "ok" ? undefined : stato} />
      </div>
      <Aiuto id={`${id}-aiuto`}>{t("temaAiuto")}</Aiuto>
    </fieldset>
  );
}

/** Fuso orario IANA: elenco preparato dal server, più il comando per usare quello del browser. */
export function ModuloFuso({ fuso, fusi }: { fuso: string; fusi: string[] }) {
  const t = useTranslations("impostazioni.preferenze");
  const tc = useTranslations("comuni");
  const [stato, azione, inCorso] = useActionState(impostaFusoAzione, undefined);
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
    modulo.current?.requestSubmit();
  };

  return (
    <form ref={modulo} action={azione} className="space-y-1.5">
      <Etichetta htmlFor={`${id}-fuso`}>{t("fuso")}</Etichetta>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Selezione key={fuso} id={`${id}-fuso`} name="fuso" defaultValue={fuso} aria-describedby={`${id}-aiuto`} className="font-mono sm:max-w-xs">
          {elenco.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </Selezione>
        <Pulsante type="submit" disabled={inCorso}>
          {inCorso ? tc("azioni.inCorso") : t("salva")}
        </Pulsante>
        <Esito stato={stato} />
      </div>
      <Aiuto id={`${id}-aiuto`}>{t("fusoAiuto")}</Aiuto>
      {browser && browser !== fuso ? (
        <Pulsante variante="fantasma" dimensione="sm" onClick={usaBrowser} disabled={inCorso}>
          {t("usaBrowser", { fuso: browser })}
        </Pulsante>
      ) : null}
    </form>
  );
}
