"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { salvaBozzaAzione } from "@/app/(app)/drafts/azioni";
import { Avviso } from "@/components/ui/avviso";
import { AreaTesto, Etichetta, Input } from "@/components/ui/campi";
import { cn } from "@/components/ui/cn";
import { CLASSE_LINK } from "@/components/ui/collegamento";
import { classiPulsante, Pulsante } from "@/components/ui/pulsante";
import { CLASSE_RIGA_BUSTA } from "./griglia";

interface Testo {
  oggetto: string;
  corpo: string;
}

/** Stessa normalizzazione del caso d'uso: oggetto su una riga, a capo uniformi. */
const unaRiga = (s: string) => s.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
const aCapo = (s: string) => s.replace(/\r\n?/g, "\n");
const uguali = (x: Testo, y: Testo) => unaRiga(x.oggetto) === unaRiga(y.oggetto) && aCapo(x.corpo) === aCapo(y.corpo);

const ESITI = ["versione_superata", "oggetto_non_valido", "corpo_non_valido", "non_modificabile", "non_trovata"];

/**
 * Un clic su un link interno che lascerebbe la pagina: senza conferma dell'utente non parte, così le
 * modifiche non salvate non si perdono nella navigazione dell'app (che non passa da `beforeunload`).
 * Ignora i clic con tasti modificatori, le nuove schede, i download e le ancore della stessa pagina.
 */
function lasciaLaPagina(e: MouseEvent): boolean {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
  if (!(link instanceof HTMLAnchorElement)) return false;
  if ((link.target && link.target !== "_self") || link.hasAttribute("download")) return false;
  const destinazione = new URL(link.href, window.location.href);
  if (destinazione.origin !== window.location.origin) return false;
  return destinazione.pathname !== window.location.pathname || destinazione.search !== window.location.search;
}

/**
 * Editor di oggetto e corpo, sotto la busta in sola lettura. Ogni salvataggio crea una nuova versione a
 * partire da quella mostrata (`versione` nascosta = versione di base). Il testo locale non viene mai
 * sovrascritto da un aggiornamento della pagina: una versione più recente salvata altrove è adottata solo se
 * l'utente non ha modifiche, altrimenti viene segnalata. "Rivedi prima di inviare" porta alla conferma ed è
 * raggiungibile solo senza modifiche non salvate e sulla versione corrente, così la conferma mostra
 * esattamente il testo che l'utente vede. Il piede con l'azione resta in vista mentre si scorre.
 */
