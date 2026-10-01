import { useFormatter, useTranslations } from "next-intl";
import { Archive, ArchiveRestore, Sparkles } from "lucide-react";
import type { VistaSituazioneDto } from "@ec/applicazione";
import { DistintivoArea } from "@/components/comuni/distintivi";
import { LinkEmail } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { ModuloAzione } from "@/components/comuni/modulo-azione";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { Distintivo } from "@/components/ui/distintivo";
import { archiviaAzione, riapriSituazioneAzione } from "@/app/(app)/situations/[id]/azioni";
import { ancora, CorrezioniElemento, LinkPerche, Metadato, PulsanteAnnulla, type ContestoDettaglio } from "./comuni";

export const ANCORA_URGENZA = "urgenza";

/**
 * Intestazione del dettaglio: aree e proposte da rivedere, titolo e descrizione scritti dall'AI con la loro
 * provenienza in una riga, metadati essenziali su una riga. L'urgenza, il passo successivo e lo stato
 * (archiviata, conclusa) sono nella scheda "Prossima azione", detti una volta sola.
 */
export function IntestazioneSituazione({ vista, contesto }: { vista: VistaSituazioneDto; contesto: ContestoDettaglio }) {
  const t = useTranslations("situazione.intestazione");
  const tc = useTranslations("comuni");
  const formato = useFormatter();
  const { situazione, stato } = vista;
  const alta = stato.prioritaMassima === "alta";
  const distintivi = stato.aree.length > 0 || stato.haProposte || alta;
  // Il segno delle proposte porta alla prima da rivedere; se non la trova resta un'indicazione.
  const proposta = stato.haProposte ? (primaProposta(vista) ?? undefined) : null;
  // "Archivia" e "Riapri" si annullano a vicenda con il pulsante in alto (e dalla cronologia); "Segna come
  // gestita" si annulla accanto alla data di gestione. Le altre correzioni restano nella riga compatta.
  const gestione = situazione.correzioni.filter((c) => c.campo === "gestitaIl").at(-1);
  const altreCorrezioni = situazione.correzioni.filter((c) => c.campo !== "archiviata" && c.campo !== "gestitaIl");

  return (
    <header className="space-y-2.5">
      {distintivi ? (
        <div className="flex flex-wrap items-center gap-2">
          {stato.aree.map((area) => (
            <DistintivoArea key={area} area={area} />
          ))}
          {alta ? (
            <span title={t("prioritaAiuto")}>
              <Distintivo tono="neutro">{tc("priorita.alta")}</Distintivo>
            </span>
          ) : null}
          {proposta !== null ? (
            <a
              href={proposta}
              title={tc("propostaAiuto")}
              className="inline-flex items-center gap-1 rounded-full px-1 text-xs font-medium text-suggestion underline-offset-4 hover:underline"
            >
              <Sparkles className="size-3.5" aria-hidden />
              {t("proposte")}
            </a>
          ) : null}
        </div>
      ) : null}
      <h1 id="titolo-situazione" className="scroll-mt-6 text-2xl leading-tight sm:text-3xl">
        <TestoSemplice come="span" testo={situazione.titolo} lingua={situazione.lingua} />
      </h1>
      {situazione.descrizione.trim() ? (
        <TestoSemplice come="p" testo={situazione.descrizione} lingua={situazione.lingua} className="max-w-prose text-[15px] leading-relaxed text-text-muted" />
      ) : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-0.5 text-[13px]">
        <p className="inline-flex flex-wrap items-center gap-x-1.5 text-text-muted">
          <Sparkles className="size-3.5 shrink-0" aria-hidden />
          <span>
            {t.rich("scrittoDaAi", {
              link: (testo) => (
                <LinkEmail emailId={situazione.emailOrigineId} className="text-accent-strong underline-offset-4 hover:underline">
                  {testo}
                </LinkEmail>
              ),
            })}
          </span>
          <LinkPerche analisiId={situazione.analisiId} contesto={contesto} />
        </p>
        <dl className="flex flex-wrap gap-x-4 gap-y-1" title={t("creata", { data: formato.dateTime(new Date(situazione.creataIl), { dateStyle: "medium" }) })}>
          <Metadato etichetta={t("ultimaAttivita")}>
            <Istante iso={situazione.ultimaAttivita} stile="relativo" />
          </Metadato>
          {stato.scadenzaPiuVicina ? (
            <Metadato etichetta={t("scadenzaPiuVicina")}>
              <Istante iso={stato.scadenzaPiuVicina} stile="giorno" className="font-medium" />
            </Metadato>
          ) : null}
          {situazione.gestitaIl ? (
            <Metadato etichetta={t("gestita")}>
              <span className="inline-flex flex-wrap items-center gap-x-1">
                <Istante iso={situazione.gestitaIl} stile="relativo" />
                {gestione ? (
                  <PulsanteAnnulla correzioni={[gestione.id, ...situazione.correzioni.filter((c) => c.id !== gestione.id && c.creataIl === gestione.creataIl).map((c) => c.id)]} />
                ) : null}
              </span>
            </Metadato>
          ) : null}
        </dl>
      </div>
      <CorrezioniElemento correzioni={altreCorrezioni} />
    </header>
  );
}

/** Archivia o riapri, in alto a destra: azione rara e reversibile, fuori dal percorso di lettura. */
export function PulsanteArchivio({ vista }: { vista: VistaSituazioneDto }) {
  const t = useTranslations("situazione.intestazione");
  const campi = { situazione: vista.situazione.id };
  if (vista.stato.archiviata) {
    return (
      <ModuloAzione
        azione={riapriSituazioneAzione}
        campi={campi}
        variante="fantasma"
        etichetta={
          <>
            <ArchiveRestore className="size-4" aria-hidden />
            {t("riapri")}
          </>
        }
      />
    );
  }
  return (
    <span title={t("archiviaAiuto")}>
      <ModuloAzione
        azione={archiviaAzione}
        campi={campi}
        variante="fantasma"
        etichetta={
          <>
            <Archive className="size-4" aria-hidden />
            {t("archivia")}
          </>
        }
      />
    </span>
  );
}

/** Ancora della prima proposta dell'AI ancora da rivedere, nell'ordine della pagina. */
function primaProposta(vista: VistaSituazioneDto): string | null {
  const attivita = vista.attivita.find((a) => a.stato === "proposta");
  if (attivita) return `#${ancora.attivita(attivita.id)}`;
  const attesa = vista.attese.find((a) => a.ciclo === "proposta" && (a.stato === "aperta" || a.stato === "parziale"));
  if (attesa) return `#${ancora.attesa(attesa.id)}`;
  const risposta = vista.attese.flatMap((a) => a.risposte).find((r) => r.proposta && r.statoCollegamento !== "rifiutato");
  if (risposta) return `#${ancora.risposta(risposta.id)}`;
  const collegamento = vista.collegamenti.find((c) => c.stato === "proposto" && c.ruolo !== "origine" && c.emailId !== vista.situazione.emailOrigineId);
  return collegamento ? `#${ancora.collegamento(collegamento.id)}` : null;
}
