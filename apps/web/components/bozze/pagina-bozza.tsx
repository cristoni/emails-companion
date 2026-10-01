import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, BellRing, CheckCircle2, Clock, Loader2, Reply, Sparkles } from "lucide-react";
import type { DettaglioBozzaDto, EmailDellaBozzaDto } from "@ec/applicazione";
import { decidiEsitoAzione, rigeneraBozzaAzione } from "@/app/(app)/drafts/azioni";
import { testoCodice } from "@/components/comuni/codici";
import { LinkEmail } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { ModuloAzione } from "@/components/comuni/modulo-azione";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { Avviso } from "@/components/ui/avviso";
import { CLASSE_LINK_AZIONE } from "@/components/ui/collegamento";
import { Espandibile } from "@/components/ui/espandibile";
import { classiPulsante } from "@/components/ui/pulsante";
import { Scheda } from "@/components/ui/scheda";
import { AggiornamentoBozza } from "./aggiornamento-bozza";
import { testoErroreInvio } from "./parti";

/** Link di ritorno in cima alle pagine delle bozze. */
export function LinkIndietro({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="-ml-1 inline-flex h-9 items-center gap-1.5 rounded-lg px-1 text-sm text-text-muted underline-offset-4 hover:text-text hover:underline">
      <ArrowLeft className="size-4" aria-hidden />
      {children}
    </Link>
  );
}

/** Titolo della pagina con, accanto, l'origine del testo; sotto, i passi verso l'invio o lo stato. */
export function IntestazioneBozza({ titolo, accanto, children }: { titolo: React.ReactNode; accanto?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-2xl">{titolo}</h1>
        {accanto}
      </div>
      {children}
    </header>
  );
}

/**
 * Riga sotto il titolo di una bozza inviata: quando è partita, con l'icona del successo (non solo il colore).
 * "Inviata" lo dice già il titolo: a vista restano icona e data, la parola solo per i lettori di schermo.
 */
export function RigaInviata({ bozza }: { bozza: DettaglioBozzaDto }) {
  const t = useTranslations("bozze.invio");
  if (bozza.invio?.stato !== "inviato") return null;
  const invio = bozza.invio;
  return (
    <p className="flex items-center gap-1.5 text-sm text-text-muted">
      <CheckCircle2 className="size-4 shrink-0 text-accent-strong" aria-hidden />
      <span>
        <span className="sr-only">{t("inviatoIl", { tipo: bozza.tipo })} </span>
        <Istante iso={invio.inviatoIl ?? invio.aggiornatoIl} stile="data_ora" />
      </span>
    </p>
  );
}

/**
 * Contesto della bozza in una sola scheda: l'email a cui si risponde (o la richiesta sollecitata) con
 * l'accesso all'originale e, sotto, che cosa ha letto l'AI per scrivere il testo. Le altre email lette
 * restano a richiesta, ciascuna con il suo link.
 */
export function ContestoBozza({ bozza }: { bozza: DettaglioBozzaDto }) {
  const t = useTranslations("bozze");
  const e = bozza.emailRisposta;
  const lette = bozza.emailContesto;
  const altre = lette.filter((x) => x.id !== e?.id);
  const conVersione = bozza.versione !== null;
  if (!e && (!conVersione || lette.length === 0)) return null;
  const Icona = bozza.tipo === "risposta" ? Reply : BellRing;

  const ai = !conVersione ? null : lette.length === 0 ? (
    <RigaAi>{t("contesto.nessuna")}</RigaAi>
  ) : altre.length === 0 ? (
    <RigaAi>{t("contesto.soloQuesta")}</RigaAi>
  ) : (
    <Espandibile
      titolo={
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="size-3.5" aria-hidden />
          {e && altre.length < lette.length ? t("contesto.altre", { numero: altre.length }) : t("contesto.lette", { numero: altre.length })}
        </span>
      }
      classeContenuto="mt-2"
    >
      <ul className="space-y-2 pl-5">
        {altre.map((x) => (
          <EmailLetta key={x.id} email={x} />
        ))}
      </ul>
    </Espandibile>
  );

  return (
    <Scheda className="px-5 py-4">
      {e ? (
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <Icona className="mt-1 size-4 shrink-0 text-text-muted" aria-hidden />
            <div className="min-w-0 space-y-0.5">
              <p className="font-medium">
                <span className="sr-only">{t(`pagina.origine.${bozza.tipo}`)}: </span>
                <TestoSemplice come="span" testo={e.oggetto} lingua={e.lingua} className="line-clamp-2" />
              </p>
              <p className="text-sm text-text-muted">
                <span dir="auto" title={e.mittente.indirizzo}>
                  {e.mittente.nome ?? e.mittente.indirizzo}
                </span>
                {" · "}
                <Istante iso={e.ricevutaIl} stile="data_ora" />
              </p>
              {bozza.attesa ? (
                <p className="flex items-center gap-1.5 text-sm">
                  <Clock className="size-3.5 shrink-0 text-text-muted" aria-hidden />
                  <span className="sr-only">{t("pagina.attesa")}: </span>
                  <TestoSemplice come="span" testo={bozza.attesa.oggetto} lingua={bozza.lingua} />
                </p>
              ) : null}
            </div>
          </div>
          <LinkEmail emailId={e.id} className={`${CLASSE_LINK_AZIONE} min-h-9 pl-7 text-sm sm:min-h-0 sm:pl-0`} />
        </div>
      ) : null}
      {ai ? <div className={e ? "mt-3 border-t border-border pt-3 text-sm" : "text-sm"}>{ai}</div> : null}
    </Scheda>
  );
}

