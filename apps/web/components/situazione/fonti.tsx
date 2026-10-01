import { useTranslations } from "next-intl";
import { ArrowDownLeft, ArrowUpRight, ExternalLink, Flag, Repeat, Zap } from "lucide-react";
import type { CollegamentoDto, FonteDto, UrgenzaEmailOrigineDto, VistaSituazioneDto } from "@ec/applicazione";
import type { Direzione } from "@ec/core/dominio";
import { testoCodice } from "@/components/comuni/codici";
import { LinkEmail, LinkProvider } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { Distintivo } from "@/components/ui/distintivo";
import { PulsanteProponiRisposta } from "@/components/bozze/pulsanti-proposta";
import { ancora, CorrezioniElemento, Indirizzi, Sezione, type ContestoDettaglio } from "./comuni";
import { EmailScollegate, eOrigine, RigaCollegamento } from "./collegamenti";
import { correzioniDelRifiuto } from "./correzioni-collegate";
import { SegnaUrgente, UrgenzaOrigine, urgenzaPredefinita } from "./urgenza-origine";

const ICONE: Record<Direzione, typeof ArrowDownLeft> = { entrata: ArrowDownLeft, uscita: ArrowUpRight, interna: Repeat };

/**
 * Email da cui derivano la Situazione e i suoi elementi, in ordine cronologico, ciascuna con lo stato del suo
 * collegamento alla Situazione (conferma e scollegamento compresi) e il link all'originale. Le caselle si
 * mostrano solo se le email stanno in caselle diverse. Le email scollegate restano in fondo, annullabili.
 */
export function SezioneFonti({
  vista,
  origine,
  urgenzaQui,
  emailUrgenteId,
  emailInEvidenza,
  contesto,
}: {
  vista: VistaSituazioneDto;
  origine: UrgenzaEmailOrigineDto | null;
  /** L'urgenza dell'email d'origine si corregge qui (e non nella scheda "Prossima azione"). */
  urgenzaQui: boolean;
  /** Email che rende urgente la Situazione: tra più email va riconosciuta. */
  emailUrgenteId: string | null;
  /** Email per cui la scheda "Prossima azione" offre già la risposta. */
  emailInEvidenza: string | null;
  contesto: ContestoDettaglio;
}) {
  const t = useTranslations("situazione.fonti");
  const { fonti, collegamenti } = vista;
  const risposte = vista.attese.flatMap((a) => a.risposte);
  // Più thread nella stessa Situazione: ciascuno riceve un numero nell'ordine in cui compare.
  const thread = new Map<string, number>();
  for (const f of fonti) if (f.thread && !thread.has(f.thread)) thread.set(f.thread, thread.size + 1);
  const piuThread = thread.size > 1;
  const caselle = new Set(fonti.flatMap((f) => f.caselle.map((c) => c.casellaId)));
  const piuCaselle = caselle.size > 1 || fonti.some((f) => f.caselle.length > 1);
  const inFonti = new Set(fonti.map((f) => f.emailId));

  return (
    <Sezione id="fonti" titolo={t("titolo")} conteggio={fonti.length}>
      <ol className="relative space-y-3 border-l border-border pl-4 sm:pl-5">
        {fonti.map((f) => (
          <VoceFonte
            key={f.emailId}
            fonte={f}
            numeroThread={piuThread && f.thread ? (thread.get(f.thread) ?? null) : null}
            piuCaselle={piuCaselle}
            sola={fonti.length === 1}
            urgente={fonti.length > 1 && f.emailId === emailUrgenteId}
            rispostaAltrove={f.emailId === emailInEvidenza}
            collegamenti={collegamenti.filter((c) => c.emailId === f.emailId)}
            urgenza={urgenzaQui && origine?.correggibile && origine.emailId === f.emailId ? origine : null}
            risposte={risposte}
            contesto={contesto}
          />
        ))}
      </ol>
      <EmailScollegate collegamenti={collegamenti.filter((c) => !inFonti.has(c.emailId))} risposte={risposte} contesto={contesto} />
    </Sezione>
  );
}

