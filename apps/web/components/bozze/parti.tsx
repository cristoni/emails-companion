import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Clock, Loader2, PenLine, Send, Sparkles, UserPen } from "lucide-react";
import type { AvvisoBozza, DettaglioBozzaDto, EmailDellaBozzaDto, VoceBozzaDto } from "@ec/applicazione";
import type { Indirizzo } from "@ec/core/dominio";
import { testoCodice, type Traduttore } from "@/components/comuni/codici";
import { DistintivoProposta } from "@/components/comuni/distintivi";
import { LinkEmail } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { Avviso } from "@/components/ui/avviso";
import { Distintivo, type TonoDistintivo } from "@/components/ui/distintivo";

/** Stato di una bozza come lo vede l'utente: stato della bozza e, se c'è, dell'ultimo invio. */
export type ChiaveStatoBozza = "generazione" | "modificabile" | "confermato" | "in_invio" | "esito_incerto" | "inviato" | "fallito";

export function chiaveStatoBozza(b: {
  stato: VoceBozzaDto["stato"];
  versioneCorrente: number;
  ultimoInvio: { stato: NonNullable<VoceBozzaDto["ultimoInvio"]>["stato"] } | null;
}): ChiaveStatoBozza {
  if (b.stato === "inviata") return "inviato";
  if (b.stato === "in_invio") {
    const s = b.ultimoInvio?.stato;
    return s === "confermato" || s === "esito_incerto" ? s : "in_invio";
  }
  if (b.versioneCorrente === 0) return "generazione";
  return b.ultimoInvio?.stato === "fallito" ? "fallito" : "modificabile";
}

const ASPETTO: Record<ChiaveStatoBozza, { tono: TonoDistintivo; icona: React.ReactNode }> = {
  generazione: { tono: "neutro", icona: <Loader2 className="size-3 motion-safe:animate-spin" aria-hidden /> },
  modificabile: { tono: "neutro", icona: <PenLine className="size-3" aria-hidden /> },
  confermato: { tono: "risposta", icona: <Send className="size-3" aria-hidden /> },
  in_invio: { tono: "risposta", icona: <Loader2 className="size-3 motion-safe:animate-spin" aria-hidden /> },
  esito_incerto: { tono: "urgente", icona: <Clock className="size-3" aria-hidden /> },
  inviato: { tono: "accento", icona: <CheckCircle2 className="size-3" aria-hidden /> },
  fallito: { tono: "pericolo", icona: <AlertTriangle className="size-3" aria-hidden /> },
};

/** Distintivo dello stato: testo e icona, mai solo il colore. */
export function DistintivoStatoBozza({ chiave }: { chiave: ChiaveStatoBozza }) {
  const t = useTranslations("bozze.stati");
  const { tono, icona } = ASPETTO[chiave];
  return (
    <Distintivo tono={tono} icona={icona}>
      {t(chiave)}
    </Distintivo>
  );
}

/**
 * Origine della versione: il testo scritto dall'AI resta una Proposta finché l'utente non ne conferma
 * l'invio (`confermata`); da lì in poi è solo indicato come scritto dall'AI.
 */
export function DistintivoOrigine({ origine, confermata = false }: { origine: "ai" | "utente"; confermata?: boolean }) {
  const t = useTranslations("bozze.editor.origini");
  if (origine === "ai" && confermata) {
    return (
      <Distintivo tono="neutro" icona={<Sparkles className="size-3" aria-hidden />}>
        {t("ai")}
      </Distintivo>
    );
  }
  if (origine === "ai") {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <DistintivoProposta />
        <span className="text-xs text-text-muted">{t("ai")}</span>
      </span>
    );
  }
  return (
    <Distintivo tono="neutro" icona={<UserPen className="size-3" aria-hidden />}>
      {t("utente")}
    </Distintivo>
  );
}

