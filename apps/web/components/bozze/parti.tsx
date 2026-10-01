import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Clock, Loader2, PenLine, Send, Sparkles, UserPen } from "lucide-react";
import type { AvvisoBozza, DettaglioBozzaDto, EmailDellaBozzaDto, VoceBozzaDto } from "@ec/applicazione";
import type { Indirizzo } from "@ec/core/dominio";
import { testoCodice, type Traduttore } from "@/components/comuni/codici";
import { DistintivoProposta } from "@/components/comuni/distintivi";
import { LinkEmail } from "@/components/comuni/evidenze";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { Avviso } from "@/components/ui/avviso";
import { cn } from "@/components/ui/cn";
import { CLASSE_LINK } from "@/components/ui/collegamento";
import { Distintivo, type TonoDistintivo } from "@/components/ui/distintivo";
import { Espandibile } from "@/components/ui/espandibile";
import { CLASSE_RIGA_BUSTA } from "./griglia";

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
 * Origine della versione, in forma discreta: il testo scritto dall'AI resta una Proposta finché l'utente non
 * ne conferma l'invio (`confermata`); da lì in poi è solo indicato come scritto dall'AI.
 */
export function OrigineVersione({ origine, confermata = false, className }: { origine: "ai" | "utente"; confermata?: boolean; className?: string }) {
  const t = useTranslations("bozze.editor.origini");
  if (origine === "ai" && !confermata) {
    return (
      <span className={cn("text-sm", className)}>
        <DistintivoProposta discreto />
      </span>
    );
  }
  const Icona = origine === "ai" ? Sparkles : UserPen;
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm whitespace-nowrap text-text-muted", className)}>
      <Icona className="size-3.5" aria-hidden />
      {t(origine)}
    </span>
  );
}

/** Motivo di un invio fallito o annullato: prima i codici dell'invio, poi gli errori comuni, poi la riserva. */
export function testoErroreInvio(tb: Traduttore, tc: Traduttore, codice: string | null): string {
  if (codice && tb.has(`erroriInvio.${codice}`)) return tb(`erroriInvio.${codice}`);
  return testoCodice(tc, "errori", codice);
}

/** Indirizzi in testo semplice: il nome (se presente) seguito dall'indirizzo attenuato. Mai link. */
export function ElencoIndirizzi({ indirizzi, vuoto }: { indirizzi: readonly Indirizzo[]; vuoto?: string }) {
  if (indirizzi.length === 0) return <span className="text-text-muted">{vuoto ?? "—"}</span>;
  return (
    <span className="break-words">
      {indirizzi.map((i, n) => (
        <span key={i.indirizzo}>
          {n > 0 ? ", " : null}
          {i.nome ? (
            <>
              <span dir="auto">{i.nome}</span> <span className="text-text-muted">{i.indirizzo}</span>
            </>
          ) : (
            i.indirizzo
          )}
        </span>
      ))}
    </span>
  );
}

/** Righe della busta in sola lettura: casella mittente e destinatari calcolati dal server. */
export function RigheBusta({ casella, a, cc, bcc }: { casella: string; a: readonly Indirizzo[]; cc: readonly Indirizzo[]; bcc: readonly Indirizzo[] }) {
  const t = useTranslations("bozze.busta");
  return (
    <dl>
      <RigaBusta etichetta={t("da")}>
        <span className="break-all">{casella}</span>
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
    </dl>
  );
}

