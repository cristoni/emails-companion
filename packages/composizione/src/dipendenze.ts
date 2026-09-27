import { GatewayOpenRouter } from "@ec/ai";
import { CONFIGURAZIONE_PREDEFINITA, type Dipendenze } from "@ec/applicazione";
import type { FabbricaConnettori, GatewayModelli, Orologio, RilevatoreLingua } from "@ec/core/porte";
import { CassaforteBusta } from "@ec/crypto";
import { caselle, connetti, depositoChiaviDb, UnitaDiLavoro, type Connessione, type FabbricaCoda } from "@ec/db";
import { RilevatoreLinguaEld } from "@ec/testo";
import type { ConfigurazioneAmbiente } from "./configurazione";
import { FabbricaConnettoriGmail } from "./connettori-gmail";

export interface Composizione {
  dip: Dipendenze;
  connessione: Connessione;
  chiudi(): Promise<void>;
}

export const orologioDiSistema: Orologio = { ora: () => new Date() };

export interface OpzioniComposizione {
  coda: FabbricaCoda;
  massimoConnessioni?: number;
  /** Sostituzioni per la modalità finta (connettore e modelli simulati). */
  connettori?: FabbricaConnettori;
  modelli?: GatewayModelli;
  lingua?: RilevatoreLingua;
}

/** Costruisce le dipendenze dei casi d'uso a partire dalla configurazione. */
export async function componi(cfg: ConfigurazioneAmbiente, opzioni: OpzioniComposizione): Promise<Composizione> {
  const connessione = connetti({
    connectionString: cfg.databaseUrl,
    ...(cfg.databaseCa ? { ca: cfg.databaseCa } : {}),
    massimo: opzioni.massimoConnessioni ?? 5,
  });
  // Le transazioni tengono la loro connessione mentre cifrano; se la chiave dati dell'utente non è in cache
  // va letta con un'altra connessione. Con un solo pool, transazioni concorrenti potrebbero occuparlo tutto
  // e attendere per sempre la lettura delle chiavi: il deposito ha quindi un pool proprio.
  const connessioneChiavi = connetti({
    connectionString: cfg.databaseUrl,
    ...(cfg.databaseCa ? { ca: cfg.databaseCa } : {}),
    massimo: 2,
  });
  const cassaforte = new CassaforteBusta({ ...cfg.chiavi, deposito: depositoChiaviDb(connessioneChiavi.db) });
  const unita = new UnitaDiLavoro({ db: connessione.db, cassaforte, coda: opzioni.coda });
  const orologio = orologioDiSistema;
  const finta = cfg.modalita === "finta" && !opzioni.connettori ? await modalitaFinta(unita, orologio) : null;
  const connettori =
    opzioni.connettori ??
    finta?.connettori ??
    (cfg.google
      ? new FabbricaConnettoriGmail({
          unita,
          oauth: { clientId: cfg.google.clientId, clientSecret: cfg.google.clientSecret, redirectUri: cfg.google.redirectUriCaselle },
          topicNotifiche: cfg.pubsub?.topic ?? null,
          orologio,
        })
      : null);
  if (!connettori) throw new Error("connettori_non_configurati");
  const modelli = opzioni.modelli ?? finta?.modelli ?? new GatewayOpenRouter({ fetch: globalThis.fetch, titoloApp: "Emails Companion", urlApp: cfg.urlApp });
  const lingua = opzioni.lingua ?? (finta ? { rileva: () => ({ lingua: "en", affidabile: true }) } : await RilevatoreLinguaEld.crea());
  const dip: Dipendenze = {
    unita,
    connettori,
    modelli,
    orologio,
    ids: { nuovo: () => crypto.randomUUID() },
    lingua,
    configurazione: { ...CONFIGURAZIONE_PREDEFINITA, notifichePushAttive: Boolean(cfg.pubsub) },
  };
  return {
    dip,
    connessione,
    chiudi: async () => {
      await connessione.chiudi();
      await connessioneChiavi.chiudi();
    },
  };
}

/**
 * Modalità finta (solo sviluppo locale e CI, mai in produzione: vedi leggiConfigurazione).
 * Le caselle sono simulate e popolate con posta sintetica al primo accesso; i modelli sono euristici.
 */
async function modalitaFinta(unita: UnitaDiLavoro, orologio: Orologio) {
  const { FabbricaConnettoriFinta, gatewayEuristico, popolaCasellaSintetica } = await import("@ec/testing");
  const connettori = new FabbricaConnettoriFinta();
  const popolate = new Set<string>();
  connettori.risolviIndirizzo = async (casellaId) => {
    const utenteId = await unita.sistema((ctx) => caselle.utenteDellaCasella(ctx.tx, casellaId));
    if (!utenteId) return null;
    const casella = await unita.perUtente(utenteId, (ctx) => caselle.leggi(ctx, casellaId));
    if (casella && !popolate.has(casella.indirizzo)) {
      popolate.add(casella.indirizzo);
      popolaCasellaSintetica(connettori.casella(casella.indirizzo), orologio.ora());
    }
    return casella?.indirizzo ?? null;
  };
  return { connettori, modelli: gatewayEuristico() };
}
