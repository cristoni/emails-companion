import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight, Layers, Reply, Sparkles, TriangleAlert, Undo2, UserCheck } from "lucide-react";
import type { CorrezioneDto, RianalisiEmailDto, VistaEmailDto } from "@ec/applicazione";
import { CATEGORIE, type StatoFunzioneEmail } from "@ec/core/dominio";
import { testoCodice } from "@/components/comuni/codici";
import { DistintivoBase, DistintivoProposta } from "@/components/comuni/distintivi";
import { ElencoEvidenze } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { ModuloAzione, type AzioneModulo } from "@/components/comuni/modulo-azione";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { Avviso } from "@/components/ui/avviso";
import { Espandibile } from "@/components/ui/espandibile";
import { classiPulsante } from "@/components/ui/pulsante";
import { Scheda } from "@/components/ui/scheda";
import { DistintivoStatoFunzione, funzioneDaSegnalare, type StatoFunzioneDaSegnalare } from "./distintivi";
import { ModuloCategoria, ModuloLingua } from "./moduli-correzione";

export interface AzioniEmail {
  categoria: AzioneModulo;
  urgenza: AzioneModulo;
  lingua: AzioneModulo;
  annulla: AzioneModulo;
  stimaRianalisi: AzioneModulo;
  confermaRianalisi: AzioneModulo;
}

/** Id del campo della categoria: l'etichetta della riga lo indica, il modulo (client) lo usa. */
const ID_CATEGORIA = "categoria-email";

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

const ETICHETTA = "flex min-h-9 items-center self-start text-sm text-text-muted";

/**
 * Riga della scheda: etichetta a sinistra, valore e azioni a destra. Con `per` l'etichetta è quella del campo;
 * `aiuto` è una spiegazione breve nel `title` dell'etichetta.
 */
function Riga({ etichetta, per, aiuto, children }: { etichetta: string; per?: string; aiuto?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 px-5 py-3">
      {per ? (
        <label htmlFor={per} title={aiuto} className={ETICHETTA}>
          {etichetta}
        </label>
      ) : (
        <span title={aiuto} className={ETICHETTA}>
          {etichetta}
        </span>
      )}
      <div className="min-w-0 space-y-1">{children}</div>
    </div>
  );
}

/**
 * Provenienza di un valore, come testo attenuato e non come pillola: "Indicata dall'AI" oppure, dopo una
 * correzione, l'icona dell'utente con il valore originale dell'AI ("Per l'AI: …", mai spezzato a metà) o
 * "Corretta da te", e l'annullamento in linea dopo il testo. "Corretta da te" resta nel titolo e per i
 * lettori di schermo anche quando si mostra il valore dell'AI.
 */
function Provenienza({ corretta, valoreAi, annulla }: { corretta: boolean; valoreAi?: React.ReactNode; annulla?: React.ReactNode }) {
  const t = useTranslations("posta.classificazione");
  if (!corretta) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-text-muted">
        <Sparkles className="size-3.5 shrink-0" aria-hidden />
        {t("dallAi")}
      </p>
    );
  }
  return (
    <div className="text-xs leading-6 text-text-muted">
      <span title={t("corretta")}>
        <UserCheck className="mr-1 inline size-3.5 align-[-3px] text-accent-strong" aria-hidden />
        {valoreAi ? (
          <>
            <span className="sr-only">{t("corretta")} · </span>
            <span className="whitespace-nowrap">{valoreAi}</span>
          </>
        ) : (
          t("corretta")
        )}
      </span>{" "}
      {annulla}
    </div>
  );
}

/**
 * Annullamento di una correzione: visibile come "Annulla", con il nome completo (diverso per categoria,
 * urgenza e lingua) per i lettori di schermo, così due annullamenti sulla stessa pagina non si confondono.
 * Segue il testo della provenienza senza alzarne la riga.
 */
