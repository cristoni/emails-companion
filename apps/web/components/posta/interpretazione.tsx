import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight, Sparkles, UserCheck } from "lucide-react";
import type { CorrezioneDto, RianalisiEmailDto, VistaEmailDto } from "@ec/applicazione";
import { CATEGORIE, type StatoFunzioneEmail } from "@ec/core/dominio";
import { testoCodice } from "@/components/comuni/codici";
import { DistintivoBase, DistintivoProposta } from "@/components/comuni/distintivi";
import { ElencoEvidenze } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { ModuloAzione, type AzioneModulo } from "@/components/comuni/modulo-azione";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { Avviso } from "@/components/ui/avviso";
import { Distintivo } from "@/components/ui/distintivo";
import { classiPulsante } from "@/components/ui/pulsante";
import { IntestazioneScheda, Scheda } from "@/components/ui/scheda";
import { DistintivoCategoria, DistintivoStatoFunzione, DistintivoUrgente } from "./distintivi";
import { ModuloCategoria, ModuloLingua } from "./moduli-correzione";

export interface AzioniEmail {
  categoria: AzioneModulo;
  urgenza: AzioneModulo;
  lingua: AzioneModulo;
  annulla: AzioneModulo;
  stimaRianalisi: AzioneModulo;
  confermaRianalisi: AzioneModulo;
}

/** Ultima correzione attiva su un campo dell'email: è quella che l'annullamento revoca. */
function ultimaCorrezione(correzioni: readonly CorrezioneDto[], campo: string): CorrezioneDto | null {
  return correzioni.filter((c) => c.campo === campo).at(-1) ?? null;
}

/** Motivo di una funzione AI: causa della pausa o codice d'errore, sempre tradotto. */
function useMotivoFunzione() {
  const t = useTranslations("comuni");
  return (stato: StatoFunzioneEmail, motivo: string | null): string | null => {
    if (stato === "in_pausa") return testoCodice(t, "motiviPausa", motivo);
    if (stato === "errore") return testoCodice(t, "errori", motivo);
    return null;
  };
}

function Provenienza({ corretta }: { corretta: boolean }) {
  const t = useTranslations("posta.classificazione");
  return corretta ? (
    <Distintivo tono="accento" icona={<UserCheck className="size-3" aria-hidden />}>
      {t("corretta")}
    </Distintivo>
  ) : (
    <Distintivo tono="neutro" icona={<Sparkles className="size-3" aria-hidden />}>
      {t("dallAi")}
    </Distintivo>
  );
}

function Campo({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 px-5 py-4">
      <h3 className="text-xs font-medium uppercase tracking-wide text-text-muted">{titolo}</h3>
      {children}
    </div>
  );
}

/**
 * Classificazione dell'AI con i valori effettivi (correzione prima dell'AI), la base dell'urgenza, la
 * motivazione come testo dell'AI, le evidenze e il pannello "Perché?". Categoria e urgenza si correggono
 * solo sulle email in entrata, le sole che l'AI classifica; ogni correzione è annullabile.
 */