function RigaAi({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-text-muted">
      <Sparkles className="size-3.5 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

function EmailLetta({ email: e }: { email: EmailDellaBozzaDto }) {
  return (
    <li className="min-w-0">
      <LinkEmail emailId={e.id}>
        <TestoSemplice come="span" testo={e.oggetto} lingua={e.lingua} />
      </LinkEmail>
      <p className="text-xs text-text-muted">
        <span dir="auto" title={e.mittente.indirizzo}>
          {e.mittente.nome ?? e.mittente.indirizzo}
        </span>
        {" · "}
        <Istante iso={e.ricevutaIl} stile="data_ora" />
      </p>
    </li>
  );
}

/**
 * Finché la prima versione non esiste: "in scrittura" con aggiornamento ravvicinato, oppure il motivo per
 * cui non arriva (in ritardo, analisi in pausa, errore del modello) con "Rigenera".
 */
export function BloccoGenerazione({ bozza }: { bozza: DettaglioBozzaDto }) {
  const t = useTranslations("bozze.generazione");
  const tp = useTranslations("bozze.pagina");
  const tc = useTranslations("comuni");
  const g = bozza.generazione;
  if (!g) return null;
  const rigenera = (
    <ModuloAzione
      azione={rigeneraBozzaAzione}
      campi={{ bozza: bozza.id }}
      etichetta={t("rigenera")}
      variante="primario"
      messaggi={{ ok: t("esiti.ok"), non_modificabile: t("esiti.non_modificabile") }}
      mostraOk
    />
  );

  // In pausa o fallita la pagina si aggiorna più di rado: dopo "Rigenera" mostra la nuova generazione
  // appena il worker la prende in carico, senza attendere l'aggiornamento generale di 60 secondi.
  if (g.stato === "in_pausa") {
    return (
      <>
        <Avviso tono="attenzione" titolo={t("inPausa")}>
          <div className="space-y-3">
            <p>{testoCodice(tc, "motiviPausa", g.motivoPausa)}</p>
            <p>{t("inPausaTesto")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/settings" className={classiPulsante("secondario", "sm")}>
                {tp("impostazioni")}
              </Link>
              {rigenera}
            </div>
          </div>
        </Avviso>
        <AggiornamentoBozza intervalloMs={15_000} />
      </>
    );
  }

  if (g.stato === "fallita") {
    return (
      <>
        <Avviso tono="errore" titolo={t("fallita")}>
          <div className="space-y-3">
            <p>{testoCodice(tc, "errori", g.errore)}</p>
            {rigenera}
          </div>
        </Avviso>
        <AggiornamentoBozza intervalloMs={10_000} />
      </>
    );
  }

  return (
    <Scheda className="relative overflow-hidden px-6 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-[radial-gradient(ellipse_at_center,var(--color-accent-soft),transparent_70%)]" />
      <div className="relative mx-auto max-w-md space-y-3 text-center">
        <Loader2 className="mx-auto size-6 text-accent-strong motion-safe:animate-spin" aria-hidden />
        {/* Regione annunciata: solo testi stabili, non l'istante relativo che cambia a ogni aggiornamento. */}
        <div role="status" aria-live="polite" className="space-y-1">
          <p className="font-medium">{t("titolo")}</p>
          <p className="text-sm text-text-muted">{g.stato === "in_ritardo" ? t("inRitardo") : t("spiegazione")}</p>
        </div>
        <p className="text-xs text-text-muted">
          {t("richiesta")} <Istante iso={g.richiestaIl} stile="relativo" />
        </p>
        {g.stato === "in_ritardo" ? <div className="flex justify-center pt-1">{rigenera}</div> : null}
      </div>
      <AggiornamentoBozza intervalloMs={g.stato === "in_ritardo" ? 10_000 : 3000} />
    </Scheda>
  );
}

/**
 * Stato dell'ultimo invio quando chiede attenzione: in corso (con aggiornamento ravvicinato), fallito (bozza
 * di nuovo modificabile), esito incerto (prima la verifica automatica, poi la decisione dell'utente) o
 * annullato. Un invio riuscito è detto dal titolo e da `RigaInviata`.
 */
export function StatoInvio({ bozza }: { bozza: DettaglioBozzaDto }) {
  const t = useTranslations("bozze.invio");
  const tb = useTranslations("bozze");
  const tc = useTranslations("comuni");
  const invio = bozza.invio;

  if (!invio || invio.stato === "confermato" || invio.stato === "in_invio") {
    if (!invio && bozza.stato !== "in_invio") return null;
    return (
      <>
        <Avviso tono="info" titolo={t("inCorso")}>
          <p>{t("inCorsoTesto")}</p>
          {invio ? (
            <p className="mt-1 text-xs">
              {t("confermatoIl")} <Istante iso={invio.confermatoIl} stile="data_ora" /> · {bozza.casella.indirizzo}
            </p>
          ) : null}
        </Avviso>
        <AggiornamentoBozza intervalloMs={3000} />
      </>
    );
  }

  if (invio.stato === "inviato") return null;

  if (invio.stato === "fallito") {
    // Dopo un nuovo invio riuscito l'ultimo invio non è più questo: qui la bozza è di nuovo modificabile.
    return (
      <Avviso tono="errore" titolo={t("fallito")}>
        <p>{testoErroreInvio(tb, tc, invio.errore)}</p>
        <p className="mt-1">{t("fallitoTesto")}</p>
      </Avviso>
    );
  }

  if (invio.stato === "esito_incerto") {
    if (!bozza.puoDecidere) {
      return (
        <>
          <Avviso tono="attenzione" titolo={t("verifica")}>
            {t.rich("verificaTesto", { ora: () => <Istante iso={bozza.decisioneDal} stile="data_ora" className="font-medium text-text" /> })}
          </Avviso>
          <AggiornamentoBozza intervalloMs={15_000} />
        </>
      );
    }
    const campi = { invio: invio.id, bozza: bozza.id };
    const messaggi = {
      annullato: t("esitiDecisione.annullato"),
      non_trovato: t("esitiDecisione.non_trovato"),
      non_incerto: t("esitiDecisione.non_incerto"),
      in_verifica: t("esitiDecisione.in_verifica"),
      errore: t("esitiDecisione.errore"),
    };
    return (
      <Avviso tono="attenzione" titolo={t("incerto")}>
        <div className="space-y-3">
          <p>{t("incertoTesto")}</p>
          <div className="flex flex-col items-start gap-2">
            <ModuloAzione
              azione={decidiEsitoAzione}
              campi={{ ...campi, decisione: "non_inviato" }}
              etichetta={t("nonInviato")}
              conferma={{ domanda: t("nonInviatoDomanda"), etichetta: t("nonInviatoConferma") }}
              messaggi={messaggi}
            />
            <ModuloAzione
              azione={decidiEsitoAzione}
              campi={{ ...campi, decisione: "reinvia" }}
              etichetta={t("reinvia")}
              conferma={{ domanda: t("reinviaDomanda"), etichetta: t("reinviaConferma") }}
              messaggi={messaggi}
            />
          </div>
        </div>
      </Avviso>
    );
  }

  // Annullato dall'utente dopo un esito incerto: la bozza è di nuovo modificabile.
  const motivo = invio.errore === "utente_reinvia" || invio.errore === "utente_non_inviato" ? invio.errore : null;
  return motivo ? <Avviso tono="info" titolo={t(`annullato.${motivo}`)} /> : null;
}
