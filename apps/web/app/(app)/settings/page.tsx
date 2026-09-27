import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DIRETTIVE_PREDEFINITE } from "@ec/ai";
import { pauseEffettiveImpostazioni, stimeImportazioneImpostazioni, vistaImpostazioni } from "@ec/applicazione";
import { LINGUE } from "@/i18n/lingue";
import { fusoValido } from "@/lib/server/preferenze";
import { comeUtente } from "@/lib/server/sessione";
import { testoCodice } from "@/components/comuni/codici";
import { nomeFunzione, SEZIONE_MOTIVO_PAUSA } from "@/components/stato/testi";
import { IndiceImpostazioni, SezioneAccount, SezionePrivacy, SezioneRianalisi } from "@/components/impostazioni/altre-sezioni";
import { temaDa } from "@/components/impostazioni/formato";
import { SezioneCaselle } from "@/components/impostazioni/sezione-caselle";
import { SezioneChiave } from "@/components/impostazioni/sezione-chiave";
import { SezioneConsumo } from "@/components/impostazioni/sezione-consumo";
import { SezioneContesto } from "@/components/impostazioni/sezione-contesto";
import { SezioneModelli } from "@/components/impostazioni/sezione-modelli";
import { SezionePreferenze } from "@/components/impostazioni/sezione-preferenze";
import { Avviso } from "@/components/ui/avviso";
import { IntestazionePagina } from "@/components/ui/pagina";

/**
 * Esiti che le route OAuth delle caselle (`/api/caselle/google/*`) mettono in `?esito=`, con il tono
 * dell'avviso. Solo questi codici vengono mostrati: un valore diverso nell'URL è ignorato.
 */
const TONO_ESITO: Record<string, "successo" | "attenzione" | "info" | "errore"> = {
  casella_collegata: "successo",
  permessi_incompleti: "attenzione",
  da_ricollegare: "attenzione",
  consenso_negato: "info",
  casella_non_trovata: "errore",
  richiesta_non_valida: "errore",
  account_di_altro_utente: "errore",
  account_diverso_da_quello_atteso: "errore",
  errore_google: "errore",
};

/** Funzioni toccate dalla rianalisi: se una di queste è in pausa, la rianalisi aspetta la ripresa. */
const FUNZIONI_RIANALISI = new Set(["*", "classificazione_priorita", "estrazione_attivita"]);

/** Fusi IANA dal runtime del server (stesso elenco per server e client), con UTC e il fuso salvato. */
function elencoFusi(corrente: string): string[] {
  let fusi: string[] = [];
  try {
    fusi = Intl.supportedValuesOf("timeZone");
  } catch {
    fusi = [];
  }
  return [...new Set([...fusi, "UTC", corrente])].sort((a, b) => a.localeCompare(b, "en"));
}

/**
 * `/settings`: caselle, chiave OpenRouter, modello per Funzione AI, Contesto AI, preferenze e pausa,
 * consumo, rianalisi, privacy ed eliminazione dell'account. Non chiama `richiediOnboardingEssenziale`:
 * serve proprio a sistemare chiave e caselle.
 */
export default async function PaginaImpostazioni({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await getTranslations("impostazioni");
  const tc = await getTranslations("comuni");
  const tr = await getTranslations();
  const parametri = await searchParams;
  const { vista, stime, pause } = await comeUtente(async (ctx, dip) => ({
    vista: await vistaImpostazioni(dip, ctx),
    stime: await stimeImportazioneImpostazioni(ctx),
    pause: await pauseEffettiveImpostazioni(dip, ctx),
  }));

  const esito = typeof parametri.esito === "string" && Object.hasOwn(TONO_ESITO, parametri.esito) ? parametri.esito : null;
  const fuso = fusoValido(vista.preferenze.fusoOrario);
  const lingue = LINGUE.map((codice) => ({ codice, nome: t(`preferenze.lingue.${codice}`) }));
  const lingua = (LINGUE as readonly string[]).includes(vista.preferenze.lingua) ? vista.preferenze.lingua : LINGUE[0];
  const importazionePossibile = vista.consenso.accettato && vista.chiave?.stato === "valida";

  return (
    <div className="space-y-6">
      <IntestazionePagina titolo={t("titolo")} descrizione={t("descrizione")} />

      {esito ? (
        <Avviso
          tono={TONO_ESITO[esito] ?? "errore"}
          titolo={t(`esitiCollegamento.${esito}.titolo`)}
          azione={
            <Link href="/settings#mailboxes" className="text-xs text-text-muted underline-offset-4 hover:text-text hover:underline">
              {tc("azioni.chiudi")}
            </Link>
          }
        >
          {t(`esitiCollegamento.${esito}.testo`)}
        </Avviso>
      ) : null}

      {pause.length > 0 ? (
        <Avviso tono="attenzione" titolo={t("pauseAttive.titolo")}>
          <ul className="mt-1 space-y-1">
            {pause.map((p) => (
              <li key={`${p.funzione}-${p.motivo}`}>
                <span className="text-text">{testoCodice(tc, "motiviPausa", p.motivo, "errori.sconosciuto")}</span>
                {p.funzione === "*" ? null : <> · {nomeFunzione(tr, p.funzione)}</>}
                {" · "}
                <a href={`#${SEZIONE_MOTIVO_PAUSA[p.motivo] ?? "preferences"}`} className="text-accent-strong underline-offset-4 hover:underline">
                  {p.motivo === "pausa_manuale" ? t("pauseAttive.riprendi") : t("pauseAttive.risolvi")}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-2">{t("pauseAttive.testo")}</p>
        </Avviso>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_11rem]">
        <aside className="lg:order-2">
          <IndiceImpostazioni />
        </aside>
        <div className="min-w-0 space-y-8 lg:order-1">
          <SezioneCaselle caselle={vista.caselle} stime={stime} importazionePossibile={importazionePossibile} />
          <SezioneChiave chiave={vista.chiave} />
          <SezioneModelli modelli={vista.modelli} />
          <SezioneContesto contesto={vista.contestoAi} predefinite={DIRETTIVE_PREDEFINITE} />
          <SezionePreferenze
            lingua={lingua}
            lingue={lingue}
            tema={temaDa(vista.preferenze.tema)}
            fuso={fuso}
            fusi={elencoFusi(fuso)}
            pausaManuale={vista.preferenze.pausaManuale}
          />
          <SezioneConsumo consumo={vista.consumo} />
          <SezioneRianalisi pausaAttiva={pause.some((p) => FUNZIONI_RIANALISI.has(p.funzione))} />
          <SezionePrivacy consenso={vista.consenso} />
          <SezioneAccount />
        </div>
      </div>
    </div>
  );
}
