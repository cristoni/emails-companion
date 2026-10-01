import Link from "next/link";
import { useTranslations } from "next-intl";
import type { VoceBozzaDto } from "@ec/applicazione";
import { DistintivoProposta } from "@/components/comuni/distintivi";
import { LinkEmail } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { Sezione } from "@/components/situazione/comuni";
import { chiaveStatoBozza, DistintivoStatoBozza } from "./parti";

/**
 * Bozze di una Situazione, mostrate nel dettaglio della Situazione con lo stesso titolo di sezione delle
 * altre; nessuna sezione se non ce ne sono. Ogni bozza è una scheda cliccabile verso il suo editor, con lo
 * stato, il badge "Proposta AI" per il testo scritto dall'AI e non ancora inviato, i destinatari e il link
 * all'email a cui risponde. Comprende le bozze rimaste senza Situazione che rispondono a un'email collegata
 * solo come proposta. Contratto usato dalla pagina `/situations/[id]`, che legge le bozze una volta sola
 * (`bozzeDellaSituazione`) e le usa anche per offrire "Apri bozza" al posto di una nuova richiesta.
 */
export function SezioneBozze({ voci }: { voci: readonly VoceBozzaDto[] }): React.ReactNode {
  const t = useTranslations("bozze");
  if (voci.length === 0) return null;
  return (
    <Sezione id="bozze" titolo={t("sezione.titolo")} conteggio={voci.length}>
      <ul className="space-y-2">
        {voci.map((b) => (
          <li
            key={b.id}
            className="relative rounded-[var(--radius-card)] border border-border bg-surface-raised px-4 py-3 shadow-[var(--shadow-card)] transition-colors hover:border-border-strong hover:bg-surface-muted"
          >
            <div className="flex flex-wrap items-center gap-2">
              {/* "Bozza" è lo stato normale in questo elenco: il distintivo compare solo per gli altri. */}
              {chiaveStatoBozza(b) !== "modificabile" ? <DistintivoStatoBozza chiave={chiaveStatoBozza(b)} /> : null}
              {/* Testo scritto dall'AI e non ancora inviato: è una Proposta. */}
              {b.origine === "ai" && b.stato === "modificabile" ? <DistintivoProposta /> : null}
              <span className="text-xs font-medium text-text-muted">{t(`tipi.${b.tipo}`)}</span>
            </div>
            {/* Il link copre tutta la scheda; quello all'email originale resta cliccabile sopra. */}
            <Link href={`/drafts/${b.id}`} className="mt-1.5 block text-[15px] font-medium underline-offset-4 after:absolute after:inset-0 after:rounded-[var(--radius-card)] hover:underline">
              {b.oggetto === null ? (
                t("sezione.senzaOggetto")
              ) : b.oggetto === "" ? (
                <span className="text-text-muted italic">{t("busta.nessunOggetto")}</span>
              ) : (
                <TestoSemplice come="span" testo={b.oggetto} lingua={b.lingua} />
              )}
            </Link>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
              {b.destinatari.length > 0 ? (
                <span title={b.destinatari.map((i) => i.indirizzo).join(", ")}>
                  {t("sezione.a")} <span className="text-text">{b.destinatari.map((i) => i.nome || i.indirizzo).join(", ")}</span>
                </span>
              ) : null}
              <span title={`${t("sezione.da")} ${b.casella.indirizzo}`}>
                {/* Istanti ISO UTC: il confronto tra stringhe segue l'ordine temporale. */}
                {t("sezione.aggiornata")}{" "}
                <Istante iso={b.ultimoInvio && b.ultimoInvio.aggiornatoIl > b.aggiornataIl ? b.ultimoInvio.aggiornatoIl : b.aggiornataIl} stile="relativo" />
              </span>
              {b.emailRispostaId ? (
                <LinkEmail emailId={b.emailRispostaId} className="relative z-10 text-accent-strong underline-offset-4 hover:underline">
                  {t("sezione.originale")}
                </LinkEmail>
              ) : null}
            </p>
          </li>
        ))}
      </ul>
    </Sezione>
  );
}
