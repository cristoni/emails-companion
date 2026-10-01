import Link from "next/link";
import { useTranslations } from "next-intl";
import { Paperclip } from "lucide-react";
import type { VoceEmailDto } from "@ec/applicazione";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { DataBreve } from "./data-breve";
import { ANALISI_DA_SEGNALARE, DistintivoCategoria, DistintivoStatoAnalisi, DistintivoUrgente, IconaDirezione } from "./distintivi";
import { TestoIndirizzo } from "./indirizzi";

const MASSIMO_DESTINATARI = 2;

/**
 * Riga dell'elenco `/mail`, come in una casella di posta: mittente (o destinatari) e data, oggetto,
 * anteprima su una riga. I distintivi compaiono solo per le eccezioni (urgente, da gestire, analisi non
 * riuscita o in attesa); la casella solo quando serve a distinguerle. Tutta la riga porta al dettaglio.
 * Oggetto e anteprima sono testo dell'email, mostrati come testo semplice nella sua lingua.
 */
export function RigaEmail({ email, mostraCasella = false }: { email: VoceEmailDto; mostraCasella?: boolean }) {
  const t = useTranslations("posta.elenco");
  const inEntrata = email.direzione === "entrata";
  const visibili = email.destinatari.slice(0, MASSIMO_DESTINATARI);
  const altri = email.destinatari.length - visibili.length;
  const segnalaAnalisi = ANALISI_DA_SEGNALARE.includes(email.analisi);
  const segnali = email.urgente || email.categoria === "operativa" || segnalaAnalisi;

  return (
    <li>
      <Link
        href={`/mail/${email.id}`}
        className="block px-4 py-3 transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-offset-[-2px] sm:px-5"
      >
        <div className="flex items-baseline gap-3">
          <p className="min-w-0 flex-1 truncate text-sm">
            {inEntrata ? (
              <>
                <span className="sr-only">{t("da")} </span>
                <TestoIndirizzo indirizzo={email.mittente} breve className="font-semibold" />
              </>
            ) : (
              <>
                <span className="text-text-muted">
                  <IconaDirezione direzione={email.direzione} className="mr-1 inline size-3.5 align-[-2px]" />
                  {t("a")}{" "}
                </span>
                {visibili.length === 0 ? (
                  <span className="text-text-muted">{t("nessunDestinatario")}</span>
                ) : (
                  <span className="font-semibold">
                    {visibili.map((d, i) => (
                      <span key={`${d.indirizzo}-${i}`}>
                        {i > 0 ? ", " : null}
                        <TestoIndirizzo indirizzo={d} breve />
                      </span>
                    ))}
                  </span>
                )}
                {altri > 0 ? <span className="text-text-muted"> {t("altri", { numero: altri })}</span> : null}
              </>
            )}
          </p>
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-text-muted tabular-nums">
            {email.allegati.length > 0 ? (
              <span title={t("allegati", { numero: email.allegati.length })}>
                <Paperclip className="size-3.5" aria-hidden />
                <span className="sr-only">{t("allegati", { numero: email.allegati.length })}</span>
              </span>
            ) : null}
            <DataBreve iso={email.ricevutaIl} />
          </span>
        </div>

        <div className="mt-0.5 flex items-center gap-2">
          <TestoSemplice
            come="p"
            testo={email.oggetto.trim() || t("senzaOggetto")}
            lingua={email.oggetto.trim() ? email.lingua : null}
            className="min-w-0 flex-1 truncate whitespace-nowrap text-sm"
          />
          {segnali ? (
            <span className="flex shrink-0 items-center gap-1.5">
              {email.urgente ? <DistintivoUrgente etichetta={t("urgente")} /> : null}
              {email.categoria === "operativa" ? <DistintivoCategoria categoria={email.categoria} /> : null}
              {segnalaAnalisi ? <DistintivoStatoAnalisi stato={email.analisi} /> : null}
            </span>
          ) : null}
        </div>

        {email.anteprima.trim() || mostraCasella ? (
          <div className="mt-0.5 flex items-baseline gap-3">
            <TestoSemplice
              come="p"
              testo={email.anteprima}
              lingua={email.lingua}
              className="min-w-0 flex-1 truncate whitespace-nowrap text-sm text-text-muted"
            />
            {mostraCasella
              ? email.caselle.map((c) => (
                  <span key={c.casellaId} className="max-w-[40%] shrink-0 truncate text-xs text-text-muted" title={t("casella", { indirizzo: c.indirizzo })}>
                    {c.indirizzo}
                  </span>
                ))
              : null}
          </div>
        ) : null}
      </Link>
    </li>
  );
}