function Annulla({ azione, emailId, correzioneId, nome }: { azione: AzioneModulo; emailId: string; correzioneId: string; nome: string }) {
  const t = useTranslations("posta.classificazione");
  return (
    <ModuloAzione
      azione={azione}
      campi={{ email: emailId, correzioni: correzioneId }}
      etichetta={
        <>
          <Undo2 className="size-3.5" aria-hidden />
          <span aria-hidden>{t("annullaBreve")}</span>
          <span className="sr-only">{nome}</span>
        </>
      }
      variante="fantasma"
      messaggi={{ ok: t("annullata") }}
      className="-my-2 -ml-1 align-middle"
    />
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
 * Scheda unica dell'AI sull'email: categoria, urgenza, priorità e lingua come righe con il valore effettivo
 * (la correzione prevale sull'AI) e la correzione sul posto, ogni correzione annullabile; poi la motivazione
 * con le evidenze e, a richiesta, la provenienza tecnica ("Perché?") e lo stato di ogni Funzione AI.
 * Categoria e urgenza si correggono solo sulle email in entrata, le sole che l'AI classifica (per le altre la
 * riga non c'è). Dopo una
 * correzione della lingua, "Rianalizza questa email" mostra prima la stima e chiede una conferma esplicita.
 */
export function SchedaAi({
  email,
  nomeLingua,
  opzioniLingua,
  rianalisi,
  prezziIncompleti,
  hrefSenzaRianalisi,
  hrefTesto,
  vistaCorpo,
  azioni,
}: {
  email: VistaEmailDto;
  nomeLingua: string | null;
  opzioniLingua: { codice: string; nome: string }[];
  rianalisi: RianalisiEmailDto | null;
  prezziIncompleti: boolean;
  hrefSenzaRianalisi: string;
  /** Testo dell'email (vista "Testo") con i parametri da conservare: le citazioni portano lì. */
  hrefTesto: string;
  vistaCorpo: Record<string, string>;
  azioni: AzioniEmail;
}) {
  const t = useTranslations("posta.classificazione");
  const motivoFunzione = useMotivoFunzione();
  const c = email.classificazione;

  let senzaClassificazione: React.ReactNode = null;
  if (!c && email.direzione === "entrata") {
    // La riga di stato serve solo quando la classificazione è ferma (pausa o errore), con il motivo.
    const ferma = email.analisi.find((a) => a.funzione === "classificazione_priorita" && (a.stato === "in_pausa" || a.stato === "errore"));
    senzaClassificazione = (
      <div className="space-y-1 px-5 py-3 text-sm text-text-muted">
        {email.soloPerRisposte ? (
          <p title={t("soloPerRisposteAiuto")}>
            {t("soloPerRisposte")}
            <span className="sr-only"> {t("soloPerRisposteAiuto")}</span>
          </p>
        ) : (
          <p>{t("nonClassificata")}</p>
        )}
        {ferma ? <p className="text-xs">{motivoFunzione(ferma.stato, ferma.motivo)}</p> : null}
      </div>
    );
  }

  return (
    <Scheda id="ai" className="scroll-mt-6">
      <h2 id="ai-titolo" className="flex items-center gap-2 border-b border-border px-5 py-3.5 text-base">
        <Sparkles className="size-4 shrink-0 text-accent-strong" aria-hidden />
        {t("titolo")}
      </h2>
      <div className="divide-y divide-border">
        {c ? <RigheClassificazione email={email} azioni={azioni} /> : senzaClassificazione}
        <RigaLingua
          email={email}
          nomeLingua={nomeLingua}
          opzioni={opzioniLingua}
          rianalisi={rianalisi}
          prezziIncompleti={prezziIncompleti}
          hrefSenzaRianalisi={hrefSenzaRianalisi}
          vistaCorpo={vistaCorpo}
          azioni={azioni}
        />
        {c ? (
          <div className="space-y-3 px-5 py-4">
            <div className="space-y-1">
              <h3 className="text-sm font-normal text-text-muted">{t("motivazione")}</h3>
              <TestoSemplice come="p" testo={c.motivazione} lingua={email.lingua.valore} className="text-sm leading-relaxed" />
            </div>
            <ElencoEvidenze evidenze={c.evidenze} emailCorrente={email.id} hrefEmailCorrente={hrefTesto} />
          </div>
        ) : null}
        <Dettagli email={email} />
      </div>
    </Scheda>
  );
}

function RigheClassificazione({ email, azioni }: { email: VistaEmailDto; azioni: AzioniEmail }) {
  const t = useTranslations("posta.classificazione");
  const tc = useTranslations("comuni");
  const c = email.classificazione!;
  const correggibile = email.direzione === "entrata";
  const correzioneCategoria = ultimaCorrezione(email.correzioni, "categoria");
  const correzioneUrgenza = ultimaCorrezione(email.correzioni, "urgente");
  const correzionePriorita = ultimaCorrezione(email.correzioni, "priorita");
  return (
    <>
      <Riga etichetta={t("nuovaCategoria")} per={correggibile ? ID_CATEGORIA : undefined}>
        {correggibile ? (
          <ModuloCategoria
            id={ID_CATEGORIA}
            azione={azioni.categoria}
            emailId={email.id}
            attuale={c.categoria}
            opzioni={CATEGORIE.map((valore) => ({ valore, etichetta: tc(`categorie.${valore}`) }))}
          />
        ) : (
          <p className="flex min-h-9 items-center text-sm">{tc(`categorie.${c.categoria}`)}</p>
        )}
        <Provenienza
          corretta={correzioneCategoria !== null}
          valoreAi={c.categoriaAi !== c.categoria ? t("valoreAi", { valore: tc(`categorie.${c.categoriaAi}`) }) : null}
          annulla={correzioneCategoria ? <Annulla azione={azioni.annulla} emailId={email.id} correzioneId={correzioneCategoria.id} nome={t("annulla")} /> : null}
        />
      </Riga>

      <Riga etichetta={t("urgenza")}>
        <div className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1">
          {c.urgente ? (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-sm">
              <TriangleAlert className="size-3.5 shrink-0 text-urgent" aria-hidden />
              {t("urgente")}
            </span>
          ) : (
            <span className="min-w-0 text-sm">{t("nonUrgente")}</span>
          )}
          {correggibile ? (
            <ModuloAzione
              azione={azioni.urgenza}
              campi={{ email: email.id, urgente: String(!c.urgente) }}
              etichetta={c.urgente ? t("segnaNonUrgente") : t("segnaUrgente")}
              className="ml-auto"
            />
          ) : null}
        </div>
        {correzioneUrgenza ? (
          <Provenienza
            corretta
            valoreAi={
              <>
                {t("valoreAi", { valore: c.urgenteAi ? t("urgente") : t("nonUrgente") })}
                {c.urgenteAi ? (
                  <>
                    {" "}
                    <DistintivoBase base={c.baseUrgenza} />
                  </>
                ) : null}
              </>
            }
            annulla={<Annulla azione={azioni.annulla} emailId={email.id} correzioneId={correzioneUrgenza.id} nome={t("annullaUrgenza")} />}
          />
        ) : c.urgente ? (
          <p>
            <DistintivoBase base={c.baseUrgenza} />
          </p>
        ) : null}
      </Riga>

      <Riga etichetta={t("priorita")}>
        <p className="flex min-h-9 items-center text-sm">{t(`livelli.${c.priorita}`)}</p>
        <Provenienza
          corretta={correzionePriorita !== null || c.priorita !== c.prioritaAi}
          valoreAi={c.priorita !== c.prioritaAi ? t("valoreAi", { valore: t(`livelli.${c.prioritaAi}`) }) : null}
          annulla={correzionePriorita ? <Annulla azione={azioni.annulla} emailId={email.id} correzioneId={correzionePriorita.id} nome={t("annulla")} /> : null}
        />
      </Riga>
    </>
  );
}

/**
 * Lingua effettiva con la sua fonte (solo se non è il rilevamento automatico), la correzione a richiesta
 * (lingue comuni o codice libero) annullabile e, dopo una correzione, il blocco della rianalisi, sempre
 * visibile sotto la riga.
 */
function RigaLingua({
  email,
  nomeLingua,
  opzioni,
  rianalisi,
  prezziIncompleti,
  hrefSenzaRianalisi,
  vistaCorpo,
  azioni,
}: {
  email: VistaEmailDto;
  nomeLingua: string | null;
  opzioni: { codice: string; nome: string }[];
  rianalisi: RianalisiEmailDto | null;
  prezziIncompleti: boolean;
  hrefSenzaRianalisi: string;
  vistaCorpo: Record<string, string>;
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
  const fonte = email.lingua.fonte;

  return (
    <>
      <Riga etichetta={t("titolo")} aiuto={t("descrizione")}>
        <p className="flex min-h-9 flex-wrap items-center gap-x-1.5 text-sm">
          <span>{nomeLingua ?? email.lingua.valore}</span>
          <span className="font-mono text-xs text-text-muted">{email.lingua.valore}</span>
        </p>
        {correzione ? (
          <Provenienza corretta annulla={<Annulla azione={azioni.annulla} emailId={email.id} correzioneId={correzione.id} nome={t("annulla")} />} />
        ) : fonte !== "rilevata" ? (
          <p className="text-xs text-text-muted">
            {fonte === "utente" ? <UserCheck className="mr-1 inline size-3.5 align-[-3px] text-accent-strong" aria-hidden /> : null}
            {t(`fonti.${fonte}`)}
          </p>
        ) : null}
        <Espandibile titolo={t("correggi")} classeContenuto="mt-2">
          <ModuloLingua azione={azioni.lingua} emailId={email.id} attuale={email.lingua.valore} opzioni={opzioni} />
        </Espandibile>
      </Riga>
      {rianalisi || (email.lingua.corretta && rianalizzabile && !giaAggiornata) ? (
        <BloccoRianalisi
          email={email}
          rianalisi={rianalisi}
          prezziIncompleti={prezziIncompleti}
          hrefSenzaRianalisi={hrefSenzaRianalisi}
          vistaCorpo={vistaCorpo}
          azioni={azioni}
        />
      ) : null}
    </>
  );
}

/**
 * Rianalisi dopo una correzione della lingua: prima la stima, poi la conferma esplicita. La stima riporta
 * alla stessa vista del corpo (`vistaCorpo`: testo o originale, con o senza immagini).
 */
function BloccoRianalisi({
  email,
  rianalisi,
  prezziIncompleti,
  hrefSenzaRianalisi,
  vistaCorpo,
  azioni,
}: {
  email: VistaEmailDto;
  rianalisi: RianalisiEmailDto | null;
  prezziIncompleti: boolean;
  hrefSenzaRianalisi: string;
  vistaCorpo: Record<string, string>;
  azioni: AzioniEmail;
}) {
  const t = useTranslations("posta.rianalisi");
  const costo = useCosto();

  let contenuto: React.ReactNode;
  if (!rianalisi) {
    contenuto = (
      <>
        <p className="text-sm">{t("invito")}</p>
        <ModuloAzione azione={azioni.stimaRianalisi} campi={{ ...vistaCorpo, email: email.id }} etichetta={t("pulsante")} />
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
    <section id="rianalisi" aria-labelledby="rianalisi-titolo" className="scroll-mt-6 space-y-2.5 bg-surface-muted px-5 py-3.5">
      <h3 id="rianalisi-titolo" className="sr-only">
        {t("titolo")}
      </h3>
      {contenuto}
    </section>
  );
}

/** Gravità degli stati da segnalare: il titolo delle Funzioni AI mostra il più grave. */
const GRAVITA: Record<StatoFunzioneDaSegnalare, number> = { errore: 0, in_pausa: 1, da_eseguire: 2 };

/**
 * Dettagli a richiesta in fondo alla scheda: "Dettagli dell'analisi" con funzione, modello richiesto e usato,
 * versione del Contesto AI (solo se non sono le direttive predefinite) e data di ogni analisi; poi le sole
 * Funzioni AI in attesa, in pausa o in errore (quelle eseguite o non necessarie non si elencano), aperte da
 * sé se una è in pausa o in errore, così i problemi restano visibili.
 */
function Dettagli({ email }: { email: VistaEmailDto }) {
  const t = useTranslations("posta");
  const tf = useTranslations("comuni.funzioni");
  const motivoFunzione = useMotivoFunzione();
  const eccezioni = email.analisi
    .flatMap((a) => (funzioneDaSegnalare(a.stato) ? [{ ...a, stato: a.stato }] : []))
    .sort((a, b) => GRAVITA[a.stato] - GRAVITA[b.stato]);
  if (email.perche.length === 0 && eccezioni.length === 0) return null;
  const problemi = eccezioni.some((a) => a.stato === "errore" || a.stato === "in_pausa");

  return (
    <div className="space-y-2.5 px-5 py-3.5">
      {email.perche.length > 0 ? (
        <Espandibile titolo={t("perche.titolo")} classeContenuto="mt-2 space-y-3">
          {email.perche.map((p) => (
            <dl key={p.analisiId} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
              <dt className="text-text-muted">{t("perche.funzione")}</dt>
              <dd>{tf(p.funzione)}</dd>
              <dt className="text-text-muted">{t("perche.modello")}</dt>
              <dd className="font-mono break-all">{p.modelloRichiesto}</dd>
              {p.modelloServito && p.modelloServito !== p.modelloRichiesto ? (
                <>
                  <dt className="text-text-muted">{t("perche.modelloServito")}</dt>
                  <dd className="font-mono break-all">{p.modelloServito}</dd>
                </>
              ) : null}
              {p.contestoAiVersione !== null ? (
                <>
                  <dt className="text-text-muted">{t("perche.contesto")}</dt>
                  <dd>{t("perche.versione", { numero: p.contestoAiVersione })}</dd>
                </>
              ) : null}
              <dt className="text-text-muted">{t("perche.completata")}</dt>
              <dd>
                <Istante iso={p.completataIl} stile="data_ora" />
              </dd>
            </dl>
          ))}
        </Espandibile>
      ) : null}
      {eccezioni[0] ? (
        <div id="funzioni-ai" className="scroll-mt-6">
          <Espandibile
            titolo={
              <>
                {t("analisi.titolo")}
                <DistintivoStatoFunzione stato={eccezioni[0].stato} />
              </>
            }
            aperto={problemi}
            classeContenuto="mt-2"
          >
            <ul className="space-y-2">
              {eccezioni.map((a) => {
                const motivo = motivoFunzione(a.stato, a.motivo);
                return (
                  <li key={a.funzione} className="text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>{tf(a.funzione)}</span>
                      <DistintivoStatoFunzione stato={a.stato} />
                    </div>
                    {motivo ? <p className="text-xs text-text-muted">{motivo}</p> : null}
                  </li>
                );
              })}
            </ul>
          </Espandibile>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Situazioni collegate, subito sotto l'intestazione: titolo (porta alla Situazione) e una riga con ruolo e
 * origine del Collegamento; un collegamento proposto dall'AI lo dice (senza ripetere l'origine) e porta alla
 * scheda di questa email nella Situazione, dove si conferma o rifiuta. Per le email ricevute indica dove si
 * risponde: da una Situazione con un collegamento confermato; "usa Gmail" solo se l'email non ha Situazioni
 * (una proposta porta già a una Situazione che offre la bozza); le News non hanno risposte da suggerire.
 */
export function SituazioniEmail({ email }: { email: VistaEmailDto }) {
  const t = useTranslations("posta.situazioni");
  const te = useTranslations("posta.email");
  const tc = useTranslations("comuni");
  const ricevuta = email.direzione === "entrata";
  // Solo un collegamento confermato (o l'email d'origine): una proposta dell'AI va prima confermata.
  const perRispondere = email.situazioni.find((s) => s.stato !== "proposto" && s.stato !== "rifiutato");
  const senzaSituazioni = email.situazioni.every((s) => s.stato === "rifiutato");
  const viaGmail =
    ricevuta && senzaSituazioni && email.classificazione?.categoria !== "news" ? <p className="text-sm text-text-muted">{te("rispondiGmail")}</p> : null;

  if (email.situazioni.length === 0) return viaGmail;

  return (
    <section
      aria-labelledby="situazioni-titolo"
      className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 rounded-[var(--radius-card)] border border-border bg-surface-muted px-4 py-3"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <Layers className="mt-1 size-4 shrink-0 text-text-muted" aria-hidden />
        <h2 id="situazioni-titolo" className="sr-only">
          {t("titolo", { numero: email.situazioni.length })}
        </h2>
        <ul className="min-w-0 space-y-2">
          {email.situazioni.map((s) => {
            const proposto = s.stato === "proposto";
            const ruolo = s.origineDellaSituazione ? t("origine") : s.ruolo ? tc(`ruoliCollegamento.${s.ruolo}`) : null;
            // L'origine non aggiunge nulla all'email d'origine né a una proposta, che lo dice già.
            const origine = s.origine && !s.origineDellaSituazione && !proposto ? tc(`originiCollegamento.${s.origine}`) : null;
            const meta = [ruolo, origine].filter(Boolean).join(" · ");
            return (
              <li key={s.collegamentoId ?? s.situazioneId}>
                <Link
                  href={`/situations/${s.situazioneId}${proposto ? `#email-${email.id}` : ""}`}
                  className="group inline-flex items-start gap-1.5 font-medium text-text hover:text-accent-strong"
                >
                  <TestoSemplice come="span" testo={s.titolo} className="underline-offset-4 group-hover:underline" />
                  <ArrowRight className="mt-1 size-3.5 shrink-0" aria-hidden />
                </Link>
                {meta || proposto || s.stato === "rifiutato" ? (
                  <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-text-muted">
                    {meta}
                    {proposto ? (
                      <>
                        {meta ? <span aria-hidden>·</span> : null}
                        <DistintivoProposta discreto />
                      </>
                    ) : null}
                    {s.stato === "rifiutato" ? (
                      <span className="text-danger">
                        {meta ? "· " : null}
                        {tc("statiCollegamento.rifiutato")}
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
      {ricevuta && perRispondere ? (
        <Link
          href={`/situations/${perRispondere.situazioneId}`}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-text-muted underline-offset-4 hover:text-text hover:underline"
        >
          <Reply className="size-4 shrink-0" aria-hidden />
          {te("rispondiSituazione")}
        </Link>
      ) : (
        viaGmail
      )}
    </section>
  );
}
