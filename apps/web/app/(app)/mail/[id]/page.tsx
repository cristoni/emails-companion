import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { casellePosta, vistaEmail, vistaRianalisiEmail, type StatoAnalisiEmail, type VistaEmailDto } from "@ec/applicazione";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { DistintivoStatoAnalisi, DistintivoUrgente } from "@/components/posta/distintivi";
import { SchedaAi, SituazioniEmail, type AzioniEmail } from "@/components/posta/interpretazione";
import {
  AllegatiEmail,
  CopieEmail,
  CorpoEmail,
  IntestazioniEmail,
  linkUnicoAlProvider,
  PulsanteProvider,
  type VistaCorpo,
} from "@/components/posta/sezioni-email";
import { richiediOnboardingEssenziale } from "@/lib/server/onboarding";
import { comeUtente } from "@/lib/server/sessione";
import {
  annullaCorrezioniAzione,
  cambiaCategoriaAzione,
  cambiaLinguaAzione,
  cambiaUrgenzaAzione,
  confermaRianalisiAzione,
  stimaRianalisiAzione,
} from "./azioni";

type Parametri = Record<string, string | string[] | undefined>;

/** Lingue proposte nella correzione (codici ISO 639-1); le altre si inseriscono con il campo libero. */
const LINGUE_COMUNI = ["ar", "cs", "da", "de", "el", "en", "es", "fi", "fr", "he", "hi", "hu", "it", "ja", "ko", "nl", "no", "pl", "pt", "ro", "ru", "sv", "tr", "uk", "zh"];

const AZIONI: AzioniEmail = {
  categoria: cambiaCategoriaAzione,
  urgenza: cambiaUrgenzaAzione,
  lingua: cambiaLinguaAzione,
  annulla: annullaCorrezioniAzione,
  stimaRianalisi: stimaRianalisiAzione,
  confermaRianalisi: confermaRianalisiAzione,
};

function primo(valore: string | string[] | undefined): string | undefined {
  const v = Array.isArray(valore) ? valore[0] : valore;
  return v ? v.slice(0, 200) : undefined;
}

/** Nome della lingua nella lingua dell'interfaccia; null se il codice non è riconosciuto. */
function nomiLingue(locale: string) {
  let nomi: Intl.DisplayNames | null = null;
  try {
    nomi = new Intl.DisplayNames([locale], { type: "language" });
  } catch {
    nomi = null;
  }
  return (codice: string): string | null => {
    try {
      const nome = nomi?.of(codice);
      return nome && nome.toLowerCase() !== codice.toLowerCase() ? nome : null;
    } catch {
      return null;
    }
  };
}

function href(emailId: string, parametri: Record<string, string | undefined>, ancora?: string): string {
  const q = new URLSearchParams(Object.entries(parametri).filter((v): v is [string, string] => Boolean(v[1]))).toString();
  return `/mail/${emailId}${q ? `?${q}` : ""}${ancora ? `#${ancora}` : ""}`;
}

/**
 * Stato d'analisi da segnalare nell'intestazione, con le stesse precedenze dell'elenco `/mail` (così la riga
 * e il dettaglio mostrano lo stesso distintivo). "In attesa" non si ripete quando la scheda dell'AI dice già
 * che l'email non è ancora classificata.
 */
function analisiDaSegnalare(email: VistaEmailDto): StatoAnalisiEmail | null {
  const stati = email.analisi.map((a) => a.stato);
  if (stati.includes("in_pausa")) return "in_pausa";
  if (stati.includes("da_eseguire")) {
    const inAttesaNellaScheda = !email.classificazione && email.direzione === "entrata" && !email.soloPerRisposte;
    return inAttesaNellaScheda ? null : "da_analizzare";
  }
  if (stati.includes("errore")) return "errore";
  return null;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("posta.email");
  return { title: t("titoloPagina") };
}

/**
 * `/mail/[id]`: lettura di un'email in sola lettura. In alto i distintivi delle sole eccezioni (urgente,
 * analisi ferma o in attesa: la categoria sta già nella scheda dell'AI), l'intestazione compatta con "Apri in
 * Gmail" accanto all'oggetto (solo icona sotto `sm`), le copie quando c'è
 * qualcosa da segnalare, gli allegati per nome e le Situazioni collegate (con il punto da cui rispondere);
 * sotto, il corpo (testo semplice o originale isolato, scelti nell'URL) e accanto la scheda dell'AI:
 * classificazione con le evidenze e le correzioni annullabili, lingua con la rianalisi su conferma, dettagli
 * tecnici a richiesta.
 */