export function SchedaClassificazione({ email, azioni }: { email: VistaEmailDto; azioni: AzioniEmail }) {
  const t = useTranslations("posta.classificazione");
  const tc = useTranslations("comuni");
  const motivoFunzione = useMotivoFunzione();
  const c = email.classificazione;
  const correggibile = email.direzione === "entrata";

  if (!c) {
    const stato = email.analisi.find((a) => a.funzione === "classificazione_priorita");
    const motivo = stato ? motivoFunzione(stato.stato, stato.motivo) : null;
    return (
      <Scheda>
        <IntestazioneScheda titolo={t("titolo")} />
        <div className="space-y-2 px-5 py-4 text-sm text-text-muted">
          <p>{email.direzione !== "entrata" ? t("nonPrevista") : email.soloPerRisposte ? t("soloPerRisposte") : t("nonClassificata")}</p>
          {stato ? (
            <p className="flex flex-wrap items-center gap-2">
              <span>{t("statoFunzione", { stato: tc(`statiFunzione.${stato.stato}`) })}</span>
              {motivo ? <span>· {motivo}</span> : null}
            </p>
          ) : null}
        </div>
      </Scheda>
    );
  }

  const correzioneCategoria = ultimaCorrezione(email.correzioni, "categoria");
  const correzioneUrgenza = ultimaCorrezione(email.correzioni, "urgente");
  const annulla = (correzione: CorrezioneDto) => (
    <ModuloAzione
      azione={azioni.annulla}
      campi={{ email: email.id, correzioni: correzione.id }}
      etichetta={t("annulla")}
      variante="fantasma"
      messaggi={{ ok: t("annullata") }}
    />
  );

  return (
    <Scheda>
      <IntestazioneScheda titolo={t("titolo")} descrizione={t("descrizione")} />
      <div className="divide-y divide-border">
        <Campo titolo={t("categoria")}>
          <div className="flex flex-wrap items-center gap-1.5">
            <DistintivoCategoria categoria={c.categoria} />
            <Provenienza corretta={correzioneCategoria !== null} />
          </div>
          {correzioneCategoria && c.categoriaAi !== c.categoria ? (
            <p className="text-xs text-text-muted">{t("valoreAi", { valore: tc(`categorie.${c.categoriaAi}`) })}</p>
          ) : null}
          {correggibile ? (
            <ModuloCategoria
              azione={azioni.categoria}
              emailId={email.id}
              attuale={c.categoria}
              opzioni={CATEGORIE.map((valore) => ({ valore, etichetta: tc(`categorie.${valore}`) }))}
            />
          ) : null}
          {correzioneCategoria ? annulla(correzioneCategoria) : null}
        </Campo>

        <Campo titolo={t("urgenza")}>
          <div className="flex flex-wrap items-center gap-1.5">
            {c.urgente ? <DistintivoUrgente etichetta={t("urgente")} /> : <Distintivo tono="neutro">{t("nonUrgente")}</Distintivo>}
            {correzioneUrgenza ? null : <DistintivoBase base={c.baseUrgenza} />}
            <Provenienza corretta={correzioneUrgenza !== null} />
          </div>
          {correzioneUrgenza ? (
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
              {t("valoreAi", { valore: c.urgenteAi ? t("urgente") : t("nonUrgente") })}
              <DistintivoBase base={c.baseUrgenza} />
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {correggibile ? (
              <ModuloAzione
                azione={azioni.urgenza}
                campi={{ email: email.id, urgente: String(!c.urgente) }}
                etichetta={c.urgente ? t("segnaNonUrgente") : t("segnaUrgente")}
              />
            ) : null}
            {correzioneUrgenza ? annulla(correzioneUrgenza) : null}
          </div>
        </Campo>

        <Campo titolo={t("priorita")}>
          <div className="flex flex-wrap items-center gap-1.5">
            <Distintivo tono="neutro">{tc(`priorita.${c.priorita}`)}</Distintivo>
            <Provenienza corretta={c.priorita !== c.prioritaAi} />
          </div>
          {c.priorita !== c.prioritaAi ? <p className="text-xs text-text-muted">{t("valoreAi", { valore: tc(`priorita.${c.prioritaAi}`) })}</p> : null}
        </Campo>

        <Campo titolo={t("motivazione")}>
          <TestoSemplice come="p" testo={c.motivazione} lingua={email.lingua.valore} className="text-sm leading-relaxed" />
        </Campo>

        <Campo titolo={t("evidenze")}>
          {c.evidenze.length > 0 ? <ElencoEvidenze evidenze={c.evidenze} /> : <p className="text-sm text-text-muted">{t("nessunaEvidenza")}</p>}
        </Campo>

        <PannelloPerche email={email} />
      </div>
    </Scheda>
  );
}

/** "Perché?": funzione, modello richiesto e servito, versione del Contesto AI e data dell'analisi. */
function PannelloPerche({ email }: { email: VistaEmailDto }) {
  const t = useTranslations("posta.perche");
  const tf = useTranslations("comuni.funzioni");
  return (
    <details className="group px-5 py-4">
      <summary className="cursor-pointer text-sm font-medium text-accent-strong underline-offset-4 hover:underline">{t("titolo")}</summary>
      {email.perche.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">{t("nessuna")}</p>
      ) : (
        <div className="mt-3 space-y-3">
          {email.perche.map((p) => (
            <dl key={p.analisiId} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-xs">
              <dt className="text-text-muted">{t("funzione")}</dt>
              <dd>{tf(p.funzione)}</dd>
              <dt className="text-text-muted">{t("modello")}</dt>
              <dd className="break-all font-mono">{p.modelloRichiesto}</dd>
              {p.modelloServito && p.modelloServito !== p.modelloRichiesto ? (
                <>
                  <dt className="text-text-muted">{t("modelloServito")}</dt>
                  <dd className="break-all font-mono">{p.modelloServito}</dd>
                </>
              ) : null}
              <dt className="text-text-muted">{t("contesto")}</dt>
              <dd>{p.contestoAiVersione === null ? t("nonRegistrata") : t("versione", { numero: p.contestoAiVersione })}</dd>
              <dt className="text-text-muted">{t("completata")}</dt>
              <dd>
                <Istante iso={p.completataIl} stile="data_ora" />
              </dd>
            </dl>
          ))}
        </div>
      )}
    </details>
  );
}

/** Formato del costo stimato: gli importi sotto il centesimo non diventano "$0.00". */
function useCosto() {
  const formato = useFormatter();
  const t = useTranslations("posta.rianalisi");
  return (costo: number) => {
    const dollari = (valore: number) => formato.number(valore, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return costo > 0 && costo < 0.01 ? t("costoMinimo", { costo: dollari(0.01) }) : dollari(costo);
  };
}

/**
 * Lingua effettiva con la sua fonte, correzione (lingue comuni o codice libero) annullabile e, dopo una
 * correzione, "Rianalizza questa email": prima la stima di numero e costo, poi la conferma esplicita.
 */
export function SchedaLingua({
  email,
  nomeLingua,
  opzioni,
  rianalisi,
  prezziIncompleti,
  hrefSenzaRianalisi,
  azioni,
}: {
  email: VistaEmailDto;
  nomeLingua: string | null;
  opzioni: { codice: string; nome: string }[];
  rianalisi: RianalisiEmailDto | null;
  prezziIncompleti: boolean;
  hrefSenzaRianalisi: string;
  azioni: AzioniEmail;
}) {
  const t = useTranslations("posta.lingua");
  const correzione = ultimaCorrezione(email.correzioni, "lingua");
  // Stesse condizioni della stima: altrimenti l'invito porterebbe solo a "nulla da rianalizzare".
  const rianalizzabile =
    !email.soloPerRisposte &&
    email.copie.some((c) => !c.eliminataNelProvider) &&
    email.analisi.some((a) => a.funzione === "classificazione_priorita" || a.funzione === "estrazione_attivita");
  // Un'analisi conclusa dopo la correzione ha già usato la lingua corretta: la rianalisi non va riproposta.
  const giaAggiornata = correzione !== null && email.perche.some((p) => p.completataIl !== null && Date.parse(p.completataIl) > Date.parse(correzione.creataIl));

  return (
    <Scheda>
      <IntestazioneScheda titolo={t("titolo")} descrizione={t("descrizione")} />
      <div className="divide-y divide-border">
        <Campo titolo={t("attuale")}>
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="font-medium">{nomeLingua ?? email.lingua.valore}</span>
            <span className="font-mono text-xs text-text-muted">{email.lingua.valore}</span>
          </p>
          <p className="text-xs text-text-muted">
            {t("fonte")}: {t(`fonti.${email.lingua.fonte}`)}
          </p>
          {correzione ? (
            <ModuloAzione azione={azioni.annulla} campi={{ email: email.id, correzioni: correzione.id }} etichetta={t("annulla")} variante="fantasma" />
          ) : null}
        </Campo>
        <Campo titolo={t("correggi")}>
          <ModuloLingua azione={azioni.lingua} emailId={email.id} attuale={email.lingua.valore} opzioni={opzioni} />
        </Campo>
        {rianalisi || (email.lingua.corretta && rianalizzabile && !giaAggiornata) ? (
          <BloccoRianalisi
            email={email}
            rianalisi={rianalisi}
            prezziIncompleti={prezziIncompleti}
            hrefSenzaRianalisi={hrefSenzaRianalisi}
            azioni={azioni}
          />
        ) : null}
      </div>
    </Scheda>
  );
}

function BloccoRianalisi({
  email,
  rianalisi,
  prezziIncompleti,
  hrefSenzaRianalisi,
  azioni,
}: {
  email: VistaEmailDto;
  rianalisi: RianalisiEmailDto | null;
  prezziIncompleti: boolean;
  hrefSenzaRianalisi: string;
  azioni: AzioniEmail;
}) {
  const t = useTranslations("posta.rianalisi");
  const costo = useCosto();

  let contenuto: React.ReactNode;
  if (!rianalisi) {
    contenuto = (
      <>
        <p className="text-sm text-text-muted">{t("invito")}</p>
        <ModuloAzione azione={azioni.stimaRianalisi} campi={{ email: email.id }} etichetta={t("pulsante")} />
      </>
    );
  } else if (rianalisi.stato === "stimata" && rianalisi.numeroEmail === 0) {
    contenuto = <p className="text-sm text-text-muted">{t("nessunaEmail")}</p>;
  } else if (rianalisi.stato === "stimata") {
    contenuto = (
      <>
        <p className="text-sm">{t("stima", { numero: rianalisi.numeroEmail, costo: costo(rianalisi.costoStimato) })}</p>
        {prezziIncompleti ? <p className="text-xs text-urgent">{t("prezziIncompleti")}</p> : null}
        <p className="text-xs text-text-muted">{t("nota")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <ModuloAzione
            azione={azioni.confermaRianalisi}
            campi={{ email: email.id, richiesta: rianalisi.richiestaId }}
            etichetta={t("conferma")}
            variante="primario"
            messaggi={{ non_confermabile: t("esiti.non_confermabile") }}
          />
          <Link href={hrefSenzaRianalisi} replace scroll={false} className={classiPulsante("fantasma", "sm")}>
            {t("nonOra")}
          </Link>
        </div>
      </>
    );
  } else {
    contenuto = (
      <Avviso tono={rianalisi.stato === "completata" ? "successo" : "info"} titolo={rianalisi.stato === "completata" ? t("completata") : t("inCorso")}>
        <span>
          {t("richiesta")} <Istante iso={rianalisi.creataIl} stile="relativo" />
        </span>
      </Avviso>
    );
  }

  return (
    <section id="rianalisi" aria-labelledby="rianalisi-titolo" className="scroll-mt-6 space-y-2.5 px-5 py-4">
      <h3 id="rianalisi-titolo" className="text-xs font-medium uppercase tracking-wide text-text-muted">
        {t("titolo")}
      </h3>
      {contenuto}
    </section>
  );
}

/** Situazioni collegate, con ruolo, origine e stato del Collegamento; un collegamento proposto dall'AI lo dice. */
export function SchedaSituazioni({ email }: { email: VistaEmailDto }) {
  const t = useTranslations("posta.situazioni");
  const tc = useTranslations("comuni");
  return (
    <Scheda>
      <IntestazioneScheda titolo={t("titolo")} descrizione={t("descrizione")} />
      {email.situazioni.length === 0 ? (
        <p className="px-5 py-4 text-sm text-text-muted">{t("nessuna")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {email.situazioni.map((s) => (
            <li key={s.collegamentoId ?? s.situazioneId} className="space-y-2 px-5 py-4">
              <Link href={`/situations/${s.situazioneId}`} className="group inline-flex items-start gap-1.5 font-medium text-text hover:text-accent-strong">
                <TestoSemplice come="span" testo={s.titolo} className="underline-offset-4 group-hover:underline" />
                <ArrowRight className="mt-1 size-3.5 shrink-0" aria-hidden />
              </Link>
              <div className="flex flex-wrap items-center gap-1.5">
                {s.origineDellaSituazione ? <Distintivo tono="accento">{t("origine")}</Distintivo> : null}
                {s.stato === "proposto" ? <DistintivoProposta /> : null}
                {s.stato ? (
                  <Distintivo tono={s.stato === "rifiutato" ? "pericolo" : "neutro"}>{tc(`statiCollegamento.${s.stato}`)}</Distintivo>
                ) : null}
              </div>
              {s.ruolo || s.origine ? (
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
                  {s.ruolo ? (
                    <>
                      <dt className="text-text-muted">{t("ruolo")}</dt>
                      <dd>{tc(`ruoliCollegamento.${s.ruolo}`)}</dd>
                    </>
                  ) : null}
                  {s.origine ? (
                    <>
                      <dt className="text-text-muted">{t("come")}</dt>
                      <dd>{tc(`originiCollegamento.${s.origine}`)}</dd>
                    </>
                  ) : null}
                </dl>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Scheda>
  );
}

/** Stato di ogni Funzione AI sull'email, con il motivo tradotto di pause ed errori. */
export function SchedaFunzioni({ email }: { email: VistaEmailDto }) {
  const t = useTranslations("posta.analisi");
  const tf = useTranslations("comuni.funzioni");
  const motivoFunzione = useMotivoFunzione();
  return (
    <Scheda>
      <IntestazioneScheda titolo={t("titolo")} descrizione={t("descrizione")} />
      {email.analisi.length === 0 ? (
        <p className="px-5 py-4 text-sm text-text-muted">{t("nessuna")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {email.analisi.map((a) => {
            const motivo = motivoFunzione(a.stato, a.motivo);
            return (
              <li key={a.funzione} className="space-y-1 px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">{tf(a.funzione)}</span>
                  <DistintivoStatoFunzione stato={a.stato} />
                </div>
                {motivo ? <p className="text-xs text-text-muted">{t("motivo", { motivo })}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </Scheda>
  );
}
