import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { dettaglioBozza } from "@ec/applicazione";
import { ModuloInvio } from "@/components/bozze/modulo-invio";
import { IntestazioneBozza } from "@/components/bozze/pagina-bozza";
import { AvvisiBozza, DettagliTecnici, EmailLette, RiepilogoInvio, SchedaVersione } from "@/components/bozze/parti";
import { PassiBozza } from "@/components/bozze/passi-bozza";
import { Avviso } from "@/components/ui/avviso";
import { classiPulsante } from "@/components/ui/pulsante";
import { richiediOnboardingEssenziale } from "@/lib/server/onboarding";
import { comeUtente } from "@/lib/server/sessione";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("bozze.meta");
  return { title: t("conferma") };
}

/**
 * `/drafts/[id]/confirm`: schermata di conferma, passo 2 di 2 ("Rivedi e invia") e l'unica via verso l'invio. Mostra esattamente
 * la versione salvata (oggetto e corpo, con casella mittente e destinatari riassunti accanto a "Invia ora"),
 * gli avvisi in cima e ricordati accanto al pulsante, le email lette dall'AI; invia con la versione e l'hash
 * della busta di questa stessa lettura. Una bozza non modificabile o senza versione torna all'editor.
 */
export default async function PaginaConfermaInvio({ params }: { params: Promise<{ id: string }> }) {
  await richiediOnboardingEssenziale();
  const { id } = await params;
  const bozza = await comeUtente((ctx, dip) => dettaglioBozza(dip, ctx, id));
  if (!bozza) notFound();
  if (bozza.stato !== "modificabile" || !bozza.versione) redirect(`/drafts/${bozza.id}`);
  const t = await getTranslations("bozze");
  const v = bozza.versione;

  return (
    <div className="space-y-5">
      {/* Nessun link di ritorno in cima: riportano all'editor il passo "Modifica" e il pulsante accanto a "Invia ora". */}
      <IntestazioneBozza titolo={t("conferma.titolo")}>
        <PassiBozza attivo="conferma" hrefModifica={`/drafts/${bozza.id}`} />
      </IntestazioneBozza>

      <AvvisiBozza avvisi={bozza.avvisi} />
      {!bozza.casella.pronta ? (
        <Avviso
          tono="errore"
          titolo={t("busta.casellaNonPronta")}
          azione={
            <Link href="/settings" className={classiPulsante("secondario", "sm")}>
              {t("pagina.impostazioni")}
            </Link>
          }
        />
      ) : null}

      <SchedaVersione
        casella={bozza.casella.indirizzo}
        versione={v}
        lingua={bozza.lingua}
        busta={false}
        piede={
          <ModuloInvio
            bozzaId={bozza.id}
            versione={v.numero}
            hashBusta={v.hashBusta}
            disabilitato={!bozza.casella.pronta}
            riepilogo={<RiepilogoInvio casella={bozza.casella.indirizzo} versione={v} avvisi={bozza.avvisi.length} />}
          />
        }
      />

      <EmailLette email={bozza.emailContesto} />

      <DettagliTecnici versione={v} />
    </div>
  );
}
