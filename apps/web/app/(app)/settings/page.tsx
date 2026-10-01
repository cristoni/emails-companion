import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DIRETTIVE_PREDEFINITE } from "@ec/ai";
import { pauseEffettiveImpostazioni, stimeImportazioneImpostazioni, vistaImpostazioni } from "@ec/applicazione";
import { LINGUE } from "@/i18n/lingue";
import { fusoValido } from "@/lib/server/preferenze";
import { comeUtente } from "@/lib/server/sessione";
import { testoCodice } from "@/components/comuni/codici";
import { nomeFunzione, SEZIONE_MOTIVO_PAUSA } from "@/components/stato/testi";
import { GruppoPrivacy, SezioneRianalisi } from "@/components/impostazioni/altre-sezioni";
import { temaDa } from "@/components/impostazioni/formato";
import { IndiceImpostazioni } from "@/components/impostazioni/indice";
import { Gruppo } from "@/components/impostazioni/sezione";
import { SezioneCaselle } from "@/components/impostazioni/sezione-caselle";
import { SezioneChiave } from "@/components/impostazioni/sezione-chiave";
import { SezioneContesto } from "@/components/impostazioni/sezione-contesto";
import { SezioneModelli } from "@/components/impostazioni/sezione-modelli";
import { GruppoPreferenze, SezionePausa } from "@/components/impostazioni/sezione-preferenze";
import { Avviso } from "@/components/ui/avviso";
import { CLASSE_LINK } from "@/components/ui/collegamento";
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("impostazioni");
  return { title: t("titolo") };
}

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
 * `/settings`, in quattro gruppi: Collegamenti (caselle, chiave OpenRouter con il consumo), AI (pausa,
 * Contesto AI, modello per Funzione AI, rianalisi), Preferenze (lingua, tema, fuso) e Privacy e account.
 * Ogni sezione mantiene la sua ancora (`#mailboxes`, `#openrouter`, `#usage`, `#pause`, `#ai-context`,
 * `#models`, `#reanalyse`, `#preferences`, `#privacy`, `#account`). Non chiama `richiediOnboardingEssenziale`:
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
  // La pausa decisa dall'utente ha già stato e "Riprendi" nella sezione `#pause`: l'avviso elenca solo le altre cause.
  const pauseDaRisolvere = pause.filter((p) => p.motivo !== "pausa_manuale");

  return (
    <div className="space-y-6">
      <IntestazionePagina titolo={t("titolo")} />

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

      {pauseDaRisolvere.length > 0 ? (
        <Avviso tono="attenzione" titolo={t("pauseAttive.titolo")}>
          <ul className="mt-1 space-y-1">
            {pauseDaRisolvere.map((p) => (
              <li key={`${p.funzione}-${p.motivo}`}>
                <span className="text-text">{testoCodice(tc, "motiviPausa", p.motivo, "errori.sconosciuto")}</span>
                {p.funzione === "*" ? null : <> · {nomeFunzione(tr, p.funzione)}</>}
                {" · "}
                <a href={`#${SEZIONE_MOTIVO_PAUSA[p.motivo] ?? "pause"}`} className={CLASSE_LINK}>
                  {t("pauseAttive.risolvi")}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-2">{t("pauseAttive.testo")}</p>
        </Avviso>
      ) : null}

      {/* L'indice diventa una colonna solo da xl: tra 1024 e 1280 px toglierebbe troppo spazio alle sezioni. */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_11rem] xl:gap-10">
        <aside className="min-w-0 xl:order-2">
          <IndiceImpostazioni />
        </aside>
        <div className="min-w-0 space-y-8 xl:order-1">
          <Gruppo titolo={t("gruppi.collegamenti")}>
            <SezioneCaselle caselle={vista.caselle} stime={stime} importazionePossibile={importazionePossibile} />
            <SezioneChiave chiave={vista.chiave} consumo={vista.consumo} />
          </Gruppo>
          <Gruppo titolo={t("gruppi.ai")}>
            <SezionePausa pausaManuale={vista.preferenze.pausaManuale} />
            <SezioneContesto contesto={vista.contestoAi} predefinite={DIRETTIVE_PREDEFINITE} />
            <SezioneModelli modelli={vista.modelli} />
            <SezioneRianalisi pausaAttiva={pause.some((p) => FUNZIONI_RIANALISI.has(p.funzione))} />
          </Gruppo>
          <GruppoPreferenze lingua={lingua} lingue={lingue} tema={temaDa(vista.preferenze.tema)} fuso={fuso} fusi={elencoFusi(fuso)} />
          <GruppoPrivacy consenso={vista.consenso} />
        </div>
      </div>
    </div>
  );
}
