import { Logger, runOnce, type TaskList } from "graphile-worker";
import type pg from "pg";
import {
  accettaInformativa,
  aggiornaOra,
  confermaImportazione,
  gestoriJob,
  registraConsensoGoogle,
  salvaChiaveOpenRouter,
  SCOPE_INVIO,
  SCOPE_LETTURA,
  statoOnboarding,
  vistaHome,
  type Dipendenze,
} from "@ec/applicazione";
import { componi } from "@ec/composizione";
import { NOMI_JOB } from "@ec/core/porte";
import { caselle, codaGraphile, type ContestoUtente } from "@ec/db";
import { CasellaFinta } from "@ec/testing";
import { creaAuthDiProva, scriviSessioneDemo, trovaOCreaUtenteDemo } from "./auth-di-prova";
import { configurazioneFinta, ErroreDemo, sintesiErrore } from "./guardia";
import { EMAIL_DEMO } from "./percorsi";

export interface EsitoPreparazione {
  utenteNuovo: boolean;
  importazioneEseguita: boolean;
  aree: Record<string, number>;
  news: number;
  vociRiepilogo: number;
  avvisi: number;
  sessione: { scadenza: Date; nomeCookie: string };
}

const ID_RICHIESTA_DEMO = "demo-offsite";

/**
 * La posta sintetica di `@ec/testing` non contiene richieste inviate ancora senza risposta: la demo ne
 * aggiunge una, così la home mostra anche l'area In attesa. Web e worker ricostruiscono ciascuno la
 * propria casella simulata con la sola posta standard (m1…m6, cronologia fino a 1005): perché i loro
 * messaggi successivi (per esempio un invio confermato) non collidano con questo, la richiesta ha un id
 * fuori dalla sequenza `m<n>` e il cursore salvato è letto prima di aggiungerla. L'Importazione iniziale
 * la trova comunque, perché elenca la casella per data.
 */
function aggiungiRichiestaSenzaRisposta(casella: CasellaFinta): void {
  const id = casella.ricevi({
    da: EMAIL_DEMO,
    a: ["luca@agenzia.example"],
    oggetto: "Team offsite venue",
    testo: "Hi Luca,\nCould you confirm the venue for the team offsite by next Thursday?\nThanks",
    il: new Date(Date.now() - 50 * 60 * 60 * 1000),
    thread: "t-offsite",
    messageId: "offsite-1@esempio.example",
  });
  const messaggio = casella.messaggi.get(id);
  if (!messaggio) throw new ErroreDemo("richiesta_demo_non_aggiunta");
  casella.messaggi.delete(id);
  casella.messaggi.set(ID_RICHIESTA_DEMO, { ...messaggio, idConnettore: ID_RICHIESTA_DEMO });
}

const MASSIMO_GIRI = 100;
const LOGGER_SILENZIOSO = new Logger(() => () => {});

/**
 * Esegue i job accodati con graphile-worker (`runOnce`) nello stesso processo, con gli stessi gestori del
 * worker. I job sono nel database come in esercizio: quelli programmati nel futuro restano al worker.
 * - `runOnce` ripianifica un job fallito e termina comunque: gli errori sono raccolti a parte.
 * - `runOnce` termina alla prima ricerca vuota, ma la coda con nome di un job appena concluso resta
 *   bloccata finché il completamento (asincrono) non arriva al database: il job successivo della stessa
 *   casella non è ancora visibile. Si ripete quindi finché non restano job eseguibili adesso.
 */
function esecutoreCoda(dip: Dipendenze, pool: pg.Pool) {
  const gestori = gestoriJob(dip);
  const errori: string[] = [];
  const taskList: TaskList = Object.fromEntries(
    NOMI_JOB.map((nome) => [
      nome,
      async (payload: unknown) => {
        try {
          await (gestori[nome] as (p: unknown) => Promise<void>)(payload);
        } catch (errore) {
          errori.push(`${nome}: ${sintesiErrore(errore)}`);
          throw errore;
        }
      },
    ]),
  );
  return {
    errori,
    async esegui() {
      for (let giro = 0; giro < MASSIMO_GIRI; giro++) {
        await runOnce({ pgPool: pool, taskList, concurrency: 1, noHandleSignals: true, logger: LOGGER_SILENZIOSO });
        if (errori.length > 0) throw new ErroreDemo(`job_falliti: ${errori.join("; ")}`);
        const { rows } = await pool.query<{ n: number }>(
          "select count(*)::int as n from graphile_worker.jobs where run_at <= now() and attempts < max_attempts and locked_at is null",
        );
        if ((rows[0]?.n ?? 0) === 0) return;
      }
      throw new ErroreDemo("coda_non_si_svuota");
    },
  };
}

