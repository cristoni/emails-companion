import { useLocale, useTranslations } from "next-intl";
import { CircleHelp, Undo2 } from "lucide-react";
import type { CorrezioneDto, FonteDto, VistaSituazioneDto } from "@ec/applicazione";
import type { Indirizzo } from "@ec/core/dominio";
import { testoCodice } from "@/components/comuni/codici";
import { Istante } from "@/components/comuni/istante";
import { ModuloAzione } from "@/components/comuni/modulo-azione";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { cn } from "@/components/ui/cn";
import { annullaCorrezioniAzione } from "@/app/(app)/situations/[id]/azioni";

/** Dati di contesto condivisi dalle sezioni del dettaglio, calcolati una volta dalla pagina. */
export interface ContestoDettaglio {
  situazioneId: string;
  emailOrigineId: string;
  /** Lingua di ogni email, per marcare i testi dell'AI che ne derivano. */
  lingue: ReadonlyMap<string, string>;
  lingua: string;
  /** Email della Situazione per id, per mostrare mittente e oggetto accanto ai riferimenti. */
  fonti: ReadonlyMap<string, FonteDto>;
  /** Analisi presenti nel pannello "Perché?". */
  analisi: ReadonlySet<string>;
}

export function creaContesto(vista: VistaSituazioneDto): ContestoDettaglio {
  return {
    situazioneId: vista.id,
    emailOrigineId: vista.situazione.emailOrigineId,
    lingue: new Map(vista.fonti.map((f) => [f.emailId, f.lingua])),
    lingua: vista.situazione.lingua,
    fonti: new Map(vista.fonti.map((f) => [f.emailId, f])),
    analisi: new Set(vista.perche.map((p) => p.analisiId)),
  };
}

export function linguaDi(contesto: ContestoDettaglio, emailId: string | null | undefined): string {
  return (emailId ? contesto.lingue.get(emailId) : undefined) ?? contesto.lingua;
}

/** Indirizzo di un'intestazione come testo: "Nome <indirizzo>" o solo l'indirizzo. */
export function formattaIndirizzo(i: Indirizzo): string {
  return i.nome ? `${i.nome} <${i.indirizzo}>` : i.indirizzo;
}

export const ancora = {
  perche: (analisiId: string) => `perche-${analisiId}`,
  attivita: (id: string) => `attivita-${id}`,
  attesa: (id: string) => `attesa-${id}`,
  risposta: (id: string) => `risposta-${id}`,
  collegamento: (id: string) => `collegamento-${id}`,
  email: (id: string) => `email-${id}`,
};

/** Sezione del dettaglio con titolo di secondo livello e landmark etichettato. */
export function Sezione({
  id,
  titolo,
  descrizione,
  conteggio,
  children,
  className,
}: {
  id: string;
  titolo: React.ReactNode;
  descrizione?: React.ReactNode;
  conteggio?: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titolo`} className={cn("scroll-mt-6 space-y-4", className)}>
      <div className="space-y-1">
        <h2 id={`${id}-titolo`} className="flex items-baseline gap-2 text-lg">
          {titolo}
          {conteggio !== undefined ? <span className="font-mono text-xs font-normal text-text-muted">{conteggio}</span> : null}
        </h2>
        {descrizione ? <p className="text-sm text-text-muted">{descrizione}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Link "Perché?" di un'affermazione dell'AI verso la voce del pannello laterale con la sua analisi. */
export function LinkPerche({ analisiId, contesto }: { analisiId: string | null | undefined; contesto: ContestoDettaglio }) {
  const t = useTranslations("situazione.perche");
  if (!analisiId || !contesto.analisi.has(analisiId)) return null;
  return (
    <a
      href={`#${ancora.perche(analisiId)}`}
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium text-text-muted underline-offset-4 hover:bg-surface-muted hover:text-text hover:underline"
      title={t("linkAiuto")}
    >
      <CircleHelp className="size-3.5" aria-hidden />
      {t("link")}
    </a>
  );
}

