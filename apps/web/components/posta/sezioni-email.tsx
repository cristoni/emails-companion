import Link from "next/link";
import { useTranslations } from "next-intl";
import { ExternalLink, Eye, EyeOff, Paperclip } from "lucide-react";
import type { VistaEmailDto } from "@ec/applicazione";
import type { Cartella, Direzione } from "@ec/core/dominio";
import { LinkProvider } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { cn } from "@/components/ui/cn";
import { Espandibile } from "@/components/ui/espandibile";
import { classiPulsante } from "@/components/ui/pulsante";
import { Scheda } from "@/components/ui/scheda";
import { IndirizziInLinea, TestoIndirizzo } from "./indirizzi";

/** Link al provider da mostrare accanto all'oggetto: solo se una sola copia ce l'ha, altrimenti sta nell'elenco delle copie. */
export function linkUnicoAlProvider(email: VistaEmailDto): string | null {
  const conLink = email.copie.filter((c) => c.linkOriginale);
  return conLink.length === 1 ? conLink[0]!.linkOriginale : null;
}

/**
 * "Apri in Gmail" come pulsante secondario, in una nuova scheda e senza referrer. `compatto`: sotto `sm` resta
 * solo l'icona (il testo vale per i lettori di schermo), così il pulsante sta accanto all'oggetto senza
 * spingere mittente e data su un'altra riga.
 */
export function PulsanteProvider({ href, compatto = false }: { href: string | null; compatto?: boolean }) {
  const t = useTranslations("comuni.fonte");
  return (
    <LinkProvider href={href} className={cn(classiPulsante("secondario", "sm"), "shrink-0")}>
      <ExternalLink className="size-3.5" aria-hidden />
      <span className={compatto ? "sr-only sm:not-sr-only" : undefined}>{t("apriNelProvider")}</span>
    </LinkProvider>
  );
}

/**
 * Intestazioni dell'email in forma compatta: mittente in evidenza, destinatari e data sulla stessa riga;
 * Cc e Reply-To solo se presenti. Data nella lingua e nel fuso dell'utente.
 */
export function IntestazioniEmail({ email }: { email: VistaEmailDto }) {
  const t = useTranslations("posta.email");
  return (
    <section aria-labelledby="intestazioni-titolo" className="space-y-1 text-sm">
      <h2 id="intestazioni-titolo" className="sr-only">
        {t("intestazioni")}
      </h2>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <p className="min-w-0">
          <span className="sr-only">{t("da")} </span>
          <TestoIndirizzo indirizzo={email.mittente} className="font-semibold" />{" "}
          <span className="text-text-muted">{t("a")}</span> <IndirizziInLinea indirizzi={email.a} vuoto={t("nessuno")} />
        </p>
        <Istante iso={email.ricevutaIl} stile="data_ora" className="shrink-0 text-text-muted" />
      </div>
      {email.cc.length > 0 ? (
        <p>
          <span className="text-text-muted">{t("cc")}</span> <IndirizziInLinea indirizzi={email.cc} vuoto={t("nessuno")} />
        </p>
      ) : null}
      {email.replyTo.length > 0 ? (
        <p>
          <span className="text-text-muted">{t("replyTo")}</span> <IndirizziInLinea indirizzi={email.replyTo} vuoto={t("nessuno")} />
        </p>
      ) : null}
    </section>
  );
}

/** Cartelle ovvie per la direzione dell'email: non si mostrano, come "Posta in arrivo" per una ricevuta. */
const CARTELLE_OVVIE: Record<Direzione, readonly Cartella[]> = {
  entrata: ["in_arrivo"],
  uscita: ["inviata"],
  interna: ["in_arrivo", "inviata"],
};

/**
 * Copie dell'email nelle Caselle collegate, solo per le eccezioni: la casella quando l'utente ne ha più
 * d'una (o l'email sta in più caselle), le cartelle non ovvie per la direzione (Spam, Cestino, Archiviata…)
 * e l'invio da questa app (l'invio da Gmail è il caso normale e non si dice). Con una sola copia senza nulla
 * da segnalare non si mostra niente; con più copie,
 * l'elenco a richiesta con "Apri in Gmail" per ciascuna.
 */