function RigaBusta({ etichetta, children }: { etichetta: string; children: React.ReactNode }) {
  return (
    <div className={cn(CLASSE_RIGA_BUSTA, "py-1")}>
      <dt className="text-sm text-text-muted">{etichetta}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

type Versione = NonNullable<DettaglioBozzaDto["versione"]>;

/**
 * Dettagli tecnici a richiesta, in fondo alla pagina: perché mittente e destinatari non si modificano, numero
 * di versione, In-Reply-To e References calcolati dal server.
 */
export function DettagliTecnici({ versione }: { versione: Versione }) {
  const t = useTranslations("bozze.busta");
  return (
    <Espandibile titolo={t("intestazioni")} classeContenuto="space-y-3 pl-5 text-xs">
      <p className="text-text-muted">{t("fissa")}</p>
      <dl className="space-y-2">
        <div>
          <dt className="font-medium text-text-muted">{t("versione")}</dt>
          <dd>{versione.numero}</dd>
        </div>
        <div>
          <dt className="font-medium text-text-muted">{t("inRispostaA")}</dt>
          <dd className="font-mono break-all">{versione.inReplyTo ? `<${versione.inReplyTo}>` : t("nessuno")}</dd>
        </div>
        <div>
          <dt className="font-medium text-text-muted">{t("riferimenti")}</dt>
          <dd>
            {versione.references.length === 0 ? (
              t("nessuno")
            ) : (
              <ul className="space-y-0.5 font-mono break-all">
                {versione.references.map((r) => (
                  <li key={r}>{`<${r}>`}</li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      </dl>
    </Espandibile>
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

/** Email effettivamente lette dall'AI, in una riga: ciascuna porta al suo originale. */
export function EmailLette({ email }: { email: readonly EmailDellaBozzaDto[] }) {
  const t = useTranslations("bozze.contesto");
  return (
    <p className="flex items-start gap-1.5 text-sm text-text-muted">
      <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {email.length === 0 ? (
        <span>{t("nessuna")}</span>
      ) : (
        <span className="min-w-0">
          {t("letteDallAi")}{" "}
          {email.map((e, n) => (
            <span key={e.id}>
              {n > 0 ? ", " : null}
              {/* Su mobile l'area di tocco si allarga in verticale senza spostare il testo. */}
              <LinkEmail emailId={e.id} title={e.mittente.nome ?? e.mittente.indirizzo} className={cn(CLASSE_LINK, "py-2.5 sm:py-0")}>
                <TestoSemplice come="span" testo={e.oggetto} lingua={e.lingua} />
              </LinkEmail>
            </span>
          ))}
        </span>
      )}
    </p>
  );
}

/**
 * Versione salvata in sola lettura, esattamente come verrà (o è stata) inviata: l'oggetto come titolo, la
 * busta (casella mittente e destinatari) e il corpo in testo semplice nella lingua della bozza. Sulla
 * conferma la busta è riassunta nel `piede`, accanto a "Invia ora" (`busta={false}`). Un oggetto o un corpo
 * vuoti sono dichiarati come tali, così non sembrano dati mancanti.
 */
export function SchedaVersione({
  casella,
  versione,
  lingua,
  confermata = false,
  busta = true,
  piede,
}: {
  casella: string;
  versione: Versione;
  lingua: string | null;
  confermata?: boolean;
  busta?: boolean;
  piede?: React.ReactNode;
}) {
  const t = useTranslations("bozze.busta");
  return (
    <article className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface-raised shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-5 py-4">
        <h2 className="min-w-0 text-base">
          {versione.oggetto ? (
            <TestoSemplice come="span" testo={versione.oggetto} lingua={lingua} />
          ) : (
            <span className="font-normal text-text-muted italic">{t("nessunOggetto")}</span>
          )}
        </h2>
        <OrigineVersione origine={versione.origine} confermata={confermata} />
      </div>
      {busta ? (
        <div className="border-b border-border px-5 py-3">
          <RigheBusta casella={casella} a={versione.a} cc={versione.cc} bcc={versione.bcc} />
        </div>
      ) : null}
      <div className="px-5 py-5">
        {versione.corpo.trim() ? (
          <TestoSemplice testo={versione.corpo} lingua={lingua} className="text-[15px] leading-relaxed" />
        ) : (
          <p className="text-sm text-text-muted italic">{t("nessunTesto")}</p>
        )}
      </div>
      {piede ? <div className="border-t border-border bg-surface-muted px-5 py-4">{piede}</div> : null}
    </article>
  );
}

/**
 * Riepilogo accanto a "Invia ora": da quale casella e a chi parte (Cc e Ccn compresi) e, se ci sono avvisi,
 * il richiamo a leggerli, perché sui messaggi lunghi restano fuori vista.
 */
export function RiepilogoInvio({ casella, versione, avvisi }: { casella: string; versione: Versione; avvisi: number }) {
  const t = useTranslations("bozze");
  const forte = (testo: React.ReactNode) => <span className="text-text">{testo}</span>;
  return (
    <div className="space-y-1.5 text-sm text-text-muted">
      {avvisi > 0 ? (
        <p className="flex items-center gap-1.5 font-medium text-urgent">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          {t("conferma.controllaAvvisi", { numero: avvisi })}
        </p>
      ) : null}
      <p className="break-words">
        {t.rich("conferma.riepilogo", {
          da: () => forte(casella),
          a: () => forte(<ElencoIndirizzi indirizzi={versione.a} vuoto={t("busta.nessuno")} />),
        })}
        {versione.cc.length > 0 ? (
          <>
            {" · "}
            {t("busta.cc")} {forte(<ElencoIndirizzi indirizzi={versione.cc} />)}
          </>
        ) : null}
        {versione.bcc.length > 0 ? (
          <>
            {" · "}
            {t("busta.bcc")} {forte(<ElencoIndirizzi indirizzi={versione.bcc} />)}
          </>
        ) : null}
      </p>
    </div>
  );
}
