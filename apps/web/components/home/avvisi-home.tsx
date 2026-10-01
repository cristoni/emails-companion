import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import type { Avviso as AvvisoDto } from "@ec/applicazione";
import { testoCodice } from "@/components/comuni/codici";
import { ModuloAzione } from "@/components/comuni/modulo-azione";
import { Avviso } from "@/components/ui/avviso";
import { classiPulsante } from "@/components/ui/pulsante";
import { confermaImportazioneAzione, riprendiAnalisiAzione, rinviaImportazioneAzione } from "./azioni";

function chiave(a: AvvisoDto): string {
  switch (a.codice) {
    case "casella_da_ricollegare":
    case "permessi_incompleti":
    case "importazione_da_confermare":
      return `${a.codice}:${a.casellaId}`;
    case "analisi_in_pausa":
      return `${a.codice}:${a.funzione}:${a.motivo}`;
    default:
      return a.codice;
  }
}

/** Avvisi della home: ognuno dice cosa succede e porta all'azione che lo risolve. */
export function AvvisiHome({ avvisi }: { avvisi: readonly AvvisoDto[] }) {
  const t = useTranslations("home.avvisi");
  if (avvisi.length === 0) return null;
  return (
    <section aria-label={t("titolo")} className="space-y-2">
      {avvisi.map((a) => (
        <VoceAvviso key={chiave(a)} avviso={a} />
      ))}
    </section>
  );
}

function LinkAzione({ href, children, esterno = false }: { href: string; children: React.ReactNode; esterno?: boolean }) {
  // Le route API (flusso OAuth) non sono pagine: link normale, non navigazione del client.
  return esterno ? (
    <a href={href} className={classiPulsante("secondario", "sm")}>
      {children}
    </a>
  ) : (
    <Link href={href} className={classiPulsante("secondario", "sm")}>
      {children}
    </Link>
  );
}

function VoceAvviso({ avviso }: { avviso: AvvisoDto }) {
  const t = useTranslations("home.avvisi");
  const tc = useTranslations("comuni");
  const formato = useFormatter();

  switch (avviso.codice) {
    case "casella_da_ricollegare":
    case "permessi_incompleti":
      return (
        <Avviso
          tono="attenzione"
          titolo={t(`${avviso.codice}.titolo`, { indirizzo: avviso.indirizzo })}
          azione={
            <LinkAzione href={`/api/caselle/google/avvia?casella=${encodeURIComponent(avviso.casellaId)}`} esterno>
              {t(`${avviso.codice}.azione`)}
            </LinkAzione>
          }
        >
          {t(`${avviso.codice}.testo`)}
        </Avviso>
      );
    case "importazione_da_confermare": {
      // L'importazione parte solo dopo che l'utente ha visto numero di email e costo stimato (PROJECT §2.1):
      // senza stima si può solo rinviare.
      const stimaPronta = avviso.numeroEmail !== null && avviso.costoStimato !== null;
      const stima = stimaPronta
        ? t("importazione_da_confermare.stima", {
            numero: avviso.numeroEmail!,
            costo: formato.number(avviso.costoStimato!, { style: "currency", currency: "USD", maximumFractionDigits: 2 }),
          })
        : t("importazione_da_confermare.stimaAssente");
      const messaggi = { gia_decisa: t("importazione_da_confermare.giaDecisa") };
      return (
        <Avviso tono="info" titolo={t("importazione_da_confermare.titolo", { indirizzo: avviso.indirizzo })}>
          <p>{stima}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {stimaPronta ? (
              <ModuloAzione
                azione={confermaImportazioneAzione}
                campi={{ casella: avviso.casellaId }}
                etichetta={t("importazione_da_confermare.conferma")}
                variante="primario"
                messaggi={messaggi}
              />
            ) : null}
            <ModuloAzione
              azione={rinviaImportazioneAzione}
              campi={{ casella: avviso.casellaId }}
              etichetta={t("importazione_da_confermare.rinvia")}
              variante="fantasma"
              messaggi={messaggi}
            />
          </div>
        </Avviso>
      );
    }
    case "analisi_in_pausa": {
      const titolo =
        avviso.funzione === "*" || !tc.has(`funzioni.${avviso.funzione}`)
          ? t("analisi_in_pausa.titolo")
          : t("analisi_in_pausa.titoloFunzione", { funzione: tc(`funzioni.${avviso.funzione}`) });
      const manuale = avviso.motivo === "pausa_manuale";
      const destinazione =
        avviso.motivo === "chiave_mancante"
          ? "/settings#openrouter"
          : avviso.motivo === "modello_incompatibile" || avviso.motivo === "modello_non_disponibile"
            ? "/settings#models"
            : "/settings";
      return (
        <Avviso
          tono={manuale ? "info" : "attenzione"}
          titolo={titolo}
          azione={
            manuale ? (
              <ModuloAzione
                azione={riprendiAnalisiAzione}
                etichetta={t("analisi_in_pausa.riprendi")}
                variante="primario"
                mostraOk
                messaggi={{ ok: t("analisi_in_pausa.ripresa") }}
              />
            ) : (
              <LinkAzione href={destinazione}>{t("analisi_in_pausa.impostazioni")}</LinkAzione>
            )
          }
        >
          {/* Una riga sola: il motivo e l'azione che lo risolve; con la pausa manuale il motivo ripeterebbe il titolo. */}
          {manuale ? t("analisi_in_pausa.testo") : `${testoCodice(tc, "motiviPausa", avviso.motivo)}.`}
        </Avviso>
      );
    }
    case "chiave_non_valida":
    case "credito_esaurito":
      return (
        <Avviso
          tono="attenzione"
          titolo={t(`${avviso.codice}.titolo`)}
          azione={<LinkAzione href="/settings#openrouter">{t(`${avviso.codice}.azione`)}</LinkAzione>}
        >
          {t(`${avviso.codice}.testo`)}
        </Avviso>
      );
    case "consenso_mancante":
      return (
        <Avviso tono="attenzione" titolo={t("consenso_mancante.titolo")} azione={<LinkAzione href="/onboarding">{t("consenso_mancante.azione")}</LinkAzione>}>
          {t("consenso_mancante.testo")}
        </Avviso>
      );
  }
}