export function CopieEmail({ email, piuCaselle }: { email: VistaEmailDto; piuCaselle: boolean }) {
  const t = useTranslations("posta.copie");
  const tCartelle = useTranslations("comuni.cartelle");
  if (email.copie.length === 0) return null;
  const pulsanti = email.copie.filter((c) => c.linkOriginale).length > 1;
  const mostraCasella = piuCaselle || email.copie.length > 1;

  const parti = (c: VistaEmailDto["copie"][number]) => {
    const dallApp = c.origineInvio === "app";
    // Con "Inviata da questa app", "Inviata" la ripeterebbe.
    const cartelle = c.cartelle.filter((x) => !CARTELLE_OVVIE[email.direzione].includes(x) && !(dallApp && x === "inviata"));
    return [
      mostraCasella ? t("inCasella", { indirizzo: c.indirizzo }) : null,
      c.cartelle.length === 0 ? t("nessunaCartella") : cartelle.map((x) => tCartelle(x)).join(", ") || null,
      dallApp ? t("inviataDallApp") : null,
    ].filter(Boolean);
  };
  const dettagli = (c: VistaEmailDto["copie"][number]) => (
    <>
      <span className="text-text-muted">{parti(c).join(" · ")}</span>
      {c.eliminataNelProvider ? <span className="block text-urgent">{t("eliminata")}</span> : null}
    </>
  );

  if (email.copie.length === 1) {
    const copia = email.copie[0]!;
    if (parti(copia).length === 0 && !copia.eliminataNelProvider) return null;
    return <p className="text-xs break-words">{dettagli(copia)}</p>;
  }
  return (
    <Espandibile titolo={t("piuCaselle", { numero: email.copie.length })} className="text-xs" classeContenuto="mt-2">
      <ul className="space-y-2">
        {email.copie.map((c) => (
          <li key={`${c.casellaId}-${c.idConnettore}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <p className="min-w-0 text-xs break-words">{dettagli(c)}</p>
            {pulsanti ? <PulsanteProvider href={c.linkOriginale} /> : null}
          </li>
        ))}
      </ul>
    </Espandibile>
  );
}

/** Allegati indicati solo per nome: l'app non li conserva. */
export function AllegatiEmail({ email }: { email: VistaEmailDto }) {
  const t = useTranslations("posta.allegati");
  if (email.allegati.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ul aria-label={t("titolo")} className="flex min-w-0 flex-wrap gap-2">
        {email.allegati.map((nome, i) => (
          <li key={`${nome}-${i}`} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-surface-muted px-2.5 py-1 text-sm">
            <Paperclip className="size-3.5 shrink-0 text-text-muted" aria-hidden />
            <TestoSemplice come="span" testo={nome} className="truncate" />
          </li>
        ))}
      </ul>
      <p className="text-xs text-text-muted">{t("nota")}</p>
    </div>
  );
}

export type VistaCorpo = "testo" | "originale";

/** Citazione verificata tratta da questa email; `id` è l'ancora della sua evidenza nel testo. */
interface Citazione {
  id: string;
  testo: string;
}

/**
 * Parti del testo con le citazioni verificate evidenziate: solo occorrenze esatte, unite se si
 * sovrappongono. Ogni parte evidenziata porta le ancore delle citazioni che contiene. Senza corrispondenze
 * il testo resta un'unica parte.
 */
function partiEvidenziate(testo: string, citazioni: readonly Citazione[]): { testo: string; ancore: string[] | null }[] {
  const intervalli = citazioni
    .map((c) => ({ id: c.id, testo: c.testo.trim() }))
    .filter((c) => c.testo.length > 0)
    .flatMap((c) => {
      const inizio = testo.indexOf(c.testo);
      return inizio === -1 ? [] : [{ id: c.id, inizio, fine: inizio + c.testo.length }];
    })
    .sort((a, b) => a.inizio - b.inizio);
  const parti: { testo: string; ancore: string[] | null }[] = [];
  let posizione = 0;
  for (const { id, inizio, fine } of intervalli) {
    if (fine <= posizione) {
      // Citazione già coperta da una parte evidenziata: ne condivide l'ancora.
      parti.at(-1)?.ancore?.push(id);
      continue;
    }
    const da = Math.max(inizio, posizione);
    if (da > posizione) parti.push({ testo: testo.slice(posizione, da), ancore: null });
    parti.push({ testo: testo.slice(da, fine), ancore: [id] });
    posizione = fine;
  }
  if (posizione < testo.length) parti.push({ testo: testo.slice(posizione), ancore: null });
  return parti;
}

/** Testo dell'email come testo semplice (mai HTML), con le citazioni delle evidenze marcate. */
function TestoConEvidenze({ testo, lingua, citazioni }: { testo: string; lingua: string; citazioni: readonly Citazione[] }) {
  const t = useTranslations("posta.testo");
  return (
    <div lang={lingua} dir="auto" className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
      {partiEvidenziate(testo, citazioni).map((p, i) =>
        p.ancore ? (
          <mark key={i} id={p.ancore[0]} title={t("citazione")} className="scroll-mt-6 rounded-sm bg-accent-soft text-text">
            {p.ancore.slice(1).map((ancora) => (
              <span key={ancora} id={ancora} className="scroll-mt-6" />
            ))}
            {p.testo}
          </mark>
        ) : (
          p.testo
        ),
      )}
    </div>
  );
}

const VOCE = "inline-flex h-9 items-center rounded-md px-3 text-sm transition-colors sm:h-8";

/**
 * Corpo dell'email in una sola scheda, con due viste scelte da link (stato nell'URL, funziona senza
 * JavaScript). Il testo semplice, predefinito, è quello letto dall'AI e citato dalle evidenze (`#testo`), con
 * le citazioni verificate evidenziate. L'originale è isolato (§13.3): l'iframe non ha mai `allow-scripts` né
 * `allow-same-origin` e la route applica la sua CSP con `sandbox`; le immagini remote si mostrano solo su
 * richiesta esplicita. Sull'iframe non si imposta `color-scheme`: in tema scuro la differenza di schema con
 * il documento fa dipingere al browser uno sfondo opaco chiaro, così il testo dell'email resta leggibile.
 * L'altezza è fissa (lo script che la adatterebbe al contenuto non può girare) e l'utente può allungarla
 * trascinando il bordo.
 */
export function CorpoEmail({
  email,
  vista,
  immagini,
  hrefTesto,
  hrefOriginale,
  hrefMostra,
  hrefNascondi,
}: {
  email: VistaEmailDto;
  vista: VistaCorpo;
  immagini: boolean;
  hrefTesto: string;
  hrefOriginale: string;
  hrefMostra: string;
  hrefNascondi: string;
}) {
  const t = useTranslations("posta");
  const sorgente = `/original/${email.id}${immagini ? "?immagini=1" : ""}`;
  const voce = (attiva: boolean) => cn(VOCE, attiva ? "bg-surface-raised font-medium text-text shadow-[var(--shadow-card)]" : "text-text-muted hover:text-text");

  return (
    <Scheda id="originale" className="min-w-0 scroll-mt-6 overflow-hidden">
      <h2 className="sr-only">{t("corpo.titolo")}</h2>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5 sm:px-4">
        <nav aria-label={t("corpo.etichetta")} className="inline-flex rounded-lg border border-border bg-surface-muted p-0.5">
          <Link href={hrefTesto} replace scroll={false} aria-current={vista === "testo" ? "page" : undefined} className={voce(vista === "testo")}>
            {t("testo.titolo")}
          </Link>
          <Link href={hrefOriginale} replace scroll={false} aria-current={vista === "originale" ? "page" : undefined} className={voce(vista === "originale")}>
            {t("originale.titolo")}
          </Link>
        </nav>
        {vista === "originale" ? (
          <Link href={immagini ? hrefNascondi : hrefMostra} replace scroll={false} className={classiPulsante("fantasma", "sm")}>
            {immagini ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
            {immagini ? t("originale.nascondiImmagini") : t("originale.mostraImmagini")}
          </Link>
        ) : null}
      </div>

      {vista === "testo" ? (
        <div id="testo" className="scroll-mt-6 px-5 py-5">
          {email.testo.trim() ? (
            <TestoConEvidenze
              testo={email.testo}
              lingua={email.lingua.valore}
              citazioni={(email.classificazione?.evidenze ?? []).flatMap((e, i) =>
                e.verificata && e.emailId === email.id ? [{ id: `citazione-${i}`, testo: e.citazione }] : [],
              )}
            />
          ) : (
            <p className="text-sm text-text-muted">{t("testo.vuoto")}</p>
          )}
        </div>
      ) : (
        <>
          <p className="border-b border-border bg-surface-muted px-4 py-2 text-xs text-text-muted sm:px-5">
            {immagini ? t("originale.immaginiVisibili") : t("originale.avvisoImmagini")}
          </p>
          <div className="h-[min(65vh,36rem)] min-h-48 resize-y overflow-hidden">
            <iframe
              key={sorgente}
              src={sorgente}
              title={t("originale.titoloFrame")}
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              loading="lazy"
              className="block h-full w-full border-0"
            />
          </div>
        </>
      )}
    </Scheda>
  );
}
