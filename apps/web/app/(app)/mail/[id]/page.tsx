import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { vistaEmail, vistaRianalisiEmail } from "@ec/applicazione";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { DistintivoCategoria, DistintivoDirezione, DistintivoUrgente } from "@/components/posta/distintivi";
import { SchedaClassificazione, SchedaFunzioni, SchedaLingua, SchedaSituazioni, type AzioniEmail } from "@/components/posta/interpretazione";
import { AllegatiEmail, CopieEmail, IntestazioniEmail, NotaSoloPerRisposte, OriginaleEmail, TestoEmail } from "@/components/posta/sezioni-email";
import { Scheda } from "@/components/ui/scheda";
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("posta.email");
  return { title: t("titoloPagina") };
}

/**
 * `/mail/[id]`: lettura di un'email in sola lettura. Intestazioni, copie con "Apri in Gmail", allegati per
 * nome, testo normalizzato e originale isolato; accanto, la classificazione dell'AI con le evidenze e le
 * correzioni annullabili, la lingua con la rianalisi su conferma, le Situazioni collegate e lo stato
 * delle Funzioni AI.
 */
export default async function PaginaEmail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Parametri> }) {
  await richiediOnboardingEssenziale();
  const [{ id }, parametri, locale, t] = await Promise.all([params, searchParams, getLocale(), getTranslations("posta")]);
  const immagini = primo(parametri.immagini) === "1";
  const richiestaId = primo(parametri.rianalisi);
  const prezziIncompleti = primo(parametri.prezzi) === "incompleti";

  const dati = await comeUtente(async (ctx, dip) => {
    const email = await vistaEmail(dip, ctx, id);
    if (!email) return null;
    const rianalisi = richiestaId ? await vistaRianalisiEmail(dip, ctx, email.id, richiestaId) : null;
    return { email, rianalisi };
  });
  if (!dati) notFound();
  const { email, rianalisi } = dati;

  const nome = nomiLingue(locale);
  const opzioniLingua = LINGUE_COMUNI.map((codice) => ({ codice, nome: nome(codice) ?? codice })).sort((a, b) => a.nome.localeCompare(b.nome, locale));
  const conRianalisi = rianalisi ? { rianalisi: rianalisi.richiestaId, prezzi: prezziIncompleti ? "incompleti" : undefined } : {};
  const c = email.classificazione;

  return (
    <article className="space-y-6">
      <Link href="/mail" className="inline-flex items-center gap-1.5 text-sm text-text-muted underline-offset-4 hover:text-text hover:underline">
        <ArrowLeft className="size-4" aria-hidden />
        {t("email.indietro")}
      </Link>

      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <DistintivoDirezione direzione={email.direzione} />
          {c ? <DistintivoCategoria categoria={c.categoria} /> : null}
          {c?.urgente ? <DistintivoUrgente etichetta={t("email.urgente")} /> : null}
        </div>
        <h1 className="text-2xl leading-tight">
          <TestoSemplice come="span" testo={email.oggetto.trim() || t("email.senzaOggetto")} lingua={email.oggetto.trim() ? email.lingua.valore : null} />
        </h1>
        <Scheda className="space-y-6 p-5">
          <IntestazioniEmail email={email} />
          <CopieEmail email={email} />
          <AllegatiEmail email={email} />
        </Scheda>
        {email.soloPerRisposte ? <NotaSoloPerRisposte /> : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <TestoEmail email={email} />
          <OriginaleEmail
            emailId={email.id}
            immagini={immagini}
            hrefMostra={href(email.id, { ...conRianalisi, immagini: "1" }, "originale")}
            hrefNascondi={href(email.id, conRianalisi, "originale")}
          />
        </div>
        <aside aria-label={t("email.interpretazione")} className="min-w-0 space-y-6">
          <SchedaClassificazione email={email} azioni={AZIONI} />
          <SchedaLingua
            email={email}
            nomeLingua={nome(email.lingua.valore)}
            opzioni={opzioniLingua}
            rianalisi={rianalisi}
            prezziIncompleti={prezziIncompleti}
            hrefSenzaRianalisi={href(email.id, { immagini: immagini ? "1" : undefined }, "rianalisi")}
            azioni={AZIONI}
          />
          <SchedaSituazioni email={email} />
          <SchedaFunzioni email={email} />
        </aside>
      </div>
    </article>
  );
}
