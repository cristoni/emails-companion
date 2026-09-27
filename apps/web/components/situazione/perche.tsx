import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, CircleHelp } from "lucide-react";
import type { EvidenzaDto, PercheDto, UrgenzaEmailOrigineDto, VistaSituazioneDto } from "@ec/applicazione";
import { LinkEmail } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { ancora, linguaDi, type ContestoDettaglio } from "./comuni";

/** Citazioni mostrate nel pannello per ogni affermazione: le altre restano accanto all'elemento. */
const CITAZIONI_PER_AFFERMAZIONE = 2;

interface Affermazione {
  chiave: string;
  etichetta: string;
  testo: string | null;
  lingua: string;
  href: string;
  evidenze: readonly EvidenzaDto[];
}

/**
 * Pannello "Perché?": per ogni analisi dell'AI che sostiene un'affermazione della pagina mostra la Funzione
 * AI, il modello richiesto e quello servito, la versione del Contesto AI e la data, con i rimandi alle
 * affermazioni che ne derivano e le prime citazioni che le sostengono (tutte sono accanto all'elemento).
 */
export function PannelloPerche({
  vista,
  origine,
  contesto,
}: {
  vista: VistaSituazioneDto;
  /** Evidenze dell'urgenza dell'email d'origine, l'unica classificazione di cui la pagina ha le citazioni. */
  origine: UrgenzaEmailOrigineDto | null;
  contesto: ContestoDettaglio;
}) {
  const t = useTranslations("situazione.perche");
  const gruppi = new Map<string, PercheDto[]>();
  for (const p of vista.perche) gruppi.set(p.analisiId, [...(gruppi.get(p.analisiId) ?? []), p]);

  return (
    <aside aria-labelledby="perche-titolo" className="lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
      <div className="space-y-4 rounded-[var(--radius-card)] border border-border bg-surface-muted p-4">
        <div className="space-y-1">
          <h2 id="perche-titolo" className="flex items-center gap-1.5 text-base">
            <CircleHelp className="size-4 text-accent-strong" aria-hidden />
            {t("titolo")}
          </h2>
          <p className="text-xs leading-relaxed text-text-muted">{t("descrizione")}</p>
        </div>
        {gruppi.size === 0 ? (
          <p className="text-sm text-text-muted">{t("vuoto")}</p>
        ) : (
          <ul className="space-y-3">
            {[...gruppi.entries()].map(([analisiId, voci]) => (
              <VocePerche key={analisiId} voci={voci} vista={vista} origine={origine} contesto={contesto} />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function VocePerche({
  voci,
  vista,
  origine,
  contesto,
}: {
  voci: PercheDto[];
  vista: VistaSituazioneDto;
  origine: UrgenzaEmailOrigineDto | null;
  contesto: ContestoDettaglio;
}) {
  const t = useTranslations("situazione.perche");
  const tc = useTranslations("comuni");
  const p = voci[0]!;
  const affermazioni = voci.map((v) => affermazione(v, vista, origine, contesto, t));
  const funzione = `funzioni.${p.funzione}`;

  return (
    <li
      id={ancora.perche(p.analisiId)}
      tabIndex={-1}
      className="scroll-mt-6 space-y-2 rounded-lg border border-border bg-surface-raised p-3 text-sm outline-none target:ring-2 target:ring-accent/50"
    >
      <p className="font-medium">{tc.has(funzione) ? tc(funzione) : t("funzioneGenerica")}</p>
      <dl className="space-y-1 text-xs">
        <Riga etichetta={t("modelloRichiesto")}>
          <span className="break-all font-mono">{p.modelloRichiesto}</span>
        </Riga>
        <Riga etichetta={t("modelloServito")}>
          {p.modelloServito ? <span className="break-all font-mono">{p.modelloServito}</span> : <span className="text-text-muted">{t("nonRegistrato")}</span>}
        </Riga>
        <Riga etichetta={t("contesto")}>
          {p.contestoAiVersione !== null ? t("versione", { numero: p.contestoAiVersione }) : <span className="text-text-muted">{t("direttivePredefinite")}</span>}
        </Riga>
        <Riga etichetta={t("data")}>
          <Istante iso={p.completataIl} stile="data_ora" />
        </Riga>
      </dl>
      <div className="space-y-1 border-t border-border pt-2">
        <p className="text-xs text-text-muted">{t("sostiene")}</p>
        <ul className="space-y-1">
          {affermazioni.map((a) => (
            <li key={a.chiave} className="space-y-1 text-xs">
              <a href={a.href} className="group block rounded px-1 py-0.5 hover:bg-surface-muted">
                <span className="font-medium text-accent-strong group-hover:underline">{a.etichetta}</span>
                {a.testo ? <TestoSemplice come="span" testo={` · ${a.testo}`} lingua={a.lingua} className="line-clamp-2 text-text-muted" /> : null}
              </a>
              {a.evidenze.length > 0 ? <Citazioni evidenze={a.evidenze} contesto={contesto} /> : null}
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

/** Prime citazioni di un'affermazione, evidenziate, con l'esito della verifica nel testo e non solo nell'icona. */
function Citazioni({ evidenze, contesto }: { evidenze: readonly EvidenzaDto[]; contesto: ContestoDettaglio }) {
  const t = useTranslations("situazione.perche");
  const tf = useTranslations("comuni.fonte");
  const mostrate = evidenze.slice(0, CITAZIONI_PER_AFFERMAZIONE);
  const altre = evidenze.length - mostrate.length;
  return (
    <ul className="space-y-1 pl-1" aria-label={tf("evidenza")}>
      {mostrate.map((e, i) => (
        <li key={`${e.emailId}-${i}`} className="flex items-start gap-1.5">
          {e.verificata ? (
            <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-accent-strong" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 size-3 shrink-0 text-urgent" aria-hidden />
          )}
          <span className="sr-only">{tf(e.verificata ? "verificata" : "nonVerificata")}</span>
          <div className="min-w-0 space-y-0.5">
            <TestoSemplice
              come="blockquote"
              testo={`“${e.citazione}”`}
              lingua={linguaDi(contesto, e.emailId)}
              className="line-clamp-3 rounded-sm bg-accent-soft/60 px-1 text-text"
            />
            <LinkEmail emailId={e.emailId} className="px-1 text-accent-strong underline-offset-4 hover:underline" />
          </div>
        </li>
      ))}
      {altre > 0 ? <li className="text-text-muted">{t("altreCitazioni", { numero: altre })}</li> : null}
    </ul>
  );
}

function Riga({ etichetta, children }: { etichetta: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
      <dt className="text-text-muted">{etichetta}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Affermazione a cui rimanda una voce del pannello, con un estratto del testo e l'ancora dell'elemento. */
function affermazione(
  p: PercheDto,
  vista: VistaSituazioneDto,
  origine: UrgenzaEmailOrigineDto | null,
  contesto: ContestoDettaglio,
  t: (chiave: string) => string,
): Affermazione {
  const { tipo, id } = p.soggetto;
  const chiave = `${tipo}-${id}`;
  switch (tipo) {
    case "situazione":
      return { chiave, etichetta: t("soggetti.situazione"), testo: vista.situazione.titolo, lingua: vista.situazione.lingua, href: "#titolo-situazione", evidenze: [] };
    case "classificazione": {
      const fonte = contesto.fonti.get(id);
      const evidenze = origine?.emailId === id ? origine.evidenze : [];
      return { chiave, etichetta: t("soggetti.classificazione"), testo: fonte?.oggetto ?? null, lingua: linguaDi(contesto, id), href: `#${ancora.email(id)}`, evidenze };
    }
    case "attivita": {
      const a = vista.attivita.find((x) => x.id === id);
      return {
        chiave,
        etichetta: t("soggetti.attivita"),
        testo: a?.descrizione ?? null,
        lingua: linguaDi(contesto, a?.emailSorgenteId),
        href: `#${ancora.attivita(id)}`,
        evidenze: a?.evidenze ?? [],
      };
    }
    case "attesa": {
      const a = vista.attese.find((x) => x.id === id);
      return {
        chiave,
        etichetta: t("soggetti.attesa"),
        testo: a?.oggetto ?? null,
        lingua: linguaDi(contesto, a?.emailRichiestaId),
        href: `#${ancora.attesa(id)}`,
        evidenze: a?.evidenze ?? [],
      };
    }
    case "risposta": {
      const r = vista.attese.flatMap((a) => a.risposte).find((x) => x.id === id);
      const fonte = r ? contesto.fonti.get(r.emailId) : undefined;
      return {
        chiave,
        etichetta: t("soggetti.risposta"),
        testo: fonte?.oggetto ?? null,
        lingua: linguaDi(contesto, r?.emailId),
        href: `#${ancora.risposta(id)}`,
        evidenze: r?.requisiti.flatMap((q) => q.evidenze) ?? [],
      };
    }
    case "collegamento": {
      const c = vista.collegamenti.find((x) => x.id === id);
      const fonte = c ? contesto.fonti.get(c.emailId) : undefined;
      return { chiave, etichetta: t("soggetti.collegamento"), testo: fonte?.oggetto ?? null, lingua: linguaDi(contesto, c?.emailId), href: `#${ancora.collegamento(id)}`, evidenze: [] };
    }
    default:
      return { chiave, etichetta: t("soggetti.altro"), testo: null, lingua: contesto.lingua, href: "#perche-titolo", evidenze: [] };
  }
}