/** Motivo di un invio fallito o annullato: prima i codici dell'invio, poi gli errori comuni, poi la riserva. */
export function testoErroreInvio(tb: Traduttore, tc: Traduttore, codice: string | null): string {
  if (codice && tb.has(`erroriInvio.${codice}`)) return tb(`erroriInvio.${codice}`);
  return testoCodice(tc, "errori", codice);
}

/** Indirizzi come pillole: nome (se presente) e indirizzo in monospace. Mai link. */
export function ElencoIndirizzi({ indirizzi, vuoto }: { indirizzi: readonly Indirizzo[]; vuoto?: string }) {
  if (indirizzi.length === 0) return <span className="text-text-muted">{vuoto ?? "—"}</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {indirizzi.map((i) => (
        <li key={i.indirizzo} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface-muted px-2.5 py-0.5 text-xs">
          {i.nome ? (
            <span dir="auto" className="truncate font-medium">
              {i.nome}
            </span>
          ) : null}
          <span className="truncate font-mono text-text-muted">{i.indirizzo}</span>
        </li>
      ))}
    </ul>
  );
}

/** Righe della busta in sola lettura: casella mittente e destinatari calcolati dal server. */
export function RigheBusta({
  casella,
  a,
  cc,
  bcc,
  children,
}: {
  casella: string;
  a: readonly Indirizzo[];
  cc: readonly Indirizzo[];
  bcc: readonly Indirizzo[];
  children?: React.ReactNode;
}) {
  const t = useTranslations("bozze.busta");
  return (
    <dl className="divide-y divide-border">
      <RigaBusta etichetta={t("da")}>
        <span className="font-mono text-xs break-all">{casella}</span>
      </RigaBusta>
      <RigaBusta etichetta={t("a")}>
        <ElencoIndirizzi indirizzi={a} vuoto={t("nessuno")} />
      </RigaBusta>
      {cc.length > 0 ? (
        <RigaBusta etichetta={t("cc")}>
          <ElencoIndirizzi indirizzi={cc} />
        </RigaBusta>
      ) : null}
      {bcc.length > 0 ? (
        <RigaBusta etichetta={t("bcc")}>
          <ElencoIndirizzi indirizzi={bcc} />
        </RigaBusta>
      ) : null}
      {children}
    </dl>
  );
}

