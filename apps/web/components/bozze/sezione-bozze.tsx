import Link from "next/link";
import { useTranslations } from "next-intl";
import type { VoceBozzaDto } from "@ec/applicazione";
import { DistintivoProposta } from "@/components/comuni/distintivi";
import { LinkEmail } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { CLASSE_LINK } from "@/components/ui/collegamento";
import { Sezione } from "@/components/situazione/comuni";
import { chiaveStatoBozza, DistintivoStatoBozza } from "./parti";

/**
 * Bozze di una Situazione, mostrate nel dettaglio della Situazione con lo stesso titolo di sezione delle
 * altre; nessuna sezione se non ce ne sono. Ogni bozza è una scheda cliccabile verso il suo editor: in prima
 * riga l'oggetto con lo stato (solo se non è una semplice bozza) e il segno "Proposta AI" per il testo
 * scritto dall'AI e non ancora inviato; sotto, tipo, destinatari, ultimo aggiornamento e il link all'email a
 * cui risponde. Comprende le bozze rimaste senza Situazione che rispondono a un'email collegata solo come
 * proposta. Contratto usato dalla pagina `/situations/[id]`, che legge le bozze una volta sola
 * (`bozzeDellaSituazione`) e le usa anche per offrire "Apri bozza" al posto di una nuova richiesta.
 */
export function SezioneBozze({ voci }: { voci: readonly VoceBozzaDto[] }): React.ReactNode {
  const t = useTranslations("bozze");
  if (voci.length === 0) return null;
  return (
    <Sezione id="bozze" titolo={t("sezione.titolo")} conteggio={voci.length}>
      <ul className="space-y-2">
        {voci.map((b) => {
          const chiave = chiaveStatoBozza(b);
          return (
            <li
              key={b.id}
              className="relative rounded-[var(--radius-card)] border border-border bg-surface-raised px-4 py-3 shadow-[var(--shadow-card)] transition-colors hover:border-border-strong hover:bg-surface-muted"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {/* Il link copre tutta la scheda; quello all'email originale resta cliccabile sopra. */}
                <Link href={`/drafts/${b.id}`} className="min-w-0 text-[15px] font-medium underline-offset-4 after:absolute after:inset-0 after:rounded-[var(--radius-card)] hover:underline">
                  {/* Senza versione l'oggetto non esiste ancora: il tipo di bozza, accanto al distintivo "In scrittura". */}
                  {b.oggetto === null ? (
                    t(`titoli.${b.tipo}`)
                  ) : b.oggetto === "" ? (
                    <span className="text-text-muted italic">{t("busta.nessunOggetto")}</span>
                  ) : (
                    <TestoSemplice come="span" testo={b.oggetto} lingua={b.lingua} />
                  )}
                </Link>
                {/* "Bozza" è lo stato normale in questo elenco: il distintivo compare solo per gli altri. */}
                {chiave !== "modificabile" ? <DistintivoStatoBozza chiave={chiave} /> : null}
                {/* Testo scritto dall'AI e non ancora inviato: è una Proposta. */}
                {b.origine === "ai" && b.stato === "modificabile" ? (
                  <span className="text-xs">
                    <DistintivoProposta discreto />
                  </span>
                ) : null}
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-text-muted">
                <span>{t(`tipi.${b.tipo}`)}</span>
                {b.destinatari.length > 0 ? (
                  <Parte>
                    <span title={b.destinatari.map((i) => i.indirizzo).join(", ")} className="min-w-0 break-words">
                      {t("sezione.a")} {b.destinatari.map((i) => i.nome || i.indirizzo).join(", ")}
                    </span>
                  </Parte>
                ) : null}
                <Parte>
                  {/* Istanti ISO UTC: il confronto tra stringhe segue l'ordine temporale. */}
                  <Istante iso={b.ultimoInvio && b.ultimoInvio.aggiornatoIl > b.aggiornataIl ? b.ultimoInvio.aggiornatoIl : b.aggiornataIl} stile="relativo" />
                </Parte>
                {b.emailRispostaId ? (
                  <Parte>
                    {/* Sopra il link che copre la scheda; su mobile l'area di tocco cresce senza spostare la riga. */}
                    <LinkEmail emailId={b.emailRispostaId} className={`relative z-10 -my-2.5 py-2.5 sm:my-0 sm:py-0 ${CLASSE_LINK}`}>
                      {t("sezione.originale")}
                    </LinkEmail>
                  </Parte>
                ) : null}
              </p>
            </li>
          );
        })}
      </ul>
    </Sezione>
  );
}

/** Voce della riga dei dettagli preceduta dal suo separatore: andando a capo, il punto resta con la voce. */
function Parte({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span aria-hidden>·</span>
      {children}
    </span>
  );
}
