import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { dettaglioBozza, LIMITE_CORPO, LIMITE_OGGETTO } from "@ec/applicazione";
import { Istante } from "@/components/comuni/istante";
import { EditorBozza } from "@/components/bozze/editor-bozza";
import { BloccoGenerazione, ContestoBozza, IntestazioneBozza, LinkIndietro, RigaInviata, StatoInvio } from "@/components/bozze/pagina-bozza";
import { AvvisiBozza, chiaveStatoBozza, DettagliTecnici, OrigineVersione, RigheBusta, SchedaVersione } from "@/components/bozze/parti";
import { PassiBozza } from "@/components/bozze/passi-bozza";
import { Avviso } from "@/components/ui/avviso";
import { classiPulsante } from "@/components/ui/pulsante";
import { richiediOnboardingEssenziale } from "@/lib/server/onboarding";
import { comeUtente } from "@/lib/server/sessione";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("bozze.meta");
  return { title: t("bozza") };
}

/**
 * `/drafts/[id]`: bozza di risposta o sollecito, passo 1 di 2. In alto il titolo con l'origine del testo e i
 * passi verso l'invio; poi lo stato dell'ultimo invio quando chiede attenzione, una sola scheda di contesto
 * (email a cui si risponde e che cosa ha letto l'AI), la generazione in corso (o perché non arriva) oppure
 * gli avvisi e l'editor con la busta in sola lettura; in fondo, a richiesta, i dettagli tecnici. Dopo la
 * conferma titolo e scheda dicono lo stato reale. L'invio passa solo dalla schermata di conferma
 * (`/drafts/[id]/confirm`).
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
  // Finché è modificabile è una bozza; confermata non lo è più: in invio o con esito da chiarire è "Risposta", poi "Risposta inviata".
  const titolo = modificabile ? t(`titoli.${bozza.tipo}`) : chiave === "inviato" ? t(`titoliInviati.${bozza.tipo}`) : t(`tipi.${bozza.tipo}`);

  return (
    <div className="space-y-5">
      {bozza.situazioneId ? <LinkIndietro href={`/situations/${bozza.situazioneId}`}>{t("pagina.situazione")}</LinkIndietro> : null}

      <IntestazioneBozza titolo={titolo} accanto={modificabile && v ? <OrigineVersione origine={v.origine} /> : null}>
        {modificabile ? <PassiBozza attivo="modifica" /> : <RigaInviata bozza={bozza} />}
      </IntestazioneBozza>

      <StatoInvio bozza={bozza} />

      <ContestoBozza bozza={bozza} />

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
            oggettoSuggerito={bozza.oggettoCalcolato}
            salvataIl={<Istante iso={v.creataIl} stile="relativo" />}
            busta={<RigheBusta casella={bozza.casella.indirizzo} a={v.a} cc={v.cc} bcc={v.bcc} />}
          />
        </>
      ) : null}

      {/* In invio o inviata: l'utente ha confermato questa versione, che non è più una Proposta. */}
      {!modificabile && v ? <SchedaVersione casella={bozza.casella.indirizzo} versione={v} lingua={bozza.lingua} confermata /> : null}

      {v ? <DettagliTecnici versione={v} /> : null}
    </div>
  );
}