/** Riga aggiuntiva della busta (per esempio l'oggetto suggerito), con lo stesso allineamento. */
export function RigaBusta({ etichetta, children }: { etichetta: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-3 py-2 sm:grid-cols-[7rem_minmax(0,1fr)]">
      <dt className="pt-0.5 text-xs font-medium tracking-wide text-text-muted uppercase">{etichetta}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

/** In-Reply-To e References calcolati dal server, in sola lettura e ripiegati. */
export function IntestazioniTecniche({ inReplyTo, references }: { inReplyTo: string | null; references: readonly string[] }) {
  const t = useTranslations("bozze.busta");
  return (
    <details className="group rounded-lg border border-border bg-surface-muted px-3 py-2 text-xs">
      <summary className="cursor-pointer text-text-muted select-none hover:text-text">{t("intestazioni")}</summary>
      <dl className="mt-2 space-y-2">
        <div>
          <dt className="font-medium text-text-muted">{t("inRispostaA")}</dt>
          <dd className="font-mono break-all">{inReplyTo ? `<${inReplyTo}>` : t("nessuno")}</dd>
        </div>
        <div>
          <dt className="font-medium text-text-muted">{t("riferimenti")}</dt>
          <dd>
            {references.length === 0 ? (
              t("nessuno")
            ) : (
              <ul className="space-y-0.5 font-mono break-all">
                {references.map((r) => (
                  <li key={r}>{`<${r}>`}</li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      </dl>
    </details>
  );
}

/** Avvisi della bozza in evidenza: ognuno con titolo e spiegazione, non solo un colore. */
export function AvvisiBozza({ avvisi }: { avvisi: readonly AvvisoBozza[] }) {
  const t = useTranslations("bozze.avvisi");
  if (avvisi.length === 0) return null;
  return (
    <div className="space-y-2">
      {avvisi.map((a) => (
        <Avviso key={a} tono="attenzione" titolo={t(`${a}.titolo`)}>
          {t(`${a}.testo`)}
        </Avviso>
      ))}
    </div>
  );
}

/** Email da cui deriva la bozza, ciascuna con il link all'originale. */
export function EmailUsate({ email }: { email: readonly EmailDellaBozzaDto[] }) {
  const t = useTranslations("bozze.contesto");
  return (
    <section aria-label={t("titolo")} className="space-y-3">
      <div className="space-y-0.5">
        <h2 className="text-base">{t("titolo")}</h2>
        <p className="text-sm text-text-muted">{email.length > 0 ? t("descrizione") : t("nessuna")}</p>
      </div>
      {email.length > 0 ? (
        <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface-raised">
          {email.map((e) => (
            <li key={e.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-3">
              <div className="min-w-0 space-y-0.5">
                <TestoSemplice come="p" testo={e.oggetto} lingua={e.lingua} className="line-clamp-2 text-sm font-medium" />
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-text-muted">
                  <span>{t("da")}</span>
                  <span dir="auto">{e.mittente.nome ?? e.mittente.indirizzo}</span>
                  <span aria-hidden>·</span>
                  <Istante iso={e.ricevutaIl} stile="data_ora" />
                </p>
              </div>
              <LinkEmail emailId={e.id} className="shrink-0 text-sm text-accent-strong underline-offset-4 hover:underline" />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

type Versione = NonNullable<DettaglioBozzaDto["versione"]>;

/** Numero, origine e istante della versione mostrata; `confermata` quando l'utente ne ha confermato l'invio. */
export function InfoVersione({ versione, confermata = false }: { versione: Versione; confermata?: boolean }) {
  const t = useTranslations("bozze.editor");
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
      <DistintivoOrigine origine={versione.origine} confermata={confermata} />
      <span className="font-mono">{t("versione", { numero: versione.numero })}</span>
      <span aria-hidden>·</span>
      <span>
        {t("salvataIl")} <Istante iso={versione.creataIl} stile="relativo" />
      </span>
    </div>
  );
}

/**
 * Versione salvata in sola lettura, esattamente come verrà (o è stata) inviata: casella mittente,
 * destinatari, oggetto e corpo in testo semplice nella lingua della bozza, intestazioni tecniche.
 * Un oggetto vuoto è dichiarato come tale, così non sembra un dato mancante.
 */
export function SchedaVersione({
  titolo,
  casella,
  versione,
  lingua,
  confermata = false,
  piede,
}: {
  titolo: string;
  casella: string;
  versione: Versione;
  lingua: string | null;
  confermata?: boolean;
  piede?: React.ReactNode;
}) {
  const t = useTranslations("bozze.busta");
  return (
    <article className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface-raised shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 className="text-base">{titolo}</h2>
        <InfoVersione versione={versione} confermata={confermata} />
      </div>
      <div className="px-5">
        <RigheBusta casella={casella} a={versione.a} cc={versione.cc} bcc={versione.bcc}>
          <RigaBusta etichetta={t("oggetto")}>
            {versione.oggetto ? (
              <TestoSemplice come="span" testo={versione.oggetto} lingua={lingua} className="font-medium" />
            ) : (
              <span className="text-text-muted italic">{t("nessunOggetto")}</span>
            )}
          </RigaBusta>
        </RigheBusta>
      </div>
      <div className="border-t border-border px-5 py-5">
        {versione.corpo.trim() ? (
          <TestoSemplice testo={versione.corpo} lingua={lingua} className="text-[15px] leading-relaxed" />
        ) : (
          <p className="text-sm text-text-muted italic">{t("nessunTesto")}</p>
        )}
      </div>
      <div className="border-t border-border px-5 py-3">
        <IntestazioniTecniche inReplyTo={versione.inReplyTo} references={versione.references} />
      </div>
      {piede ? <div className="border-t border-border bg-surface-muted px-5 py-4">{piede}</div> : null}
    </article>
  );
}
