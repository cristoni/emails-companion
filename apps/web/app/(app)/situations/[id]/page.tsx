import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { emailDellaSituazioneWeb, vistaSituazione, type CorrezioneEmailDto, type VistaSituazioneDto } from "@ec/applicazione";
import { richiediOnboardingEssenziale } from "@/lib/server/onboarding";
import { comeUtente } from "@/lib/server/sessione";
import { SezioneBozze } from "@/components/bozze/sezione-bozze";
import { SezioneAttese } from "@/components/situazione/attese";
import { SezioneAttivita } from "@/components/situazione/attivita";
import { SezioneCollegamenti } from "@/components/situazione/collegamenti";
import { creaContesto } from "@/components/situazione/comuni";
import { correzioniDelRifiuto, correzioniDellaConferma } from "@/components/situazione/correzioni-collegate";
import { SezioneCronologia } from "@/components/situazione/cronologia";
import { SezioneFonti } from "@/components/situazione/fonti";
import { IntestazioneSituazione } from "@/components/situazione/intestazione";
import { PannelloPerche, PulsantePerche } from "@/components/situazione/perche";
import { ProssimaAzione } from "@/components/situazione/prossima-azione";

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
    const email = await emailDellaSituazioneWeb(dip, ctx, vista.situazione.emailOrigineId, [
      ...vista.fonti.map((f) => f.emailId),
      ...vista.collegamenti.map((c) => c.emailId),
    ]);
    return { vista, email };
  });
  if (!dati) notFound();
  // Una Situazione assorbita in un'altra porta alla destinazione.
  if (dati.vista.id !== id) redirect(`/situations/${dati.vista.id}`);

  const { vista, email } = dati;
  const contesto = creaContesto(vista);

  return (
    <article aria-labelledby="titolo-situazione" className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <nav aria-label={t("navigazione")}>
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-text-muted underline-offset-4 hover:text-text hover:underline">
            <ChevronLeft className="size-4" aria-hidden />
            {t("tornaHome")}
          </Link>
        </nav>
        <PulsantePerche />
      </div>

      <div>
        <div className="min-w-0 space-y-10">
          <IntestazioneSituazione vista={vista} origine={email.origine} contesto={contesto} />
          <ProssimaAzione vista={vista} contesto={contesto} />
          <SezioneAttivita attivita={vista.attivita} contesto={contesto} />
          <SezioneAttese attese={vista.attese} collegamenti={vista.collegamenti} contesto={contesto} />
          <SezioneFonti fonti={vista.fonti} />
          {vista.collegamenti.length > 0 ? <SezioneCollegamenti vista={vista} contesto={contesto} /> : null}
          <SezioneCronologia eventi={vista.eventi} annullabili={correzioniAnnullabili(vista, email.correzioniEmail)} />
          <SezioneBozze situazioneId={vista.id} />
        </div>
        <PannelloPerche vista={vista} origine={email.origine} contesto={contesto} />
      </div>
    </article>
  );
}