/** Riga di metadati: etichetta attenuata e valore. */
export function Metadato({ etichetta, children }: { etichetta: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
      <dt className="text-text-muted">{etichetta}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** Pulsante che annulla le correzioni indicate, con l'esito tradotto. */
export function PulsanteAnnulla({ correzioni, etichetta }: { correzioni: readonly string[]; etichetta?: React.ReactNode }) {
  const t = useTranslations("situazione.correzioni");
  const ids = [...new Set(correzioni)];
  if (ids.length === 0) return null;
  return (
    <ModuloAzione
      azione={annullaCorrezioniAzione}
      campi={{ correzioni: ids.join(",") }}
      etichetta={
        <>
          <Undo2 className="size-3.5" aria-hidden />
          {etichetta ?? t("annulla")}
        </>
      }
      variante="fantasma"
      messaggi={{ ok: t("annullata") }}
      mostraOk
    />
  );
}

/** Valore di una correzione in forma leggibile: codici tradotti, date formattate, testo come testo semplice. */
function ValoreCorrezione({ correzione }: { correzione: CorrezioneDto }) {
  const tc = useTranslations("comuni");
  const t = useTranslations("situazione.correzioni");
  const locale = useLocale();
  const { campo, valore } = correzione;
  if (valore === null || valore === undefined) return <span>{t("nessunValore")}</span>;
  if (typeof valore === "boolean") return <span>{t(valore ? "si" : "no")}</span>;
  if (typeof valore !== "string") return null;
  /** Codice tradotto con il primo gruppo che lo conosce; un codice sconosciuto non viene mostrato. */
  const codice = (...gruppi: string[]) => {
    const chiave = gruppi.map((g) => `${g}.${valore}`).find((k) => tc.has(k));
    return chiave ? <span>{tc(chiave)}</span> : null;
  };
  switch (campo) {
    case "stato":
      // Attività (proposta, confermata…), decisione su un'Attesa (soddisfatta, annullata) o collegamento (proposto…).
      return codice("statiElemento", "statiAttesa", "statiCollegamento");
    case "ciclo":
      return codice("statiElemento");
    case "statoCollegamento":
      return codice("statiCollegamento");
    case "valutazione":
      return codice("valutazioni");
    case "priorita":
      return codice("priorita");
    case "categoria":
      return codice("categorie");
    case "revisione":
      return t.has(`revisioni.${valore}`) ? <span>{t(`revisioni.${valore}`)}</span> : null;
    case "scadenza":
      return <Istante iso={valore} stile="data" />;
    case "gestitaIl":
      return <Istante iso={valore} stile="data_ora" />;
    case "descrizione":
      return <TestoSemplice come="span" testo={`“${valore}”`} />;
    case "lingua": {
      let nome: string | undefined;
      try {
        nome = new Intl.DisplayNames([locale], { type: "language" }).of(valore);
      } catch {
        nome = undefined;
      }
      return <span>{nome ?? valore}</span>;
    }
    default:
      return null;
  }
}

/**
 * Correzioni attive dell'utente su un elemento: cosa ha cambiato e quando, con l'annullamento di ciascuna
 * e di tutte insieme. Un annullamento riporta il valore precedente (dell'AI o della correzione prima).
 */
export function CorrezioniElemento({ correzioni, extra = {} }: { correzioni: readonly CorrezioneDto[]; extra?: Record<string, readonly string[]> }) {
  const t = useTranslations("situazione.correzioni");
  if (correzioni.length === 0) return null;
  return (
    <details className="group rounded-lg border border-dashed border-border px-3 py-2 text-sm">
      <summary className="cursor-pointer select-none text-text-muted marker:text-text-muted hover:text-text">
        {t("riepilogo", { numero: correzioni.length })}
      </summary>
      <ul className="mt-2 space-y-2">
        {correzioni.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0">
              <span className="font-medium">{testoCodice(t, "campi", c.campo, "campoGenerico")}</span>
              <span className="text-text-muted"> → </span>
              <ValoreCorrezione correzione={c} />
              <span className="text-text-muted"> · </span>
              <Istante iso={c.creataIl} stile="relativo" className="text-xs text-text-muted" />
            </span>
            <PulsanteAnnulla correzioni={[c.id, ...(extra[c.id] ?? [])]} />
          </li>
        ))}
      </ul>
      {correzioni.length > 1 ? (
        <div className="mt-2 border-t border-border pt-2">
          <PulsanteAnnulla correzioni={correzioni.flatMap((c) => [c.id, ...(extra[c.id] ?? [])])} etichetta={t("annullaTutte")} />
        </div>
      ) : null}
    </details>
  );
}
