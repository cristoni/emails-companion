import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import {
  bozzeDellaSituazione,
  emailDellaSituazioneWeb,
  vistaSituazione,
  type CorrezioneEmailDto,
  type UrgenzaEmailOrigineDto,
  type VistaSituazioneDto,
} from "@ec/applicazione";
import { richiediOnboardingEssenziale } from "@/lib/server/onboarding";
import { comeUtente } from "@/lib/server/sessione";
import { SezioneBozze } from "@/components/bozze/sezione-bozze";
import { ApriAncora } from "@/components/situazione/apri-ancora";
import { SezioneAttese } from "@/components/situazione/attese";
import { SezioneAttivita } from "@/components/situazione/attivita";
import { creaContesto } from "@/components/situazione/comuni";
import { correzioniDelRifiuto, correzioniDellaConferma } from "@/components/situazione/correzioni-collegate";
import { SezioneCronologia } from "@/components/situazione/cronologia";
import { SezioneFonti } from "@/components/situazione/fonti";
import { IntestazioneSituazione, PulsanteArchivio } from "@/components/situazione/intestazione";
import { PannelloPerche, PulsantePerche } from "@/components/situazione/perche";
import { emailInEvidenza, ProssimaAzione, testiProssimaAzione } from "@/components/situazione/prossima-azione";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("situazione");
  return { title: t("metaTitolo") };
}

/**
 * Correzioni ancora attive che la cronologia può annullare, ciascuna con quelle da annullare insieme: le
 * altre scritte dalla stessa azione sullo stesso elemento (una modifica di più campi registra un solo evento)
 * e le correzioni gemelle tra una Risposta arrivata e il collegamento della stessa email (conferma o rifiuto).
 * Un evento con una correzione revocata o sconosciuta non offre nulla.
 */
function correzioniAnnullabili(vista: VistaSituazioneDto, correzioniEmail: readonly CorrezioneEmailDto[]): Map<string, string[]> {
  const attive = new Map<string, string[]>();
  const unisci = (insieme: Record<string, string[]>) => {
    for (const [id, altre] of Object.entries(insieme)) attive.set(id, [...(attive.get(id) ?? []), ...altre]);
  };
  const risposte = vista.attese.flatMap((a) => a.risposte);
  const aggiungi = (correzioni: readonly { id: string; creataIl: string }[]) =>
    correzioni.forEach((c) => attive.set(c.id, correzioni.filter((x) => x.id !== c.id && x.creataIl === c.creataIl).map((x) => x.id)));
  aggiungi(vista.situazione.correzioni);
  for (const a of vista.attivita) aggiungi(a.correzioni);
  for (const a of vista.attese) {
    aggiungi(a.correzioni);
    for (const r of a.risposte) {
      aggiungi(r.correzioni);
      unisci(correzioniDellaConferma(vista.collegamenti, r));
    }
  }
  for (const c of vista.collegamenti) {
    aggiungi(c.correzioni);
    unisci(correzioniDelRifiuto(risposte, c));
  }
  for (const emailId of new Set(correzioniEmail.map((c) => c.emailId))) aggiungi(correzioniEmail.filter((c) => c.emailId === emailId));
  return attive;
}

export default async function PaginaSituazione({ params }: { params: Promise<{ id: string }> }) {
  await richiediOnboardingEssenziale();
  const { id } = await params;
  const t = await getTranslations("situazione");

  const dati = await comeUtente(async (ctx, dip) => {
    const vista = await vistaSituazione(dip, ctx, id);
    if (!vista) return null;
    // Con l'email che rende urgente la Situazione: la scheda "Prossima azione" la verifica e la corregge.
    const email = await emailDellaSituazioneWeb(
      dip,
      ctx,
      vista.situazione.emailOrigineId,
      [...vista.fonti.map((f) => f.emailId), ...vista.collegamenti.map((c) => c.emailId)],
      vista.stato.emailUrgenteId,
    );
    const urgenza = email.urgente;
    // Lette una volta: la sezione "Bozze" e "Apri bozza" al posto di una nuova richiesta per la stessa email.
    const bozze = await bozzeDellaSituazione(ctx, vista.id);
    return { vista, email, urgenza, bozze };
  });
  if (!dati) notFound();
  // Una Situazione assorbita in un'altra porta alla destinazione.
  if (dati.vista.id !== id) redirect(`/situations/${dati.vista.id}`);

  const { vista, email, urgenza, bozze } = dati;
  const contesto = creaContesto(vista, bozze);
  // L'urgenza dell'email d'origine si verifica nella scheda "Prossima azione" quando è lei a rendere urgente la
  // Situazione; altrimenti la sua correzione resta, compatta, sulla scheda dell'email.
  const urgenzaNellaProssima = Boolean(urgenza?.correggibile && urgenza.emailId === email.origine?.emailId);

  return (
    <article aria-labelledby="titolo-situazione" className="space-y-8">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <nav aria-label={t("navigazione")}>
            {/* Come il ritorno di Posta e Bozze: freccia e area di tocco di 36px. */}
            <Link href="/" className="-ml-1 inline-flex h-9 items-center gap-1.5 rounded-lg px-1 text-sm text-text-muted underline-offset-4 hover:text-text hover:underline">
              <ArrowLeft className="size-4" aria-hidden />
              {t("tornaHome")}
            </Link>
          </nav>
          <div className="flex items-center gap-1">
            <PulsantePerche />
            <PulsanteArchivio vista={vista} />
          </div>
        </div>
        <IntestazioneSituazione vista={vista} contesto={contesto} testiProssima={testiProssimaAzione(vista, contesto)} />
        <ProssimaAzione vista={vista} urgenza={urgenza} contesto={contesto} />
      </div>

      {vista.attivita.length > 0 ? <SezioneAttivita attivita={vista.attivita} contesto={contesto} /> : null}
      {vista.attese.length > 0 ? <SezioneAttese attese={vista.attese} collegamenti={vista.collegamenti} contesto={contesto} /> : null}
      <SezioneBozze voci={bozze} />
      <SezioneFonti
        vista={vista}
        origine={email.origine}
        urgenzaQui={!urgenzaNellaProssima}
        emailUrgenteId={urgenza?.emailId ?? null}
        emailInEvidenza={emailInEvidenza(vista, urgenza)}
        contesto={contesto}
      />
      <SezioneCronologia eventi={vista.eventi} annullabili={correzioniAnnullabili(vista, email.correzioniEmail)} />

      <PannelloPerche vista={vista} urgenze={[email.origine, urgenza].filter((u): u is UrgenzaEmailOrigineDto => u !== null)} contesto={contesto} />
      <ApriAncora />
    </article>
  );
}
