import { useTranslations } from "next-intl";
import { AlertTriangle, Archive, ArrowDown, CheckCircle2, CircleArrowRight, Mail, Sparkles } from "lucide-react";
import type { ProssimaAzioneDto, RispostaDto, UrgenzaEmailOrigineDto, VistaSituazioneDto } from "@ec/applicazione";
import { VALUTAZIONI, type Valutazione } from "@ec/core/dominio";
import { testoCodice } from "@/components/comuni/codici";
import { LinkEmail } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { ModuloAzione } from "@/components/comuni/modulo-azione";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { cn } from "@/components/ui/cn";
import { Distintivo } from "@/components/ui/distintivo";
import { classiPulsante } from "@/components/ui/pulsante";
import { PulsanteProponiRisposta, PulsanteProponiSollecito } from "@/components/bozze/pulsanti-proposta";
import { completaAttivitaAzione, correggiValutazioneAzione, segnaGestitaAzione, segnaRispostaVistaAzione } from "@/app/(app)/situations/[id]/azioni";
import { ANCORA_URGENZA } from "./intestazione";
import { ancora, Indirizzi, linguaDi, ripete, type ContestoDettaglio } from "./comuni";
import { StrisciaProposta } from "./proposta";
import { UrgenzaOrigine } from "./urgenza-origine";

const rimando = "inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-medium text-text-muted hover:bg-surface-muted hover:text-text";

/** Un testo uguale al titolo della Situazione non aggiunge nulla sotto il titolo del passo. */
const ripeteTitolo = (testo: string, vista: VistaSituazioneDto) => ripete(testo, [vista.situazione.titolo]) && ripete(vista.situazione.titolo, [testo]);

/**
 * Testi che la scheda mostra per il passo (titolo dell'attività, oggetto dell'Attesa, estratto della risposta):
 * la descrizione della Situazione, se vi è già contenuta, non si ripete nell'intestazione.
 */
export function testiProssimaAzione(vista: VistaSituazioneDto, contesto: ContestoDettaglio): string[] {
  const azione = vista.prossimaAzione;
  if (azione.tipo === "attivita") return [azione.descrizione];
  if (azione.tipo === "sollecito" || azione.tipo === "attendi") return [azione.oggetto];
  if (azione.tipo === "rivedi_risposta") return [azione.oggettoAttesa, contesto.fonti.get(azione.emailId)?.anteprima ?? ""];
  return [];
}

/**
 * Email per cui la scheda "Prossima azione" offre già "Proponi risposta": l'email urgente da controllare
 * o quella da cui deriva l'attività in evidenza. La sua scheda tra le email non ripete il pulsante.
 */
export function emailInEvidenza(vista: VistaSituazioneDto, urgenza: UrgenzaEmailOrigineDto | null): string | null {
  const azione = vista.prossimaAzione;
  if (azione.tipo === "gestisci_urgenza") return azione.motivo === "email_urgente" ? (urgenza?.emailId ?? null) : vista.situazione.emailOrigineId;
  if (azione.tipo === "attivita") return vista.attivita.find((a) => a.id === azione.attivitaId)?.emailSorgenteId ?? null;
  return null;
}

/**
 * Prossima azione in evidenza subito sotto il titolo: cosa fare ora, con i pulsanti per farlo (il principale
 * per primo). Se la Situazione è urgente, la striscia in cima dice una sola volta perché e offre "Segna come
 * gestita" (mai due volte nella pagina); quando l'urgenza viene da un'email, "È davvero urgente?" ne apre la
 * verifica. Un passo proposto dall'AI e non ancora confermato porta la domanda della proposta, mai come
 * pulsante principale: il principale resta il lavoro da fare. La scheda dell'elemento più in basso non ripete
 * né quei pulsanti né la domanda.
 */
