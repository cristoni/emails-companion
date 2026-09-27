import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { dettaglioBozza, LIMITE_CORPO, LIMITE_OGGETTO } from "@ec/applicazione";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { EditorBozza } from "@/components/bozze/editor-bozza";
import { BloccoGenerazione, EmailOrigine, StatoInvio } from "@/components/bozze/pagina-bozza";
import {
  AvvisiBozza,
  chiaveStatoBozza,
  DistintivoStatoBozza,
  EmailUsate,
  InfoVersione,
  IntestazioniTecniche,
  RigaBusta,
  RigheBusta,
  SchedaVersione,
} from "@/components/bozze/parti";
import { Avviso } from "@/components/ui/avviso";
import { IntestazionePagina } from "@/components/ui/pagina";
import { classiPulsante } from "@/components/ui/pulsante";
import { richiediOnboardingEssenziale } from "@/lib/server/onboarding";
import { comeUtente } from "@/lib/server/sessione";

/**
 * `/drafts/[id]`: bozza di risposta o sollecito. Mostra la generazione in corso (o perché non arriva),
 * l'editor di oggetto e corpo con la busta in sola lettura, gli avvisi, le email usate e lo stato
 * dell'invio. L'invio passa solo dalla schermata di conferma (`/drafts/[id]/confirm`).
 */
export default async function PaginaBozza({ params }: { params: Promise<{ id: string }> }) {
  await richiediOnboardingEssenziale();
  const { id } = await params;
  const bozza = await comeUtente((ctx, dip) => dettaglioBozza(dip, ctx, id));
  if (!bozza) notFound();
  const t = await getTranslations("bozze");
  const v = bozza.versione;
  const chiave = chiaveStatoBozza({ stato: bozza.stato, versioneCorrente: v?.numero ?? 0, ultimoInvio: bozza.invio });
  const modificabile = bozza.stato === "modificabile";

  return (
    <div className="space-y-6">
      {bozza.situazioneId ? (
        <Link href={`/situations/${bozza.situazioneId}`} className="inline-flex items-center gap-1.5 text-sm text-text-muted underline-offset-4 hover:text-text hover:underline">
          <ArrowLeft className="size-4" aria-hidden />
          {t("pagina.situazione")}
        </Link>
      ) : null}

      <IntestazionePagina titolo={t(`titoli.${bozza.tipo}`)} descrizione={t(`pagina.descrizione.${bozza.tipo}`)} azioni={<DistintivoStatoBozza chiave={chiave} />} />

      <EmailOrigine bozza={bozza} />

      <StatoInvio bozza={bozza} />

      {modificabile && !v ? <BloccoGenerazione bozza={bozza} /> : null}

      {modificabile && v ? (
        <>
          <AvvisiBozza avvisi={bozza.avvisi} />
          {!bozza.casella.pronta ? (
            <Avviso
              tono="attenzione"
              titolo={t("busta.casellaNonPronta")}
              azione={
                <Link href="/settings" className={classiPulsante("secondario", "sm")}>
                  {t("pagina.impostazioni")}
                </Link>
              }
            />
          ) : null}
          <EditorBozza
            bozzaId={bozza.id}
            versione={v.numero}
            oggetto={v.oggetto}
            corpo={v.corpo}
            lingua={bozza.lingua}
            limiti={{ oggetto: LIMITE_OGGETTO, corpo: LIMITE_CORPO }}
            intestazione={<InfoVersione versione={v} />}
            busta={
              <>
                <RigheBusta casella={bozza.casella.indirizzo} a={v.a} cc={v.cc} bcc={v.bcc}>
                  {bozza.oggettoCalcolato ? (
                    <RigaBusta etichetta={t("busta.oggettoCalcolato")}>
                      <TestoSemplice come="span" testo={bozza.oggettoCalcolato} lingua={bozza.lingua} className="text-text-muted" />
                    </RigaBusta>
                  ) : null}
                </RigheBusta>
                <div className="space-y-3 pb-4">
                  <p className="text-xs text-text-muted">{t("busta.fissa")}</p>
                  <IntestazioniTecniche inReplyTo={v.inReplyTo} references={v.references} />
                </div>
              </>
            }
          />
        </>
      ) : null}

      {/* In invio o inviata: l'utente ha confermato questa versione, che non è più una Proposta. */}
      {!modificabile && v ? <SchedaVersione titolo={t("editor.titolo")} casella={bozza.casella.indirizzo} versione={v} lingua={bozza.lingua} confermata /> : null}

      {v ? <EmailUsate email={bozza.emailContesto} /> : null}
    </div>
  );
}