/**
 * Porta l'utente demo fino alla home piena, con gli stessi casi d'uso dell'app: informativa, chiave
 * finta, casella sintetica collegata con `registraConsensoGoogle`, stima e conferma dell'Importazione
 * iniziale, analisi e riconciliazione, Riepilogo News ("Aggiorna"). Ogni passo controlla lo stato, così
 * un'esecuzione interrotta riprende da dove era arrivata. Infine crea la sessione di Playwright.
 */
export async function preparaDatiDemo(env: Record<string, string | undefined>, log: (riga: string) => void): Promise<EsitoPreparazione> {
  const cfg = configurazioneFinta(env);
  const chiaveFinta = env.EC_DEMO_CHIAVE_OPENROUTER;
  if (!chiaveFinta) throw new ErroreDemo("chiave_finta_mancante");

  const composizione = await componi(cfg, { coda: (tx) => codaGraphile(tx), massimoConnessioni: 6 });
  try {
    const { dip, connessione } = composizione;
    const auth = creaAuthDiProva(env, connessione);
    const coda = esecutoreCoda(dip, connessione.pool);
    const utente = await trovaOCreaUtenteDemo(auth);
    const perUtente = <T>(lavoro: (ctx: ContestoUtente) => Promise<T>) => dip.unita.perUtente(utente.id, lavoro);
    log(utente.nuovo ? `utente demo creato: ${EMAIL_DEMO}` : `utente demo esistente: ${EMAIL_DEMO}`);

    const onboarding = await perUtente((ctx) => statoOnboarding(dip, ctx));
    if (!onboarding.consenso) await perUtente((ctx) => accettaInformativa(dip, ctx));
    if (onboarding.chiave !== "valida") {
      const esito = await perUtente((ctx) => salvaChiaveOpenRouter(dip, ctx, chiaveFinta));
      if (esito !== "valida") throw new ErroreDemo(`chiave_finta_${esito}`);
    }

    const primaCasella = () => perUtente(async (ctx) => (await caselle.elenca(ctx))[0] ?? null);
    if (!(await primaCasella())) {
      // Stesso punto d'ingresso dell'accesso con Google; il cursore iniziale popola la casella sintetica.
      const esito = await registraConsensoGoogle(
        dip,
        dip.unita,
        utente.id,
        {
          sub: "demo-account-sintetico",
          email: EMAIL_DEMO,
          scopeConcessi: ["openid", "email", "profile", SCOPE_LETTURA, SCOPE_INVIO],
          accessToken: "token-di-accesso-finto",
          scadenzaAccesso: new Date(Date.now() + 60 * 60 * 1000),
          refreshToken: "refresh-token-finto",
          origine: "accesso",
        },
        async (casellaId) => {
          const connettore = await dip.connettori.per(casellaId);
          const cursore = await connettore.cursoreAttuale();
          if (connettore instanceof CasellaFinta) aggiungiRichiestaSenzaRisposta(connettore);
          return cursore;
        },
      );
      if (esito.tipo !== "collegata") throw new ErroreDemo(`casella_${esito.tipo}`);
      log("casella sintetica collegata");
    }
    await coda.esegui();

    let casella = await primaCasella();
    if (!casella) throw new ErroreDemo("casella_non_trovata");
    let importazioneEseguita = false;
    if (casella.faseImportazione === "stimata") {
      if (!(await perUtente((ctx) => confermaImportazione(dip, ctx, casella!.id)))) throw new ErroreDemo("conferma_importazione_rifiutata");
      log("Importazione iniziale confermata: eseguo importazione, analisi e riconciliazione");
      await coda.esegui();
      importazioneEseguita = true;
      casella = await primaCasella();
    }
    if (casella?.faseImportazione !== "completata") throw new ErroreDemo(`importazione_${casella?.faseImportazione ?? "assente"}`);

    let home = await perUtente((ctx) => vistaHome(dip, ctx));
    if (home.news.membri.length > 0 && home.news.voci.length === 0) {
      // Dopo l'importazione il riepilogo è programmato tra 10 minuti: "Aggiorna" lo genera subito.
      await perUtente((ctx) => aggiornaOra(dip, ctx));
      await coda.esegui();
      home = await perUtente((ctx) => vistaHome(dip, ctx));
    }
    const aree = Object.fromEntries(Object.entries(home.aree).map(([area, carte]) => [area, carte.length]));
    if (Object.values(aree).every((n) => n === 0)) throw new ErroreDemo("home_vuota");

    const sessione = await scriviSessioneDemo(auth, utente.id);
    return {
      utenteNuovo: utente.nuovo,
      importazioneEseguita,
      aree,
      news: home.news.membri.length,
      vociRiepilogo: home.news.voci.length,
      avvisi: home.avvisi.length,
      sessione,
    };
  } finally {
    await composizione.chiudi();
  }
}