function VoceFonte({
  fonte: f,
  numeroThread,
  piuCaselle,
  sola,
  urgente,
  rispostaAltrove,
  collegamenti,
  urgenza,
  risposte,
  contesto,
}: {
  fonte: FonteDto;
  numeroThread: number | null;
  piuCaselle: boolean;
  /** Unica email della Situazione: "Ha dato origine alla Situazione" non aggiunge nulla alla vista. */
  sola: boolean;
  urgente: boolean;
  rispostaAltrove: boolean;
  collegamenti: readonly CollegamentoDto[];
  urgenza: UrgenzaEmailOrigineDto | null;
  risposte: VistaSituazioneDto["attese"][number]["risposte"];
  contesto: ContestoDettaglio;
}) {
  const t = useTranslations("situazione.fonti");
  const tl = useTranslations("situazione.collegamenti");
  const tc = useTranslations("comuni");
  const Icona = ICONE[f.direzione];
  const proprio = (indirizzo: string) => contesto.propri.has(indirizzo.toLowerCase());
  // Le proprie caselle non aggiungono nulla: "Da" per chi scrive all'utente, "A" per chi riceve da lui.
  const destinatari = [...f.destinatari.a, ...f.destinatari.cc].filter((i) => !proprio(i.indirizzo));
  const mittente = proprio(f.mittente.indirizzo) ? null : f.mittente;
  const origine = collegamenti.find((c) => eOrigine(c, contesto)) ?? (f.emailId === contesto.emailOrigineId ? null : undefined);
  const altri = collegamenti.filter((c) => !eOrigine(c, contesto));
  const copia = !piuCaselle ? f.caselle[0] : undefined;
  // Urgenza nello stato normale (non urgente, mai corretta): solo il pulsante, accanto ai link.
  const segnaUrgente = urgenza && urgenzaPredefinita(urgenza) ? urgenza : null;

  return (
    <li id={ancora.email(f.emailId)} className="relative scroll-mt-6">
      <span aria-hidden className="absolute top-5 -left-[1.4rem] size-2.5 rounded-full border border-border-strong bg-surface sm:-left-[1.65rem]" />
      {/* Il bordo resta pieno: un collegamento proposto si riconosce dal suo riquadro, qui sotto. */}
      <article
        aria-label={f.oggetto || t("senzaOggetto")}
        className="rounded-[var(--radius-card)] border border-border bg-surface-raised p-4 shadow-[var(--shadow-card)] target:ring-2 target:ring-accent/40"
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
          {/* "Ricevuta" è lo stato normale: solo la freccia (il nome resta per i lettori di schermo). */}
          <span className="inline-flex items-center gap-1" title={testoCodice(tc, "direzioni", f.direzione)}>
            <Icona className="size-3.5" aria-hidden />
            <span className={f.direzione === "entrata" ? "sr-only" : undefined}>{testoCodice(tc, "direzioni", f.direzione)}</span>
          </span>
          {f.direzione !== "entrata" ? <span aria-hidden>·</span> : null}
          <Istante iso={f.ricevutaIl} stile="data_ora" />
          {urgente ? (
            <Distintivo tono="urgente" icona={<Zap className="size-3" aria-hidden />}>
              {t("urgente")}
            </Distintivo>
          ) : null}
          {numeroThread !== null ? <Distintivo tono="neutro">{t("thread", { numero: numeroThread })}</Distintivo> : null}
          {origine !== undefined && sola ? (
            // Unica email: l'ancora del collegamento d'origine resta, il testo solo per i lettori di schermo.
            <span id={origine ? ancora.collegamento(origine.id) : undefined} className="sr-only scroll-mt-6">
              {tl("origine")}
            </span>
          ) : origine !== undefined ? (
            <span
              id={origine ? ancora.collegamento(origine.id) : undefined}
              className="inline-flex scroll-mt-6 items-center gap-1 rounded-full border border-border px-2 py-0.5 font-medium target:bg-accent-soft"
            >
              <Flag className="size-3" aria-hidden />
              {tl("origine")}
            </span>
          ) : null}
        </div>

        <TestoSemplice come="p" testo={f.oggetto || t("senzaOggetto")} lingua={f.lingua} className="mt-1.5 font-medium" />
        {mittente || destinatari.length > 0 ? (
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-text-muted">
            {mittente ? (
              <span>
                {t("da")} <Indirizzi indirizzi={[mittente]} className="text-text" />
              </span>
            ) : null}
            {destinatari.length > 0 ? (
              <span>
                {t("a")} <Indirizzi indirizzi={destinatari} className="text-text" />
              </span>
            ) : null}
          </p>
        ) : null}
        {f.anteprima ? <TestoSemplice come="p" testo={f.anteprima} lingua={f.lingua} className="mt-1.5 line-clamp-2 text-sm text-text-muted" /> : null}

        {piuCaselle && f.caselle.length > 0 ? (
          <ul className="mt-2.5 space-y-1" aria-label={t("caselle")}>
            {f.caselle.map((c) => (
              <li key={`${c.casellaId}-${c.idConnettore}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span className="text-text">{c.indirizzo}</span>
                {c.cartelle.map((cartella) => (
                  <span key={cartella} className="rounded-full border border-border px-1.5 py-px text-text-muted">
                    {testoCodice(tc, "cartelle", cartella)}
                  </span>
                ))}
                {c.origineInvio === "app" ? <span className="text-text-muted">{t("inviataDallApp")}</span> : null}
                {c.eliminataNelProvider ? <span className="text-danger">{t("eliminataNelProvider")}</span> : null}
                <LinkProvider href={c.linkOriginale} className="inline-flex items-center gap-1 text-accent-strong underline-offset-4 hover:underline">
                  {tc("fonte.apriNelProvider")}
                  <ExternalLink className="size-3" aria-hidden />
                </LinkProvider>
              </li>
            ))}
          </ul>
        ) : copia && (copia.origineInvio === "app" || copia.eliminataNelProvider) ? (
          <p className="mt-2 flex flex-wrap gap-x-2 text-xs">
            {copia.origineInvio === "app" ? <span className="text-text-muted">{t("inviataDallApp")}</span> : null}
            {copia.eliminataNelProvider ? <span className="text-danger">{t("eliminataNelProvider")}</span> : null}
          </p>
        ) : null}

        {altri.length > 0 ? (
          <div className="mt-3 space-y-2">
            {altri.map((c) => (
              <RigaCollegamento key={c.id} collegamento={c} risposte={risposte} contesto={contesto} />
            ))}
          </div>
        ) : null}
        {origine && origine.correzioni.length > 0 ? (
          <div className="mt-3">
            <CorrezioniElemento correzioni={origine.correzioni} extra={correzioniDelRifiuto(risposte, origine)} />
          </div>
        ) : null}
        {urgenza && !segnaUrgente ? (
          <div className="mt-3">
            <UrgenzaOrigine origine={urgenza} contesto={contesto} />
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3">
          <LinkEmail emailId={f.emailId} className="text-sm font-medium text-accent-strong underline-offset-4 hover:underline" />
          {copia ? (
            <LinkProvider href={copia.linkOriginale} className="inline-flex items-center gap-1 text-sm text-text-muted underline-offset-4 hover:text-text hover:underline">
              {tc("fonte.apriNelProvider")}
              <ExternalLink className="size-3.5" aria-hidden />
            </LinkProvider>
          ) : null}
          {segnaUrgente || (f.direzione === "entrata" && !rispostaAltrove) ? (
            <span className="flex flex-wrap items-center gap-2 sm:ml-auto">
              {segnaUrgente ? <SegnaUrgente emailId={segnaUrgente.emailId} /> : null}
              {f.direzione === "entrata" && !rispostaAltrove ? <PulsanteProponiRisposta emailId={f.emailId} bozzaId={contesto.bozzeRisposta.get(f.emailId)} /> : null}
            </span>
          ) : null}
        </div>
      </article>
    </li>
  );
}