export function ProssimaAzione({
  vista,
  urgenza,
  contesto,
}: {
  vista: VistaSituazioneDto;
  /** Email che rende urgente la Situazione (motivo "email_urgente"), se la pagina l'ha trovata. */
  urgenza: UrgenzaEmailOrigineDto | null;
  contesto: ContestoDettaglio;
}) {
  const t = useTranslations("situazione.prossima");
  const tc = useTranslations("comuni");
  const { stato } = vista;
  const azione = vista.prossimaAzione;

  // Archiviata o conclusa: una riga di stato, che sostituisce i distintivi "Archiviata" e "Conclusa".
  if (azione.tipo === "nessuna") {
    const Icona = stato.archiviata ? Archive : CheckCircle2;
    return (
      <section aria-labelledby="prossima-titolo" className="flex items-center gap-2.5 rounded-[var(--radius-card)] border border-border bg-surface-raised px-4 py-3 sm:px-5">
        <Icona className={cn("size-4 shrink-0", stato.archiviata ? "text-text-muted" : "text-accent-strong")} aria-hidden />
        <h2 id="prossima-titolo" className="text-[15px]">
          {stato.archiviata ? t("archiviata") : t("nessuna")}
        </h2>
      </section>
    );
  }

  // "Segna come gestita" chiude l'urgenza delle email, non una scadenza vicina: lì non avrebbe effetto.
  const gestibile = stato.urgente && stato.motivoUrgenza !== "scadenza_vicina";
  const verifica = urgenza?.correggibile && urgenza.urgente && stato.motivoUrgenza === "email_urgente" ? urgenza : null;

  return (
    <section
      aria-labelledby="prossima-titolo"
      className={cn(
        "overflow-hidden rounded-[var(--radius-card)] border bg-surface-raised shadow-[var(--shadow-card)]",
        stato.urgente ? "border-urgent/40" : "border-accent/30",
      )}
    >
      {stato.urgente ? (
        <div
          id={ANCORA_URGENZA}
          className="flex scroll-mt-6 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-urgent/30 bg-urgent-soft px-4 py-2 text-sm sm:px-5"
        >
          <p className="flex items-center gap-1.5 font-semibold text-urgent" title={stato.motivoUrgenza === "scadenza_vicina" ? t("scadenzaAiuto") : undefined}>
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            {/* "Segnalata dall'AI" non vale per un'email che l'utente ha segnato urgente lui stesso. */}
            {verifica?.correzioni.some((c) => c.valore === true) ? t("emailSegnataDaTe") : testoCodice(tc, "motiviUrgenza", stato.motivoUrgenza, "aree.urgente")}
          </p>
          {gestibile && azione.tipo !== "gestisci_urgenza" ? <SegnaGestita situazioneId={vista.id} /> : null}
        </div>
      ) : null}
      <div className="space-y-3 px-4 py-4 sm:px-5">
        <Contenuto azione={azione} vista={vista} urgenza={urgenza} contesto={contesto} gestibile={gestibile} />
        {verifica ? (
          <div className="border-t border-border pt-3">
            <UrgenzaOrigine
              origine={verifica}
              contesto={contesto}
              verifica
              oggetto={verifica.emailId !== vista.situazione.emailOrigineId ? (contesto.fonti.get(verifica.emailId)?.oggetto ?? "") : undefined}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SegnaGestita({ situazioneId, primario = false }: { situazioneId: string; primario?: boolean }) {
  const t = useTranslations("situazione.prossima");
  return (
    <span title={t("gestisciAiuto")}>
      <ModuloAzione
        azione={segnaGestitaAzione}
        campi={{ situazione: situazioneId }}
        etichetta={t("gestisci")}
        variante={primario ? "primario" : "secondario"}
        dimensione={primario ? "md" : "sm"}
      />
    </span>
  );
}

/** Titolo del passo, con "Prossima azione" per i lettori di schermo: l'icona e la posizione bastano alla vista. */
function Titolo({ children, lingua }: { children: React.ReactNode; lingua?: string }) {
  const t = useTranslations("situazione.prossima");
  return (
    <h2 id="prossima-titolo" className="flex min-w-0 items-start gap-2 text-base leading-snug">
      <CircleArrowRight className="mt-0.5 size-[1.1rem] shrink-0 text-accent-strong" aria-hidden />
      <span className="sr-only">{t("titolo")}: </span>
      <span lang={lingua} dir="auto" className="min-w-0 break-words">
        {children}
      </span>
    </h2>
  );
}

function Pulsanti({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

function Contenuto({
  azione,
  vista,
  urgenza,
  contesto,
  gestibile,
}: {
  azione: Exclude<ProssimaAzioneDto, { tipo: "nessuna" }>;
  vista: VistaSituazioneDto;
  urgenza: UrgenzaEmailOrigineDto | null;
  contesto: ContestoDettaglio;
  gestibile: boolean;
}) {
  const t = useTranslations("situazione.prossima");
  const ta = useTranslations("situazione.attivita");
  const tr = useTranslations("situazione.risposte");
  const tc = useTranslations("comuni");
  const linguaAttesa = (attesaId: string) => linguaDi(contesto, vista.attese.find((a) => a.id === attesaId)?.emailRichiestaId);
  const entrata = (emailId: string | null | undefined) => (emailId ? contesto.fonti.get(emailId)?.direzione === "entrata" : false);
  const pulsanteEmail = (emailId: string) => (
    <LinkEmail emailId={emailId} className={classiPulsante("secondario", "md")}>
      <Mail className="size-4" aria-hidden />
      {tc("fonte.apri")}
    </LinkEmail>
  );
  const risposta = (emailId: string | null | undefined) =>
    emailId && entrata(emailId) ? <PulsanteProponiRisposta emailId={emailId} bozzaId={contesto.bozzeRisposta.get(emailId)} dimensione="md" /> : null;

  switch (azione.tipo) {
    case "gestisci_urgenza": {
      const daEmail = azione.motivo === "email_urgente";
      // L'email urgente non trovata (nessuna classificazione leggibile): si rimanda all'elenco delle email.
      if (daEmail && !urgenza) {
        return (
          <>
            <Titolo>{t("gestisciUrgenzaAltra")}</Titolo>
            <Pulsanti>
              {gestibile ? <SegnaGestita situazioneId={vista.id} primario /> : null}
              <a href="#fonti" className={classiPulsante("secondario", "md")}>
                <Mail className="size-4" aria-hidden />
                {t("vediEmail")}
              </a>
            </Pulsanti>
          </>
        );
      }
      const emailId = daEmail && urgenza ? urgenza.emailId : vista.situazione.emailOrigineId;
      // Se l'email urgente non è quella d'origine, il titolo della Situazione non basta a riconoscerla.
      const altra = emailId !== vista.situazione.emailOrigineId ? contesto.fonti.get(emailId) : undefined;
      return (
        <>
          <Titolo>{azione.motivo === "utente" ? t("gestisciUrgenzaUtente") : t("gestisciUrgenza")}</Titolo>
          {altra ? (
            <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm">
              <TestoSemplice come="span" testo={altra.oggetto} lingua={altra.lingua} className="font-medium" />
              <span className="text-text-muted">
                · <Indirizzi indirizzi={[altra.mittente]} />
              </span>
            </p>
          ) : null}
          <Pulsanti>
            {gestibile ? <SegnaGestita situazioneId={vista.id} primario /> : null}
            {pulsanteEmail(emailId)}
            {risposta(emailId)}
          </Pulsanti>
        </>
      );
    }
    case "attivita": {
      // La sezione "Attività" segue subito la scheda: nessun rimando "Dettagli".
      const attivita = vista.attivita.find((a) => a.id === azione.attivitaId);
      const alta = azione.priorita === "alta";
      return (
        <>
          <Titolo lingua={linguaDi(contesto, attivita?.emailSorgenteId)}>{azione.descrizione}</Titolo>
          {azione.scadenza || alta ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-muted">
              {azione.scadenza ? (
                <span>
                  {t("scadenza")} <Istante iso={azione.scadenza} stile="giorno" className="font-medium text-text" />
                </span>
              ) : null}
              {alta ? <Distintivo tono="neutro">{tc("priorita.alta")}</Distintivo> : null}
            </p>
          ) : null}
          {attivita?.proposta ? <StrisciaProposta tipo="attivita" id={azione.attivitaId} luogo="prossima" /> : null}
          <Pulsanti>
            <ModuloAzione azione={completaAttivitaAzione} campi={{ attivita: azione.attivitaId }} etichetta={ta("completa")} variante="primario" dimensione="md" />
            {risposta(attivita?.emailSorgenteId)}
          </Pulsanti>
        </>
      );
    }
    case "rivedi_risposta": {
      // Estratto, valutazione e conferma qui, dove si decide: la riga della risposta più in basso non li ripete.
      const fonte = contesto.fonti.get(azione.emailId);
      const mittente = fonte?.mittente;
      const r = vista.attese.flatMap((a) => a.risposte).find((x) => x.id === azione.rispostaId);
      return (
        <>
          <Titolo>{mittente ? t("rivediRisposta", { mittente: mittente.nome || mittente.indirizzo }) : t("rivediRispostaAnonima")}</Titolo>
          {ripeteTitolo(azione.oggettoAttesa, vista) ? null : (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="text-text-muted">{t("richiesta")}</span>
              <TestoSemplice come="span" testo={azione.oggettoAttesa} lingua={linguaAttesa(azione.attesaId)} />
            </p>
          )}
          {/* Il testo della risposta accanto al giudizio, per poterlo verificare (un paragrafo, non una citazione). */}
          {fonte?.anteprima ? (
            <TestoSemplice come="p" testo={fonte.anteprima} lingua={fonte.lingua} className="line-clamp-3 border-l-2 border-reply/40 pl-3 text-sm" />
          ) : null}
          {r ? <ValutazioneRisposta risposta={r} valutazione={azione.valutazione} /> : null}
          {r?.proposta ? <StrisciaProposta tipo="risposta" id={r.id} luogo="prossima" /> : null}
          <Pulsanti>
            <ModuloAzione azione={segnaRispostaVistaAzione} campi={{ risposta: azione.rispostaId }} etichetta={tr("segnaVista")} variante="primario" dimensione="md" />
            {pulsanteEmail(azione.emailId)}
            {/* Motivazione ed evidenze dell'AI stanno nella riga della risposta: il rimando serve se le Attività la separano. */}
            {vista.attivita.length > 0 ? (
              <a href={`#${ancora.risposta(azione.rispostaId)}`} className={rimando}>
                {t("vaiAllaRisposta")}
                <ArrowDown className="size-3.5" aria-hidden />
              </a>
            ) : null}
          </Pulsanti>
        </>
      );
    }
    case "sollecito":
    case "attendi": {
      const destinatari = azione.destinatari.join(", ");
      const sollecito = azione.tipo === "sollecito";
      const attesa = vista.attese.find((a) => a.id === azione.attesaId);
      const oggetto = !ripeteTitolo(azione.oggetto, vista);
      return (
        <>
          <Titolo>
            {sollecito
              ? destinatari
                ? t("sollecito", { destinatari })
                : t("sollecitoSenzaDestinatari")
              : destinatari
                ? t("attendi", { destinatari })
                : t("attendiSenzaDestinatari")}
          </Titolo>
          {oggetto || azione.dataAttesa ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {oggetto ? <TestoSemplice come="span" testo={azione.oggetto} lingua={linguaAttesa(azione.attesaId)} /> : null}
              {azione.dataAttesa ? (
                <span className="text-text-muted">
                  {t("attesaEntro")} <Istante iso={azione.dataAttesa} stile="giorno" className="font-medium text-text" />
                </span>
              ) : null}
            </p>
          ) : null}
          {attesa?.proposta ? <StrisciaProposta tipo="attesa" id={azione.attesaId} luogo="prossima" /> : null}
          <Pulsanti>
            <PulsanteProponiSollecito attesaId={azione.attesaId} bozzaId={contesto.bozzeSollecito.get(azione.attesaId)} consigliato={sollecito} dimensione="md" />
            {/* Il rimando serve solo se le Attività separano la scheda dalla sua Attesa. */}
            {vista.attivita.length > 0 ? (
              <a href={`#${ancora.attesa(azione.attesaId)}`} className={rimando}>
                {t("vediAttesa")}
                <ArrowDown className="size-3.5" aria-hidden />
              </a>
            ) : null}
          </Pulsanti>
        </>
      );
    }
  }
}

/**
 * "La risposta è completa?": le tre valutazioni, quella attuale evidenziata. La scelta dell'AI porta la scintilla
 * (anche dopo una correzione, per vedere da dove si è partiti); ogni altra opzione è una correzione annullabile.
 */
function ValutazioneRisposta({ risposta: r, valutazione }: { risposta: RispostaDto; valutazione: Valutazione }) {
  const t = useTranslations("situazione.prossima.valutazione");
  const etichettaId = `valutazione-${r.id}`;
  const ai = (v: Valutazione) =>
    v === r.valutazioneAi ? (
      <>
        <Sparkles className="size-3.5 text-suggestion" aria-hidden />
        {v === valutazione ? (
          <span aria-hidden className="text-xs font-normal text-text-muted max-sm:hidden">
            AI
          </span>
        ) : null}
        <span className="sr-only">({t("ai")})</span>
      </>
    ) : null;
  return (
    <div role="group" aria-labelledby={etichettaId} className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <span id={etichettaId} className="font-medium">
        {t("domanda")}
      </span>
      {/* Più stretti sul telefono, così le tre opzioni stanno su una riga. */}
      <span className="flex flex-wrap items-center gap-2 max-sm:[&_button]:px-2.5">
        {VALUTAZIONI.map((v) =>
          v === valutazione ? (
            <span
              key={v}
              aria-current="true"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-reply/50 bg-reply-soft px-2.5 font-medium text-reply sm:h-8 sm:px-3"
            >
              <CheckCircle2 className="size-3.5" aria-hidden />
              {t(`opzioni.${v}`)}
              {ai(v)}
            </span>
          ) : (
            <ModuloAzione
              key={v}
              azione={correggiValutazioneAzione}
              campi={{ risposta: r.id, valutazione: v }}
              etichetta={
                <>
                  {t(`opzioni.${v}`)}
                  {ai(v)}
                </>
              }
            />
          ),
        )}
      </span>
    </div>
  );
}
