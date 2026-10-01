import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, CalendarClock, ChevronRight, History, Inbox, Sparkles } from "lucide-react";
import type { CardSituazione as CardSituazioneDto } from "@ec/applicazione";
import { testoCodice } from "@/components/comuni/codici";
import { IconaArea } from "@/components/comuni/distintivi";
import { Istante } from "@/components/comuni/istante";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { Scheda } from "@/components/ui/scheda";
import { ProssimaAzione } from "./prossima-azione";

/**
 * Card di una Situazione nella sua Area principale: titolo, motivo dell'urgenza (solo se aggiunge qualcosa al
 * titolo della sezione), prossima azione e una riga di dettagli. Il titolo è l'unico link alla Situazione e ne estende l'area cliccabile a
 * tutta la card; ciò che deve restare interattivo sopra quel link (link all'email, tooltip) è `relative z-10`.
 * La casella compare solo se l'utente ne ha più di una (`mostraCaselle`, calcolato dalla home).
 */
export function CardSituazione({ card, mostraCaselle }: { card: CardSituazioneDto; mostraCaselle: boolean }) {
  const t = useTranslations("home.card");
  const tc = useTranslations("comuni");
  const azione = card.prossimaAzione;
  // La scadenza più vicina è già nella prossima azione quando questa è la stessa attività.
  // "Email urgente" ripeterebbe il titolo della sezione: il motivo compare solo quando dice da dove viene l'urgenza.
  const motivo = card.motivoUrgenza && card.motivoUrgenza !== "email_urgente" ? card.motivoUrgenza : null;
  const scadenzaGiaMostrata =
    azione.tipo === "attivita" && azione.scadenza !== null && card.scadenzaPiuVicina !== null && azione.scadenza.slice(0, 10) === card.scadenzaPiuVicina.slice(0, 10);

  return (
    <Scheda className="group relative p-4 transition-[border-color,box-shadow] focus-within:border-accent hover:border-border-strong hover:shadow-md sm:p-5">
      <div className="flex items-start gap-3">
        <h3 className="min-w-0 flex-1 text-[15px] leading-snug">
          <Link
            href={`/situations/${card.id}`}
            className="rounded-sm after:absolute after:inset-0 after:rounded-[var(--radius-card)] after:content-[''] group-hover:text-accent-strong"
          >
            <TestoSemplice come="span" testo={card.titolo} lingua={card.lingua} />
          </Link>
        </h3>
        <ChevronRight
          className="mt-0.5 size-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-text motion-reduce:transition-none"
          aria-hidden
        />
      </div>

      {motivo ? (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-urgent">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          {testoCodice(tc, "motiviUrgenza", motivo, "aree.urgente")}
        </p>
      ) : null}

      <div className="mt-3">
        <ProssimaAzione azione={azione} lingua={card.lingua} titolo={card.titolo} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-text-muted">
        {card.indicatori.length > 0 ? (
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            {t("anche")}
            {card.indicatori.map((area) => (
              <span key={area} className="inline-flex items-center gap-1 text-text">
                <IconaArea area={area} className="size-3.5" />
                {tc(`aree.${area}`)}
              </span>
            ))}
          </span>
        ) : null}
        {card.scadenzaPiuVicina && !scadenzaGiaMostrata ? (
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="size-3.5" aria-hidden />
            {t("scadenza")}
            <Istante iso={card.scadenzaPiuVicina} stile="giorno" className="text-text" />
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1">
          <History className="size-3.5 shrink-0" aria-hidden />
          <span className="sr-only">{t("ultimaAttivita")} </span>
          <Istante iso={card.ultimaAttivita} stile="relativo" />
        </span>
        {card.haProposte ? (
          // Marcatore della proposta AI con il significato a vista: sul touch il tooltip non si vede.
          <span className="relative z-10 inline-flex items-center gap-1 whitespace-nowrap text-suggestion" title={tc("propostaAiuto")}>
            <Sparkles className="size-3.5 shrink-0" aria-hidden />
            <span aria-hidden>{t("daConfermare")}</span>
            <span className="sr-only">{tc("propostaAiuto")}</span>
          </span>
        ) : null}
        {mostraCaselle && card.caselle.length > 0 ? (
          <span className="inline-flex min-w-0 max-w-full items-center gap-1">
            <Inbox className="size-3.5 shrink-0" aria-hidden />
            <span className="sr-only">{t("caselle")} </span>
            <span className="truncate">{card.caselle.join(", ")}</span>
          </span>
        ) : null}
      </div>
    </Scheda>
  );
}