export default async function PaginaEmail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Parametri> }) {
  await richiediOnboardingEssenziale();
  const [{ id }, parametri, locale, t] = await Promise.all([params, searchParams, getLocale(), getTranslations("posta")]);
  const immagini = primo(parametri.immagini) === "1";
  // "Mostra immagini" vale solo per l'originale: lo implica.
  const vista: VistaCorpo = immagini || primo(parametri.vista) === "originale" ? "originale" : "testo";
  const richiestaId = primo(parametri.rianalisi);
  const prezziIncompleti = primo(parametri.prezzi) === "incompleti";

  const dati = await comeUtente(async (ctx, dip) => {
    const email = await vistaEmail(dip, ctx, id);
    if (!email) return null;
    const [rianalisi, caselle] = await Promise.all([
      richiestaId ? vistaRianalisiEmail(dip, ctx, email.id, richiestaId) : null,
      casellePosta(dip, ctx),
    ]);
    return { email, rianalisi, piuCaselle: caselle.length > 1 };
  });
  if (!dati) notFound();
  const { email, rianalisi, piuCaselle } = dati;

  const nome = nomiLingue(locale);
  const opzioniLingua = LINGUE_COMUNI.map((codice) => ({ codice, nome: nome(codice) ?? codice })).sort((a, b) => a.nome.localeCompare(b.nome, locale));
  const conRianalisi = rianalisi ? { rianalisi: rianalisi.richiestaId, prezzi: prezziIncompleti ? "incompleti" : undefined } : {};
  const originale = { vista: "originale" };
  const vistaCorpo: Record<string, string> = vista === "originale" ? { vista: "originale", ...(immagini ? { immagini: "1" } : {}) } : {};
  const c = email.classificazione;
  const linkProvider = linkUnicoAlProvider(email);
  const statoAnalisi = analisiDaSegnalare(email);

  return (
    <article className="space-y-5">
      <Link href="/mail" className="-ml-1 inline-flex h-9 items-center gap-1.5 rounded-lg px-1 text-sm text-text-muted underline-offset-4 hover:text-text hover:underline">
        <ArrowLeft className="size-4" aria-hidden />
        {t("email.indietro")}
      </Link>

      <header className="space-y-3">
        {c?.urgente || statoAnalisi ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {c?.urgente ? <DistintivoUrgente etichetta={t("email.urgente")} /> : null}
            {statoAnalisi ? (
              <a href="#funzioni-ai" className="rounded-full hover:opacity-80">
                <DistintivoStatoAnalisi stato={statoAnalisi} />
              </a>
            ) : null}
          </div>
        ) : null}
        <div className="flex items-start justify-between gap-3 sm:gap-4">
          <h1 className="min-w-0 text-2xl leading-tight break-words">
            <TestoSemplice come="span" testo={email.oggetto.trim() || t("email.senzaOggetto")} lingua={email.oggetto.trim() ? email.lingua.valore : null} />
          </h1>
          <PulsanteProvider href={linkProvider} compatto />
        </div>
        <IntestazioniEmail email={email} />
        <CopieEmail email={email} piuCaselle={piuCaselle} />
        <AllegatiEmail email={email} />
      </header>

      <SituazioniEmail email={email} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <CorpoEmail
          email={email}
          vista={vista}
          immagini={immagini}
          hrefTesto={href(email.id, conRianalisi, "originale")}
          hrefOriginale={href(email.id, { ...conRianalisi, ...originale }, "originale")}
          hrefMostra={href(email.id, { ...conRianalisi, ...originale, immagini: "1" }, "originale")}
          hrefNascondi={href(email.id, { ...conRianalisi, ...originale }, "originale")}
        />
        <aside aria-labelledby="ai-titolo" className="min-w-0">
          <SchedaAi
            email={email}
            nomeLingua={nome(email.lingua.valore)}
            opzioniLingua={opzioniLingua}
            rianalisi={rianalisi}
            prezziIncompleti={prezziIncompleti}
            hrefSenzaRianalisi={href(email.id, vistaCorpo, "rianalisi")}
            hrefTesto={href(email.id, conRianalisi)}
            vistaCorpo={vistaCorpo}
            azioni={AZIONI}
          />
        </aside>
      </div>
    </article>
  );
}
