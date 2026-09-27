import Link from "next/link";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import type { DettaglioBozzaDto } from "@ec/applicazione";
import { decidiEsitoAzione, rigeneraBozzaAzione } from "@/app/(app)/drafts/azioni";
import { testoCodice } from "@/components/comuni/codici";
import { LinkEmail } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { ModuloAzione } from "@/components/comuni/modulo-azione";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { Avviso } from "@/components/ui/avviso";
import { classiPulsante } from "@/components/ui/pulsante";
import { Scheda } from "@/components/ui/scheda";
import { AggiornamentoBozza } from "./aggiornamento-bozza";
import { testoErroreInvio } from "./parti";

/** Email a cui si risponde (o richiesta sollecitata), con l'accesso all'originale. */
export function EmailOrigine({ bozza }: { bozza: DettaglioBozzaDto }) {
  const t = useTranslations("bozze.pagina");
  const e = bozza.emailRisposta;
  if (!e) return null;
  return (
    <Scheda className="space-y-2 px-5 py-4">
      <p className="text-xs font-medium tracking-wide text-text-muted uppercase">{t(`origine.${bozza.tipo}`)}</p>
      <TestoSemplice come="p" testo={e.oggetto} lingua={e.lingua} className="font-medium" />
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-muted">
        <span>{t("da")}</span>
        <span dir="auto">{e.mittente.nome ?? e.mittente.indirizzo}</span>
        {e.mittente.nome ? <span className="font-mono text-xs">{e.mittente.indirizzo}</span> : null}
        <span aria-hidden>·</span>
        <Istante iso={e.ricevutaIl} stile="data_ora" />
      </p>
      {bozza.attesa ? (
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="text-text-muted">{t("attesa")}</span>
          <TestoSemplice come="span" testo={bozza.attesa.oggetto} lingua={bozza.lingua} />
        </p>
      ) : null}
      <LinkEmail emailId={e.id} className="inline-block text-sm text-accent-strong underline-offset-4 hover:underline" />
    </Scheda>
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
            <p>{t("fallitaTesto")}</p>
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
        <div role="status" aria-live="polite" className="space-y-3">
          <p className="font-medium">{t("titolo")}</p>
          <p className="text-sm text-text-muted">{t("spiegazione")}</p>
          {g.stato === "in_ritardo" ? (
            <p className="pt-2 text-sm">
              <span className="font-medium">{t("inRitardo")}</span> <span className="text-text-muted">{t("inRitardoTesto")}</span>
            </p>
          ) : null}
        </div>
        <p className="text-xs text-text-muted">
          {t("richiesta")} <Istante iso={g.richiestaIl} stile="relativo" />
        </p>
        {g.stato === "in_ritardo" ? <div className="flex justify-center">{rigenera}</div> : null}
      </div>
      <AggiornamentoBozza intervalloMs={g.stato === "in_ritardo" ? 10_000 : 3000} />
    </Scheda>
  );
}

/**
 * Stato dell'ultimo invio: in corso (con aggiornamento ravvicinato), inviato, fallito (bozza di nuovo
 * modificabile), esito incerto (prima la verifica automatica, poi la decisione dell'utente) o annullato.
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
              {t("confermatoIl")} <Istante iso={invio.confermatoIl} stile="data_ora" /> · <span className="font-mono">{bozza.casella.indirizzo}</span>
            </p>
          ) : null}
        </Avviso>
        <AggiornamentoBozza intervalloMs={3000} />
      </>
    );
  }

  if (invio.stato === "inviato") {
    return (
      <Avviso tono="successo" titolo={t("inviato")}>
        {t("inviatoIl")} <Istante iso={invio.inviatoIl ?? invio.aggiornatoIl} stile="data_ora" /> · <span className="font-mono">{bozza.casella.indirizzo}</span>
      </Avviso>
    );
  }

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
