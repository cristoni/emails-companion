import Link from "next/link";
import { useTranslations } from "next-intl";
import { ExternalLink, Eye, EyeOff, Paperclip } from "lucide-react";
import type { VistaEmailDto } from "@ec/applicazione";
import { LinkProvider } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { Avviso } from "@/components/ui/avviso";
import { Distintivo } from "@/components/ui/distintivo";
import { classiPulsante } from "@/components/ui/pulsante";
import { IntestazioneScheda, Scheda } from "@/components/ui/scheda";
import { ElencoIndirizzi, TestoIndirizzo } from "./indirizzi";

/** Intestazioni dell'email: mittente, destinatari, Reply-To e data nella lingua e nel fuso dell'utente. */
export function IntestazioniEmail({ email }: { email: VistaEmailDto }) {
  const t = useTranslations("posta.email");
  const righe: { etichetta: string; valore: React.ReactNode }[] = [
    { etichetta: t("da"), valore: <TestoIndirizzo indirizzo={email.mittente} /> },
    { etichetta: t("a"), valore: <ElencoIndirizzi indirizzi={email.a} vuoto={t("nessuno")} /> },
  ];
  if (email.cc.length > 0) righe.push({ etichetta: t("cc"), valore: <ElencoIndirizzi indirizzi={email.cc} vuoto={t("nessuno")} /> });
  if (email.replyTo.length > 0) righe.push({ etichetta: t("replyTo"), valore: <ElencoIndirizzi indirizzi={email.replyTo} vuoto={t("nessuno")} /> });
  righe.push({ etichetta: t("data"), valore: <Istante iso={email.ricevutaIl} stile="data_ora" /> });

  return (
    <section aria-labelledby="intestazioni-titolo">
      <h2 id="intestazioni-titolo" className="sr-only">
        {t("intestazioni")}
      </h2>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2 text-sm">
        {righe.map((r) => (
          <div key={r.etichetta} className="contents">
            <dt className="text-text-muted">{r.etichetta}</dt>
            <dd className="min-w-0">{r.valore}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Copie dell'email nelle Caselle collegate, con cartelle tradotte e il link all'originale nel provider. */
export function CopieEmail({ email }: { email: VistaEmailDto }) {
  const t = useTranslations("posta.copie");
  const tCartelle = useTranslations("comuni.cartelle");
  const tFonte = useTranslations("comuni.fonte");
  if (email.copie.length === 0) return null;
  return (
    <section aria-labelledby="copie-titolo" className="space-y-3">
      <div>
        <h2 id="copie-titolo" className="text-sm">
          {t("titolo")}
        </h2>
        {email.copie.length > 1 ? <p className="text-xs text-text-muted">{t("descrizione")}</p> : null}
      </div>
      <ul className="space-y-2">
        {email.copie.map((c) => (
          <li key={`${c.casellaId}-${c.idConnettore}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
            <div className="min-w-0 space-y-1.5">
              <p className="truncate font-mono text-[13px]">{c.indirizzo}</p>
              <div role="group" aria-label={t("cartelle")} className="flex flex-wrap items-center gap-1.5">
                {c.cartelle.length === 0 ? (
                  <span className="text-xs text-text-muted">{t("nessunaCartella")}</span>
                ) : (
                  c.cartelle.map((cartella) => (
                    <Distintivo key={cartella} tono="neutro">
                      {tCartelle(cartella)}
                    </Distintivo>
                  ))
                )}
                {c.origineInvio ? (
                  <span className="text-xs text-text-muted">{c.origineInvio === "app" ? t("inviataDallApp") : t("inviataFuori")}</span>
                ) : null}
              </div>
              {c.eliminataNelProvider ? <p className="text-xs text-urgent">{t("eliminata")}</p> : null}
            </div>
            <LinkProvider href={c.linkOriginale} className={classiPulsante("secondario", "sm")}>
              <ExternalLink className="size-3.5" aria-hidden />
              {tFonte("apriNelProvider")}
            </LinkProvider>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Allegati indicati solo per nome: l'app non li conserva. */
export function AllegatiEmail({ email }: { email: VistaEmailDto }) {
  const t = useTranslations("posta.allegati");
  if (email.allegati.length === 0) return null;
  return (
    <section aria-labelledby="allegati-titolo" className="space-y-2">
      <h2 id="allegati-titolo" className="text-sm">
        {t("titolo")}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {email.allegati.map((nome, i) => (
          <li key={`${nome}-${i}`} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-surface-muted px-2.5 py-1 text-sm">
            <Paperclip className="size-3.5 shrink-0 text-text-muted" aria-hidden />
            <TestoSemplice come="span" testo={nome} className="truncate" />
          </li>
        ))}
      </ul>
      <p className="text-xs text-text-muted">{t("nota")}</p>
    </section>
  );
}

export function NotaSoloPerRisposte() {
  const t = useTranslations("posta.soloPerRisposte");
  return (
    <Avviso tono="info" titolo={t("titolo")}>
      {t("testo")}
    </Avviso>
  );
}

/** Testo normalizzato dell'email: testo semplice nella lingua effettiva, senza link né immagini. */
export function TestoEmail({ email }: { email: VistaEmailDto }) {
  const t = useTranslations("posta.testo");
  return (
    <Scheda>
      <IntestazioneScheda titolo={t("titolo")} descrizione={t("descrizione")} />
      <div className="px-5 py-5">
        {email.testo.trim() ? (
          <TestoSemplice testo={email.testo} lingua={email.lingua.valore} className="text-[15px] leading-relaxed" />
        ) : (
          <p className="text-sm text-text-muted">{t("vuoto")}</p>
        )}
      </div>
    </Scheda>
  );
}

/**
 * Originale in una vista isolata (§13.3): l'iframe non ha mai `allow-scripts` né `allow-same-origin` e la
 * route applica la sua CSP con `sandbox`. Le immagini remote si mostrano solo su richiesta esplicita.
 * Sull'iframe non si imposta `color-scheme`: in tema scuro la differenza di schema con il documento fa
 * dipingere al browser uno sfondo opaco chiaro, così il testo dell'email resta leggibile.
 */
export function OriginaleEmail({ emailId, immagini, hrefMostra, hrefNascondi }: { emailId: string; immagini: boolean; hrefMostra: string; hrefNascondi: string }) {
  const t = useTranslations("posta.originale");
  const sorgente = `/original/${emailId}${immagini ? "?immagini=1" : ""}`;
  return (
    <Scheda id="originale" className="scroll-mt-6 overflow-hidden">
      <IntestazioneScheda
        titolo={t("titolo")}
        descrizione={t("descrizione")}
        azioni={
          immagini ? (
            <Link href={hrefNascondi} replace scroll={false} className={classiPulsante("secondario", "sm")}>
              <EyeOff className="size-3.5" aria-hidden />
              {t("nascondiImmagini")}
            </Link>
          ) : (
            <Link href={hrefMostra} replace scroll={false} className={classiPulsante("secondario", "sm")}>
              <Eye className="size-3.5" aria-hidden />
              {t("mostraImmagini")}
            </Link>
          )
        }
      />
      <p className="border-b border-border bg-surface-muted px-5 py-2 text-xs text-text-muted">{immagini ? t("immaginiVisibili") : t("avvisoImmagini")}</p>
      <iframe
        key={sorgente}
        src={sorgente}
        title={t("titoloFrame")}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        loading="lazy"
        className="block h-[70vh] min-h-96 w-full border-0"
      />
    </Scheda>
  );
}
