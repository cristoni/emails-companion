import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, CircleHelp } from "lucide-react";
import type { EvidenzaDto, PercheDto, UrgenzaEmailOrigineDto, VistaSituazioneDto } from "@ec/applicazione";
import { LinkEmail } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { classiPulsante } from "@/components/ui/pulsante";
import { CassettoPerche } from "./cassetto-perche";
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
 * Pannello "Perché?", a comparsa e chiuso all'apertura: per ogni analisi dell'AI che sostiene un'affermazione
 * della pagina mostra prima le affermazioni che ne derivano, con le prime citazioni che le sostengono (tutte
 * sono accanto all'elemento), poi in una riga attenuata Funzione AI, modello, versione del Contesto AI e data.
 */
export function PannelloPerche({
  vista,
  urgenze,
  contesto,
}: {
  vista: VistaSituazioneDto;
  /** Urgenza dell'email d'origine e di quella che rende urgente la Situazione: le classificazioni di cui la pagina ha le citazioni. */
  urgenze: readonly UrgenzaEmailOrigineDto[];
  contesto: ContestoDettaglio;
}) {
  const t = useTranslations("situazione.perche");
  const gruppi = new Map<string, PercheDto[]>();
  for (const p of vista.perche) gruppi.set(p.analisiId, [...(gruppi.get(p.analisiId) ?? []), p]);

  return (
    <CassettoPerche
      etichettaChiudi={t("chiudi")}
      titolo={
        <>
          <CircleHelp className="size-4 text-accent-strong" aria-hidden />
          {t("titolo")}
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-text-muted">{t("descrizione")}</p>
        {gruppi.size === 0 ? (
          <p className="text-sm text-text-muted">{t("vuoto")}</p>
        ) : (
          <ul className="space-y-3">
            {[...gruppi.entries()].map(([analisiId, voci]) => (
              <VocePerche key={analisiId} voci={voci} vista={vista} urgenze={urgenze} contesto={contesto} />
            ))}
          </ul>
        )}
      </div>
    </CassettoPerche>
  );
}

/** Pulsante in cima alla pagina che apre il pannello "Perché?" (chiuso all'apertura). */
export function PulsantePerche() {
  const t = useTranslations("situazione.perche");
  return (
    <a href="#perche-titolo" title={t("linkAiuto")} className={classiPulsante("secondario", "sm")}>
      <CircleHelp className="size-4" aria-hidden />
      {t("apri")}
    </a>
  );
}

function VocePerche({
  voci,
  vista,
  urgenze,
  contesto,
}: {
  voci: PercheDto[];
  vista: VistaSituazioneDto;
  urgenze: readonly UrgenzaEmailOrigineDto[];
  contesto: ContestoDettaglio;
}) {
  const t = useTranslations("situazione.perche");
  const tc = useTranslations("comuni");
  const p = voci[0]!;
  const affermazioni = voci.map((v) => affermazione(v, vista, urgenze, contesto, t));
  const funzione = `funzioni.${p.funzione}`;
  // Il modello scelto e quello servito si distinguono solo se differiscono o se il secondo non è registrato.
  const unModello = p.modelloServito !== null && p.modelloServito === p.modelloRichiesto;

  return (
    <li
      id={ancora.perche(p.analisiId)}
      tabIndex={-1}
      className="scroll-mt-6 space-y-2.5 rounded-lg border border-border bg-surface-raised p-3 text-sm outline-none target:ring-2 target:ring-accent/50"
    >
      <ul className="space-y-2.5">
        {affermazioni.map((a) => (
          <li key={a.chiave} className="space-y-1.5">
            <a href={a.href} className="group block rounded px-1 py-0.5 hover:bg-surface-muted">
              <span className="block font-medium text-accent-strong group-hover:underline">{a.etichetta}</span>
              {a.testo ? <TestoSemplice come="span" testo={a.testo} lingua={a.lingua} className="line-clamp-2 text-text-muted" /> : null}
            </a>
            {a.evidenze.length > 0 ? <Citazioni evidenze={a.evidenze} contesto={contesto} /> : null}
          </li>
        ))}
      </ul>
      <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 border-t border-border pt-2 text-xs text-text-muted">
        <span>{tc.has(funzione) ? tc(funzione) : t("funzioneGenerica")}</span>
        <span aria-hidden>·</span>
        {unModello ? (
          <span>
            <span className="sr-only">{t("modello")}: </span>
            <span title={t("modello")} className="break-all font-mono text-text">
              {p.modelloServito}
            </span>
          </span>
        ) : (
          <>
            <span>
              {t("modelloRichiesto")} <span className="break-all font-mono text-text">{p.modelloRichiesto}</span>
            </span>
            <span aria-hidden>·</span>
            <span>
              {t("modelloServito")}{" "}
              {p.modelloServito ? <span className="break-all font-mono text-text">{p.modelloServito}</span> : t("nonRegistrato")}
            </span>
          </>
        )}
        <span aria-hidden>·</span>
        <span>{p.contestoAiVersione !== null ? t("versione", { numero: p.contestoAiVersione }) : t("direttivePredefinite")}</span>
        {p.completataIl ? (
          <>
            <span aria-hidden>·</span>
            <Istante iso={p.completataIl} stile="data_ora" />
          </>
        ) : null}
      </p>
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
    <ul className="space-y-1 pl-1 text-[13px]" aria-label={tf("evidenza")}>
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

/** Affermazione a cui rimanda una voce del pannello, con un estratto del testo e l'ancora dell'elemento. */
function affermazione(
  p: PercheDto,
  vista: VistaSituazioneDto,
  urgenze: readonly UrgenzaEmailOrigineDto[],
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
      const evidenze = urgenze.find((u) => u.emailId === id)?.evidenze ?? [];
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