export function EditorBozza({
  bozzaId,
  versione,
  oggetto,
  corpo,
  lingua,
  limiti,
  oggettoSuggerito,
  salvataIl,
  busta,
}: {
  bozzaId: string;
  versione: number;
  oggetto: string;
  corpo: string;
  lingua: string | null;
  limiti: { oggetto: number; corpo: number };
  /** Oggetto calcolato dall'app per restare nel thread: mostrato solo se diverso da quello nel campo. */
  oggettoSuggerito: string | null;
  /** Istante della versione mostrata, già formattato dal server. */
  salvataIl: React.ReactNode;
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
  const domandaUscita = t("esciSenzaSalvare");
  const piede = useRef<HTMLDivElement>(null);

  // Il piede resta fisso in basso: lo scorrimento automatico verso il cursore rispetta `scroll-padding`, così
  // la riga in cui si scrive resta visibile sopra il piede invece di finirci sotto.
  useEffect(() => {
    const el = piede.current;
    if (!el) return;
    const radice = document.documentElement;
    const aggiorna = () => {
      radice.style.scrollPaddingBottom = `${el.offsetHeight + 8}px`;
    };
    aggiorna();
    const osservatore = new ResizeObserver(aggiorna);
    osservatore.observe(el);
    return () => {
      osservatore.disconnect();
      radice.style.scrollPaddingBottom = "";
    };
  }, []);

  useEffect(() => {
    if (!modificato) return;
    const avvisa = (e: BeforeUnloadEvent) => e.preventDefault();
    // In cattura sul documento: precede il gestore di <Link>, che così non naviga se l'utente rinuncia.
    const clic = (e: MouseEvent) => {
      if (!lasciaLaPagina(e) || window.confirm(domandaUscita)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("beforeunload", avvisa);
    document.addEventListener("click", clic, true);
    return () => {
      window.removeEventListener("beforeunload", avvisa);
      document.removeEventListener("click", clic, true);
    };
  }, [modificato, domandaUscita]);

  const esito = stato?.esito;
  // Il salvataggio riuscito lo dice già lo stato "Salvata" nel piede: qui solo gli errori.
  const errore = !esito || esito === "modificata" ? null : t(ESITI.includes(esito) ? `esiti.${esito}` : "esiti.errore");
  const carica = () => {
    setBase({ versione, oggetto, corpo });
    setTesto({ oggetto, corpo });
  };
  const suggerimento = oggettoSuggerito && unaRiga(oggettoSuggerito) !== unaRiga(testo.oggetto) ? oggettoSuggerito : null;

  return (
    // Niente overflow-hidden: impedirebbe al piede di restare in vista (sticky).
    <form
      action={esegui}
      // Senza modifiche non c'è un pulsante Salva: Invio nel campo dell'oggetto non deve creare una versione identica.
      onSubmit={(e) => {
        if (!modificato || inCorso) e.preventDefault();
      }}
      className="rounded-[var(--radius-card)] border border-border bg-surface-raised shadow-[var(--shadow-card)]"
    >
      <input type="hidden" name="bozza" value={bozzaId} />
      <input type="hidden" name="versione" value={String(base.versione)} />

      <div className="px-5 pt-3 pb-2">{busta}</div>

      <div className="space-y-3 border-t border-border px-5 pt-4 pb-5">
        {superata ? (
          <Avviso
            tono="attenzione"
            titolo={t("nuovaVersione")}
            azione={
              <Pulsante variante="secondario" dimensione="sm" onClick={carica}>
                {t("caricaUltima")}
              </Pulsante>
            }
          />
        ) : null}
        <div className="space-y-1">
          <div className={CLASSE_RIGA_BUSTA}>
            <Etichetta htmlFor="bozza-oggetto" className="font-normal text-text-muted">
              {t("oggetto")}
            </Etichetta>
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
              aria-describedby={suggerimento ? "bozza-oggetto-aiuto" : undefined}
              className="font-medium"
            />
          </div>
          {suggerimento ? (
            <div className={cn(CLASSE_RIGA_BUSTA, "items-center")}>
              <span aria-hidden />
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-text-muted">
                <span id="bozza-oggetto-aiuto">
                  {t.rich("oggettoDiverso", {
                    oggetto: () => (
                      <span lang={lingua ?? undefined} dir="auto" className="font-medium text-text">
                        {suggerimento}
                      </span>
                    ),
                  })}
                </span>
                {/* Cambia solo il testo nel campo: il salvataggio resta esplicito. */}
                <button
                  type="button"
                  disabled={inCorso}
                  onClick={() => setTesto((x) => ({ ...x, oggetto: suggerimento }))}
                  className={cn(CLASSE_LINK, "inline-flex min-h-9 items-center font-medium disabled:opacity-50 sm:min-h-0")}
                >
                  {t("usaSuggerito")}
                </button>
              </p>
            </div>
          ) : null}
        </div>
        <div>
          <label htmlFor="bozza-corpo" className="sr-only">
            {t("corpo")}
          </label>
          <AreaTesto
            id="bozza-corpo"
            name="corpo"
            value={testo.corpo}
            onChange={(e) => setTesto((x) => ({ ...x, corpo: e.target.value }))}
            readOnly={inCorso}
            aria-busy={inCorso}
            maxLength={limiti.corpo}
            lang={lingua ?? undefined}
            dir="auto"
            // Cresce con il testo fino a 65vh; dove field-sizing non c'è restano 8 righe ridimensionabili.
            rows={8}
            className="field-sizing-content max-h-[65vh] min-h-48 resize-y text-[15px]"
          />
        </div>
      </div>

      <div
        ref={piede}
        className="sticky bottom-0 z-10 flex items-center justify-between gap-3 rounded-b-[var(--radius-card)] border-t border-border bg-surface-muted/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:gap-4 sm:px-5"
      >
        <div className="min-w-0 flex-1 space-y-0.5 text-sm">
          <p className={cn("flex items-center gap-1.5", modificato ? "font-medium text-urgent" : "text-text-muted")}>
            {modificato ? null : <CheckCircle2 className="size-4 shrink-0 text-accent-strong" aria-hidden />}
            {/* Annunciati solo i testi stabili: l'istante relativo cambia a ogni aggiornamento della pagina. */}
            <span aria-live="polite">{modificato ? t("modificheNonSalvate") : t("salvata")}</span>
            {/* Su schermi stretti l'istante andrebbe a capo accanto al pulsante: resta solo "Salvata". */}
            {modificato ? null : <span className="hidden whitespace-nowrap sm:inline">{salvataIl}</span>}
          </p>
          {errore ? (
            <p role="alert" className="text-xs text-danger">
              {errore}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {modificato && !superata ? (
            <Pulsante
              variante="fantasma"
              dimensione="sm"
              disabled={inCorso}
              // Scarta tutto il testo scritto: accanto a "Salva", chiede conferma come l'uscita dalla pagina.
              onClick={() => {
                if (window.confirm(t("scartaDomanda"))) setTesto({ oggetto: base.oggetto, corpo: base.corpo });
              }}
            >
              {t("annulla")}
            </Pulsante>
          ) : null}
          {modificato ? (
            <Pulsante type="submit" variante="primario" dimensione="md" disabled={inCorso}>
              {inCorso ? t("salvataggio") : t("salva")}
            </Pulsante>
          ) : puoRivedere ? (
            <Link href={`/drafts/${bozzaId}/confirm`} className={classiPulsante("primario", "md")}>
              {t("rivedi")}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : (
            <Pulsante variante="secondario" dimensione="md" disabled>
              {t("rivedi")}
              <ArrowRight className="size-4" aria-hidden />
            </Pulsante>
          )}
        </div>
      </div>
    </form>
  );
}
