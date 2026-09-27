import { useFormatter, useTranslations } from "next-intl";
import { Link2 } from "lucide-react";
import type { CollegamentoDto, VistaSituazioneDto } from "@ec/applicazione";
import { testoCodice } from "@/components/comuni/codici";
import { DistintivoProposta } from "@/components/comuni/distintivi";
import { LinkEmail } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { ModuloAzione } from "@/components/comuni/modulo-azione";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { Distintivo } from "@/components/ui/distintivo";
import { confermaElementoAzione, rifiutaCollegamentoAzione } from "@/app/(app)/situations/[id]/azioni";
import { ancora, CorrezioniElemento, formattaIndirizzo, LinkPerche, linguaDi, Sezione, type ContestoDettaglio } from "./comuni";
import { correzioniDelRifiuto } from "./correzioni-collegate";

/** Collegamenti delle email alla Situazione: come sono stati stabiliti, stato, confidenza e correzioni. */
export function SezioneCollegamenti({ vista, contesto }: { vista: VistaSituazioneDto; contesto: ContestoDettaglio }) {
  const t = useTranslations("situazione.collegamenti");
  const proposti = vista.collegamenti.filter((c) => c.stato === "proposto").length;
  const risposte = vista.attese.flatMap((a) => a.risposte);
  return (
    <Sezione id="collegamenti" titolo={t("titolo")} descrizione={t("descrizione")} conteggio={vista.collegamenti.length}>
      {proposti > 0 ? <p className="text-sm text-text-muted">{t("proposti", { numero: proposti })}</p> : null}
      <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface-raised">
        {vista.collegamenti.map((c) => (
          <VoceCollegamento key={c.id} collegamento={c} extra={correzioniDelRifiuto(risposte, c)} contesto={contesto} />
        ))}
      </ul>
    </Sezione>
  );
}

function VoceCollegamento({ collegamento: c, extra, contesto }: { collegamento: CollegamentoDto; extra: Record<string, string[]>; contesto: ContestoDettaglio }) {
  const t = useTranslations("situazione.collegamenti");
  const tc = useTranslations("comuni");
  const formato = useFormatter();
  const fonte = contesto.fonti.get(c.emailId);
  // Il collegamento dell'email d'origine non si rifiuta: è la Situazione stessa (il caso d'uso risponde non_valido).
  const origine = c.ruolo === "origine" || c.emailId === contesto.emailOrigineId;
  const rifiutato = c.stato === "rifiutato";
  const proposto = c.stato === "proposto" && !origine;
  const tono = rifiutato ? "pericolo" : c.stato === "confermato" ? "accento" : "proposta";

  return (
    <li id={ancora.collegamento(c.id)} className={`scroll-mt-6 space-y-2 px-4 py-3 target:bg-accent-soft ${rifiutato ? "bg-surface-muted" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Link2 className="size-4 text-text-muted" aria-hidden />
        {proposto ? <DistintivoProposta /> : null}
        <Distintivo tono={proposto ? "neutro" : tono}>{testoCodice(tc, "statiCollegamento", c.stato)}</Distintivo>
        <Distintivo tono="neutro">{testoCodice(tc, "ruoliCollegamento", c.ruolo)}</Distintivo>
        <span className="text-xs text-text-muted">{testoCodice(tc, "originiCollegamento", c.origine)}</span>
        {c.confidenza !== null ? (
          <span className="text-xs text-text-muted">
            {t("confidenza")} {formato.number(c.confidenza, { style: "percent", maximumFractionDigits: 0 })}
          </span>
        ) : null}
        <LinkPerche analisiId={c.analisiId} contesto={contesto} />
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        {fonte ? (
          <>
            <TestoSemplice come="span" testo={fonte.oggetto || "—"} lingua={linguaDi(contesto, c.emailId)} className="font-medium" />
            <span className="font-mono text-xs text-text-muted">{formattaIndirizzo(fonte.mittente)}</span>
            <Istante iso={fonte.ricevutaIl} stile="data" className="text-xs text-text-muted" />
            <a href={`#${ancora.email(c.emailId)}`} className="text-xs text-text-muted underline-offset-4 hover:text-text hover:underline">
              {t("vaiAllaFonte")}
            </a>
          </>
        ) : (
          <span className="text-text-muted">{t("emailNonTraLeFonti")}</span>
        )}
        <LinkEmail emailId={c.emailId} className="text-xs text-accent-strong underline-offset-4 hover:underline" />
      </div>
      {origine ? (
        <p className="text-xs text-text-muted">{t("origineAiuto")}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {c.stato === "proposto" ? (
            <ModuloAzione azione={confermaElementoAzione} campi={{ tipo: "collegamento", id: c.id }} etichetta={t("conferma")} variante="primario" />
          ) : null}
          {!rifiutato ? (
            <ModuloAzione
              azione={rifiutaCollegamentoAzione}
              campi={{ collegamento: c.id }}
              etichetta={t("rifiuta")}
              variante="fantasma"
              conferma={{ domanda: t("rifiutaDomanda"), etichetta: t("rifiutaConferma") }}
            />
          ) : (
            <p className="text-xs text-text-muted">{t("rifiutatoAiuto")}</p>
          )}
        </div>
      )}
      <CorrezioniElemento correzioni={c.correzioni} extra={extra} />
    </li>
  );
}
