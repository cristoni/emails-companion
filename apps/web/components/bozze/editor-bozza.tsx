"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { salvaBozzaAzione } from "@/app/(app)/drafts/azioni";
import { Aiuto, Etichetta, Input } from "@/components/ui/campi";
import { cn } from "@/components/ui/cn";
import { classiPulsante, Pulsante } from "@/components/ui/pulsante";

interface Testo {
  oggetto: string;
  corpo: string;
}

/** Stessa normalizzazione del caso d'uso: oggetto su una riga, a capo uniformi. */
const unaRiga = (s: string) => s.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
const aCapo = (s: string) => s.replace(/\r\n?/g, "\n");
const uguali = (x: Testo, y: Testo) => unaRiga(x.oggetto) === unaRiga(y.oggetto) && aCapo(x.corpo) === aCapo(y.corpo);

const ESITI = ["modificata", "versione_superata", "oggetto_non_valido", "corpo_non_valido", "non_modificabile", "non_trovata"];

/**
 * Editor di oggetto e corpo. Ogni salvataggio crea una nuova versione a partire da quella mostrata
 * (`versione` nascosta = versione di base). Il testo locale non viene mai sovrascritto da un
 * aggiornamento della pagina: una versione più recente salvata altrove è adottata solo se l'utente non
 * ha modifiche, altrimenti viene segnalata. "Rivedi e invia" è raggiungibile solo senza modifiche non
 * salvate e sulla versione corrente, così la conferma mostra esattamente il testo che l'utente vede.
 */
export function EditorBozza({
  bozzaId,
  versione,
  oggetto,
  corpo,
  lingua,
  limiti,
  intestazione,
  busta,
}: {
  bozzaId: string;
  versione: number;
  oggetto: string;
  corpo: string;
  lingua: string | null;
  limiti: { oggetto: number; corpo: number };
  intestazione?: React.ReactNode;
  busta: React.ReactNode;
}) {
  const t = useTranslations("bozze.editor");
  const [stato, esegui, inCorso] = useActionState(salvaBozzaAzione, undefined);
  const [base, setBase] = useState({ versione, oggetto, corpo });
  const [testo, setTesto] = useState<Testo>({ oggetto, corpo });
  const [ultimaVista, setUltimaVista] = useState(versione);

  if (versione !== ultimaVista) {
    setUltimaVista(versione);
    const arrivata = { oggetto, corpo };
    // Il proprio salvataggio (testo uguale alla nuova versione) o nessuna modifica locale: si adotta la nuova versione.
    if (uguali(testo, arrivata) || uguali(testo, base)) {
      setBase({ versione, oggetto, corpo });
      setTesto(arrivata);
    }
  }

  const superata = base.versione !== versione;
  const modificato = !uguali(testo, base);
  const puoRivedere = !modificato && !superata && !inCorso;

  useEffect(() => {
    if (!modificato) return;
    const avvisa = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avvisa);
    return () => window.removeEventListener("beforeunload", avvisa);
  }, [modificato]);

  const esito = stato?.esito;
  const messaggio = !esito || (esito === "modificata" && modificato) ? null : t(ESITI.includes(esito) ? `esiti.${esito}` : "esiti.errore");
  const successo = esito === "modificata";
  const carica = () => {
    setBase({ versione, oggetto, corpo });
    setTesto({ oggetto, corpo });
  };

  return (
    <form action={esegui} className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface-raised shadow-[var(--shadow-card)]">
      <input type="hidden" name="bozza" value={bozzaId} />
      <input type="hidden" name="versione" value={String(base.versione)} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 className="text-base">{t("titolo")}</h2>
        {intestazione}
      </div>

      <div className="px-5">{busta}</div>

      <div className="space-y-4 border-t border-border px-5 py-5">
        {superata ? (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-urgent/30 bg-urgent-soft px-4 py-3 text-sm">
            <p>{t("nuovaVersione")}</p>
            <Pulsante variante="secondario" dimensione="sm" onClick={carica}>
              {t("caricaUltima")}
            </Pulsante>
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Etichetta htmlFor="bozza-oggetto">{t("oggetto")}</Etichetta>
          <Input
            id="bozza-oggetto"
            name="oggetto"
            value={testo.oggetto}
            onChange={(e) => setTesto((x) => ({ ...x, oggetto: e.target.value }))}
            // Durante il salvataggio il testo non cambia: la versione salvata deve coincidere con quella mostrata.
            readOnly={inCorso}
            maxLength={limiti.oggetto}
            lang={lingua ?? undefined}
            dir="auto"
            autoComplete="off"
            aria-describedby="bozza-oggetto-aiuto"
          />
          <Aiuto id="bozza-oggetto-aiuto">{t("oggettoAiuto")}</Aiuto>
        </div>
        <div className="space-y-1.5">
          <Etichetta htmlFor="bozza-corpo">{t("corpo")}</Etichetta>
          {/* Come AreaTesto, ma con il carattere del testo: `cn` non fonde classi in conflitto. */}
          <textarea
            id="bozza-corpo"
            name="corpo"
            value={testo.corpo}
            onChange={(e) => setTesto((x) => ({ ...x, corpo: e.target.value }))}
            readOnly={inCorso}
            aria-busy={inCorso}
            maxLength={limiti.corpo}
            lang={lingua ?? undefined}
            dir="auto"
            rows={16}
            className="min-h-72 w-full rounded-lg border border-border bg-surface px-3 py-2 font-sans text-[15px] leading-relaxed placeholder:text-text-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:outline-none"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-muted px-5 py-3">
        <div className="min-h-5 space-y-0.5 text-xs" aria-live="polite">
          <p className={cn("font-medium", modificato ? "text-urgent" : "text-text-muted")}>{modificato ? t("modificheNonSalvate") : t("salvata")}</p>
          {messaggio ? (
            <p role={successo ? "status" : "alert"} className={successo ? "text-accent-strong" : "text-danger"}>
              {messaggio}
            </p>
          ) : null}
          {modificato ? <p id="bozza-rivedi-aiuto" className="text-text-muted">{t("rivediAiuto")}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {modificato && !superata ? (
            <Pulsante variante="fantasma" dimensione="sm" disabled={inCorso} onClick={() => setTesto({ oggetto: base.oggetto, corpo: base.corpo })}>
              {t("annulla")}
            </Pulsante>
          ) : null}
          <Pulsante type="submit" variante={modificato ? "primario" : "secondario"} dimensione="sm" disabled={inCorso || !modificato}>
            {inCorso ? t("salvataggio") : t("salva")}
          </Pulsante>
          {puoRivedere ? (
            <Link href={`/drafts/${bozzaId}/confirm`} className={classiPulsante("primario", "sm")}>
              {t("rivedi")}
            </Link>
          ) : (
            <Pulsante variante="secondario" dimensione="sm" disabled aria-describedby={modificato ? "bozza-rivedi-aiuto" : undefined}>
              {t("rivedi")}
            </Pulsante>
          )}
        </div>
      </div>
    </form>
  );
}
