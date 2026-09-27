import Link from "next/link";
import { useTranslations } from "next-intl";
import { Paperclip } from "lucide-react";
import type { VoceEmailDto } from "@ec/applicazione";
import { Istante } from "@/components/comuni/istante";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { DistintivoCategoria, DistintivoDirezione, DistintivoStatoAnalisi, DistintivoUrgente } from "./distintivi";
import { TestoIndirizzo } from "./indirizzi";

const MASSIMO_DESTINATARI = 2;

/**
 * Riga dell'elenco `/mail`: tutta la riga porta al dettaglio, dove si trovano l'originale e il link a
 * Gmail. Oggetto e anteprima sono testo dell'email, mostrati come testo semplice nella sua lingua.
 */
export function RigaEmail({ email }: { email: VoceEmailDto }) {
  const t = useTranslations("posta.elenco");
  const inEntrata = email.direzione === "entrata";
  const visibili = email.destinatari.slice(0, MASSIMO_DESTINATARI);
  const altri = email.destinatari.length - visibili.length;

  return (
    <li>
      <Link
        href={`/mail/${email.id}`}
        className="block px-4 py-4 transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted sm:px-5"
      >
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-sm">
            <span className="text-text-muted">{inEntrata ? t("da") : t("a")} </span>
            {inEntrata ? (
              <TestoIndirizzo indirizzo={email.mittente} breve className="font-medium" />
            ) : visibili.length === 0 ? (
              <span className="text-text-muted">{t("nessunDestinatario")}</span>
            ) : (
              <>
                <span className="font-medium">
                  {visibili.map((d, i) => (
                    <span key={`${d.indirizzo}-${i}`}>
                      {i > 0 ? ", " : null}
                      <TestoIndirizzo indirizzo={d} breve />
                    </span>
                  ))}
                </span>
                {altri > 0 ? <span className="text-text-muted"> {t("altri", { numero: altri })}</span> : null}
              </>
            )}
          </p>
          <Istante iso={email.ricevutaIl} stile="data_ora" className="shrink-0 text-xs text-text-muted tabular-nums" />
        </div>

        <TestoSemplice
          come="p"
          testo={email.oggetto.trim() || t("senzaOggetto")}
          lingua={email.oggetto.trim() ? email.lingua : null}
          className="mt-1 line-clamp-1 font-medium"
        />
        {email.anteprima.trim() ? (
          <TestoSemplice come="p" testo={email.anteprima} lingua={email.lingua} className="mt-0.5 line-clamp-2 text-sm text-text-muted" />
        ) : null}

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <DistintivoDirezione direzione={email.direzione} />
          {email.categoria ? <DistintivoCategoria categoria={email.categoria} /> : null}
          {email.urgente ? <DistintivoUrgente etichetta={t("urgente")} /> : null}
          <DistintivoStatoAnalisi stato={email.analisi} />
          {email.allegati.length > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs text-text-muted">
              <Paperclip className="size-3.5" aria-hidden />
              {t("allegati", { numero: email.allegati.length })}
            </span>
          ) : null}
          {email.caselle.map((c) => (
            <span
              key={c.casellaId}
              className="min-w-0 max-w-full truncate font-mono text-xs text-text-muted"
              title={t("casella", { indirizzo: c.indirizzo })}
            >
              {c.indirizzo}
            </span>
          ))}
        </div>
      </Link>
    </li>
  );
}
