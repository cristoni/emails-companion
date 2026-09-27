import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { dettaglioBozza } from "@ec/applicazione";
import { ModuloInvio } from "@/components/bozze/modulo-invio";
import { AvvisiBozza, EmailUsate, SchedaVersione } from "@/components/bozze/parti";
import { Avviso } from "@/components/ui/avviso";
import { IntestazionePagina } from "@/components/ui/pagina";
import { classiPulsante } from "@/components/ui/pulsante";
import { richiediOnboardingEssenziale } from "@/lib/server/onboarding";
import { comeUtente } from "@/lib/server/sessione";

/**
 * `/drafts/[id]/confirm`: schermata di conferma, l'unica via verso l'invio. Mostra esattamente la versione
 * salvata (casella mittente, destinatari, oggetto, corpo, avvisi, email usate) e invia con la versione e
 * l'hash della busta di questa stessa lettura. Una bozza non modificabile o senza versione torna all'editor.
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
    <div className="space-y-6">
      <Link href={`/drafts/${bozza.id}`} className="inline-flex items-center gap-1.5 text-sm text-text-muted underline-offset-4 hover:text-text hover:underline">
        <ArrowLeft className="size-4" aria-hidden />
        {t("conferma.modifica")}
      </Link>

      <IntestazionePagina titolo={t("conferma.titolo")} descrizione={t("conferma.descrizione")} />

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
        titolo={t(`titoli.${bozza.tipo}`)}
        casella={bozza.casella.indirizzo}
        versione={v}
        lingua={bozza.lingua}
        piede={<ModuloInvio bozzaId={bozza.id} versione={v.numero} hashBusta={v.hashBusta} disabilitato={!bozza.casella.pronta} />}
      />

      <EmailUsate email={bozza.emailContesto} />
    </div>
  );
}
