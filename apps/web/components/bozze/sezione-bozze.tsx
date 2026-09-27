import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { bozzeDellaSituazione } from "@ec/applicazione";
import { DistintivoProposta } from "@/components/comuni/distintivi";
import { LinkEmail } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { IntestazioneScheda, Scheda } from "@/components/ui/scheda";
import { comeUtente } from "@/lib/server/sessione";
import { chiaveStatoBozza, DistintivoStatoBozza, ElencoIndirizzi } from "./parti";

/**
 * Bozze di una Situazione, mostrate nel dettaglio della Situazione: elenco con stato, badge "Proposta AI"
 * per il testo scritto dall'AI e non ancora inviato, link all'editor e all'email a cui ciascuna risponde.
 * Comprende le bozze rimaste senza Situazione che rispondono a un'email collegata solo come proposta.
 * Contratto usato dalla pagina `/situations/[id]`.
 */
export async function SezioneBozze({ situazioneId }: { situazioneId: string }): Promise<React.ReactNode> {
  const voci = await comeUtente((ctx) => bozzeDellaSituazione(ctx, situazioneId));
  const t = await getTranslations("bozze");
  return (
    <section aria-label={t("sezione.titolo")}>
      <Scheda>
        <IntestazioneScheda titolo={t("sezione.titolo")} descrizione={t("sezione.descrizione")} />
        {voci.length === 0 ? (
          <p className="px-5 py-4 text-sm text-text-muted">{t("sezione.vuota")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {voci.map((b) => (
              <li key={b.id} className="space-y-2 px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <DistintivoStatoBozza chiave={chiaveStatoBozza(b)} />
                  {/* Testo scritto dall'AI e non ancora inviato: è una Proposta. */}
                  {b.origine === "ai" && b.stato === "modificabile" ? <DistintivoProposta /> : null}
                  <span className="text-xs font-medium text-text-muted">{t(`tipi.${b.tipo}`)}</span>
                </div>
                <Link href={`/drafts/${b.id}`} className="block rounded-sm text-sm font-medium underline-offset-4 hover:underline">
                  {b.oggetto === null ? (
                    t("sezione.senzaOggetto")
                  ) : b.oggetto === "" ? (
                    <span className="text-text-muted italic">{t("busta.nessunOggetto")}</span>
                  ) : (
                    <TestoSemplice come="span" testo={b.oggetto} lingua={b.lingua} />
                  )}
                </Link>
                <dl className="grid gap-x-6 gap-y-1.5 text-xs text-text-muted sm:grid-cols-[auto_minmax(0,1fr)]">
                  {b.destinatari.length > 0 ? (
                    <>
                      <dt className="font-medium">{t("sezione.a")}</dt>
                      <dd className="min-w-0">
                        <ElencoIndirizzi indirizzi={b.destinatari} />
                      </dd>
                    </>
                  ) : null}
                  <dt className="font-medium">{t("sezione.da")}</dt>
                  <dd className="min-w-0 font-mono break-all">{b.casella.indirizzo}</dd>
                  <dt className="font-medium">{t("sezione.aggiornata")}</dt>
                  <dd>
                    {/* Istanti ISO UTC: il confronto tra stringhe segue l'ordine temporale. */}
                    <Istante iso={b.ultimoInvio && b.ultimoInvio.aggiornatoIl > b.aggiornataIl ? b.ultimoInvio.aggiornatoIl : b.aggiornataIl} stile="relativo" />
                  </dd>
                </dl>
                {b.emailRispostaId ? (
                  <LinkEmail emailId={b.emailRispostaId} className="inline-block text-xs text-accent-strong underline-offset-4 hover:underline">
                    {t("sezione.originale")}
                  </LinkEmail>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Scheda>
    </section>
  );
}
