import { useFormatter, useTranslations } from "next-intl";
import { CalendarClock, CheckCircle2, Clock, ListTodo, Mail, MailOpen, MailQuestion, Reply, Sparkles, UserCheck } from "lucide-react";
import type { ProssimaAzioneDto } from "@ec/applicazione";
import { testoCodice } from "@/components/comuni/codici";
import { LinkEmail } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { cn } from "@/components/ui/cn";
import { Distintivo } from "@/components/ui/distintivo";

/** Confronto per evitare di ripetere sotto il titolo lo stesso testo: solo presentazione, il dato resta intatto. */
function normalizza(testo: string): string {
  return testo.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Stessa struttura per ogni variante: una riga con icona e verbo (per un'attività, la sua descrizione
 * scritta dall'AI), l'oggetto attenuato se diverso dal titolo della card, poi una riga piccola con distintivi,
 * date e link. Le icone sono quelle delle Aree. I testi dell'AI sono testo semplice nella lingua della
 * Situazione; ciò che è interattivo o ha un tooltip sta sopra il link che copre la card (`relative z-10`).
 */
export function ProssimaAzione({ azione, lingua, titolo }: { azione: ProssimaAzioneDto; lingua: string; titolo: string }) {
  const t = useTranslations("home.prossimaAzione");
  const tCard = useTranslations("home.card");
  const tc = useTranslations("comuni");
  const formato = useFormatter();
  const elenco = (destinatari: readonly string[]) => formato.list(destinatari, { type: "conjunction" });
  const oggetto = (testo: string) => (normalizza(testo) === normalizza(titolo) ? null : testo);
  const attesaEntro = (data: string | null) =>
    data ? (
      <span className="inline-flex items-center gap-1">
        <CalendarClock className="size-3.5" aria-hidden />
        {t("attesaEntro")} <Istante iso={data} stile="giorno" className="text-text" />
      </span>
    ) : null;

  switch (azione.tipo) {
    case "rivedi_risposta": {
      // La valutazione è quella effettiva: se l'utente l'ha corretta non va presentata come dell'AI. Il DTO della
      // home non dice ancora se è corretta (richiesto `valutazioneCorretta`): finché manca vale come dell'AI.
      const corretta = "valutazioneCorretta" in azione && azione.valutazioneCorretta === true;
      const chi = corretta ? t("valutazioneTua") : t("valutazioneAi");
      return (
        <Passo icona={<Reply className="text-reply" />} testo={t("rivediRisposta")} oggetto={oggetto(azione.oggettoAttesa)} lingua={lingua}>
          <span className="relative z-10" title={chi}>
            <Distintivo tono="risposta" icona={corretta ? <UserCheck className="size-3" aria-hidden /> : <Sparkles className="size-3" aria-hidden />}>
              <span className="sr-only">{chi}: </span>
              {testoCodice(tc, "valutazioni", azione.valutazione)}
            </Distintivo>
          </span>
          {/* L'area sensibile si estende in verticale (~36px) senza cambiare l'aspetto: un tocco impreciso non apre la Situazione. */}
          <LinkEmail
            emailId={azione.emailId}
            className="relative z-10 inline-flex items-center gap-1 font-medium text-accent-strong underline-offset-4 after:absolute after:-inset-x-1 after:-inset-y-2.5 after:content-[''] hover:underline"
          >
            <Mail className="size-3.5" aria-hidden />
            {t("apriRisposta")}
          </LinkEmail>
        </Passo>
      );
    }
    case "attivita":
      return (
        <Passo icona={<ListTodo className="text-accent" />} testo={<TestoSemplice come="span" testo={azione.descrizione} lingua={lingua} />}>
          {azione.priorita === "alta" ? <Distintivo tono="urgente">{testoCodice(tc, "priorita", azione.priorita)}</Distintivo> : null}
          {azione.scadenza ? (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3.5" aria-hidden />
              {tCard("scadenza")} <Istante iso={azione.scadenza} stile="giorno" className="text-text" />
            </span>
          ) : null}
        </Passo>
      );
    case "sollecito":
      return (
        <Passo icona={<MailQuestion className="text-urgent" />} testo={t("sollecito")} oggetto={oggetto(azione.oggetto)} lingua={lingua}>
          {azione.destinatari.length > 0 ? <span className="break-words">{t("sollecitoA", { destinatari: elenco(azione.destinatari) })}</span> : null}
          {attesaEntro(azione.dataAttesa)}
        </Passo>
      );
    case "attendi":
      return (
        <Passo
          icona={<Clock className="text-text-muted" />}
          testo={azione.destinatari.length > 0 ? t("attendi", { destinatari: elenco(azione.destinatari) }) : t("attendiSenzaDestinatari")}
          oggetto={oggetto(azione.oggetto)}
          lingua={lingua}
        >
          {attesaEntro(azione.dataAttesa)}
        </Passo>
      );
    case "gestisci_urgenza":
      return <Passo icona={<MailOpen className="text-text-muted" />} testo={t("gestisciUrgenza")} />;
    case "nessuna":
      return <Passo icona={<CheckCircle2 className="text-text-muted" />} testo={t("nessuna")} attenuato />;
  }
}

function Passo({
  icona,
  testo,
  oggetto,
  lingua,
  attenuato = false,
  children,
}: {
  icona: React.ReactNode;
  testo: React.ReactNode;
  oggetto?: string | null;
  lingua?: string;
  /** Per "niente da fare": stessa struttura, testo attenuato. */
  attenuato?: boolean;
  children?: React.ReactNode;
}) {
  // `children` può contenere solo `null` (nessun dettaglio): in quel caso la riga piccola non compare.
  const dettagli = Array.isArray(children) ? children.some(Boolean) : Boolean(children);
  return (
    <div className="space-y-1 text-sm">
      {/* Peso normale: il titolo della card deve restare la riga che guida la lettura. */}
      <p className={cn("flex items-start gap-2", attenuato ? "text-text-muted" : "text-text")}>
        <span aria-hidden className="mt-0.5 inline-flex shrink-0 [&>svg]:size-4">
          {icona}
        </span>
        <span className="min-w-0 break-words">{testo}</span>
      </p>
      {oggetto ? <TestoSemplice testo={oggetto} lingua={lingua} className="pl-6 text-text-muted" /> : null}
      {dettagli ? <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-xs text-text-muted">{children}</div> : null}
    </div>
  );
}
