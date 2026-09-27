import { useTranslations } from "next-intl";
import { ArrowDownLeft, ArrowUpRight, Repeat } from "lucide-react";
import type { FonteDto } from "@ec/applicazione";
import type { Direzione } from "@ec/core/dominio";
import { testoCodice } from "@/components/comuni/codici";
import { LinkEmail, LinkProvider } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { Distintivo } from "@/components/ui/distintivo";
import { PulsanteProponiRisposta } from "@/components/bozze/pulsanti-proposta";
import { ancora, formattaIndirizzo, Sezione } from "./comuni";

const ICONE: Record<Direzione, typeof ArrowDownLeft> = { entrata: ArrowDownLeft, uscita: ArrowUpRight, interna: Repeat };

/**
 * Email da cui derivano la Situazione e i suoi elementi, in ordine cronologico: direzione, mittente,
 * destinatari, oggetto e anteprima, caselle con il link all'originale nel provider e "Proponi risposta".
 */
export function SezioneFonti({ fonti }: { fonti: readonly FonteDto[] }) {
  const t = useTranslations("situazione.fonti");
  // Più thread nella stessa Situazione: ciascuno riceve un numero nell'ordine in cui compare.
  const thread = new Map<string, number>();
  for (const f of fonti) if (f.thread && !thread.has(f.thread)) thread.set(f.thread, thread.size + 1);
  const piuThread = thread.size > 1;

  return (
    <Sezione id="fonti" titolo={t("titolo")} descrizione={piuThread ? t("descrizioneThread", { numero: thread.size }) : t("descrizione")} conteggio={fonti.length}>
      <ol className="relative space-y-3 border-l border-border pl-5">
        {fonti.map((f) => (
          <VoceFonte key={f.emailId} fonte={f} numeroThread={piuThread && f.thread ? (thread.get(f.thread) ?? null) : null} />
        ))}
      </ol>
    </Sezione>
  );
}

function VoceFonte({ fonte: f, numeroThread }: { fonte: FonteDto; numeroThread: number | null }) {
  const t = useTranslations("situazione.fonti");
  const tc = useTranslations("comuni");
  const Icona = ICONE[f.direzione];
  const destinatari = [...f.destinatari.a, ...f.destinatari.cc];

  return (
    <li id={ancora.email(f.emailId)} className="relative scroll-mt-6">
      <span aria-hidden className="absolute top-4 -left-[1.6rem] flex size-3 items-center justify-center rounded-full border border-border bg-surface-raised" />
      <article
        aria-label={f.oggetto || t("senzaOggetto")}
        className="rounded-[var(--radius-card)] border border-border bg-surface-raised p-4 shadow-[var(--shadow-card)] target:ring-2 target:ring-accent/40"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Distintivo tono={f.direzione === "entrata" ? "risposta" : "neutro"} icona={<Icona className="size-3" aria-hidden />}>
            {testoCodice(tc, "direzioni", f.direzione)}
          </Distintivo>
          {numeroThread !== null ? <Distintivo tono="neutro">{t("thread", { numero: numeroThread })}</Distintivo> : null}
          <Istante iso={f.ricevutaIl} stile="data_ora" className="text-xs text-text-muted" />
        </div>

        <TestoSemplice come="p" testo={f.oggetto || t("senzaOggetto")} lingua={f.lingua} className="mt-2 font-medium" />
        <dl className="mt-1.5 space-y-0.5 text-xs">
          <div className="flex flex-wrap gap-x-1.5">
            <dt className="text-text-muted">{t("da")}</dt>
            <dd className="break-all font-mono">{formattaIndirizzo(f.mittente)}</dd>
          </div>
          {destinatari.length > 0 ? (
            <div className="flex flex-wrap gap-x-1.5">
              <dt className="text-text-muted">{t("a")}</dt>
              <dd className="break-all font-mono">{destinatari.map(formattaIndirizzo).join(", ")}</dd>
            </div>
          ) : null}
        </dl>
        {f.anteprima ? <TestoSemplice come="p" testo={f.anteprima} lingua={f.lingua} className="mt-2 line-clamp-3 text-sm text-text-muted" /> : null}

        {f.caselle.length > 0 ? (
          <ul className="mt-3 space-y-1.5" aria-label={t("caselle")}>
            {f.caselle.map((c) => (
              <li key={`${c.casellaId}-${c.idConnettore}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="font-mono text-text">{c.indirizzo}</span>
                {c.cartelle.map((cartella) => (
                  <span key={cartella} className="rounded-full border border-border px-1.5 py-px text-text-muted">
                    {testoCodice(tc, "cartelle", cartella)}
                  </span>
                ))}
                {c.origineInvio === "app" ? <span className="text-text-muted">{t("inviataDallApp")}</span> : null}
                {c.eliminataNelProvider ? <span className="text-danger">{t("eliminataNelProvider")}</span> : null}
                <LinkProvider href={c.linkOriginale} className="text-accent-strong underline-offset-4 hover:underline" />
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <LinkEmail emailId={f.emailId} className="text-sm font-medium text-accent-strong underline-offset-4 hover:underline" />
          {f.direzione === "entrata" ? <PulsanteProponiRisposta emailId={f.emailId} /> : null}
        </div>
      </article>
    </li>
  );
}
