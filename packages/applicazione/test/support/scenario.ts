import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { CassaforteBusta } from "@ec/crypto";
import { authUtente } from "@ec/db/schema";
import { caselle, connetti, depositoChiaviDb, UnitaDiLavoro, type ContestoUtente } from "@ec/db";
import {
  CodaInMemoria,
  FabbricaConnettoriFinta,
  GatewayModelliFinto,
  generatoreIdCasuale,
  OrologioFinto,
  type CasellaFinta,
} from "@ec/testing";
import { databaseDiTest } from "@ec/testing/postgres";
import {
  accettaInformativa,
  CONFIGURAZIONE_PREDEFINITA,
  gestoriJob,
  registraConsensoGoogle,
  salvaChiaveOpenRouter,
  SCOPE_INVIO,
  SCOPE_LETTURA,
  type Dipendenze,
} from "../../src";

export type Scenario = Awaited<ReturnType<typeof creaScenario>>;

/** Harness dei test di scenario: stessi casi d'uso e gestori del worker, con sistemi esterni finti. */
export async function creaScenario(inizio = "2026-09-21T08:00:00Z") {
  const url = await databaseDiTest();
  const conn = connetti({ connectionString: url, massimo: 6 });
  const orologio = new OrologioFinto(inizio);
  const coda = new CodaInMemoria(orologio);
  const cassaforte = new CassaforteBusta({
    chiaviPrincipali: { 1: randomBytes(32) },
    versioneAttiva: 1,
    chiaveIndiciGlobali: randomBytes(32),
    deposito: depositoChiaviDb(conn.db),
  });
  const unita = new UnitaDiLavoro({ db: conn.db, cassaforte, coda: coda.fabbrica });
  const connettori = new FabbricaConnettoriFinta();
  connettori.ora = () => orologio.ora();
  connettori.risolviIndirizzo = async (casellaId) => {
    const righe = await conn.db.execute(sql`select utente_id from casella where id = ${casellaId}::uuid`);
    const utenteId = (righe as unknown as { rows: { utente_id: string }[] }).rows[0]?.utente_id;
    if (!utenteId) return null;
    const c = await unita.perUtente(utenteId, (ctx) => caselle.leggi(ctx, casellaId));
    return c?.indirizzo ?? null;
  };
  const modelli = new GatewayModelliFinto();
  const dip: Dipendenze = {
    unita,
    connettori,
    modelli,
    orologio,
    ids: generatoreIdCasuale,
    lingua: { rileva: () => ({ lingua: "it", affidabile: true }) },
    configurazione: CONFIGURAZIONE_PREDEFINITA,
  };
  const gestori = gestoriJob(dip);

  const scenario = {
    dip,
    db: conn.db,
    orologio,
    coda,
    modelli,
    connettori,

    async creaUtente(email: string, opzioni: { chiave?: boolean; consenso?: boolean } = {}): Promise<string> {
      const id = crypto.randomUUID();
      await conn.db.insert(authUtente).values({ id, name: email.split("@")[0]!, email, emailVerified: true });
      if (opzioni.consenso !== false) await unita.perUtente(id, (ctx) => accettaInformativa(dip, ctx));
      if (opzioni.chiave !== false) await unita.perUtente(id, (ctx) => salvaChiaveOpenRouter(dip, ctx, "sk-or-v1-chiavefintaditest0123456789"));
      return id;
    },

    /** Collega una casella Gmail simulata con il consenso completo, come dopo l'accesso con Google. */
    async collegaGmail(utenteId: string, indirizzo: string, opzioni: { scope?: string[]; refresh?: boolean } = {}) {
      const casellaFinta = connettori.casella(indirizzo);
      const esito = await registraConsensoGoogle(
        dip,
        unita,
        utenteId,
        {
          sub: `sub-${indirizzo}`,
          email: indirizzo,
          scopeConcessi: opzioni.scope ?? ["openid", "email", "profile", SCOPE_LETTURA, SCOPE_INVIO],
          accessToken: "ya29.finto",
          scadenzaAccesso: new Date(orologio.ora().getTime() + 3600_000),
          refreshToken: opzioni.refresh === false ? null : "1//refresh-finto",
          origine: "accesso",
        },
        () => casellaFinta.cursoreAttuale(),
      );
      return { esito, casella: casellaFinta, casellaId: esito.tipo === "collegata" ? esito.casellaId : null };
    },

    casella(indirizzo: string): CasellaFinta {
      return connettori.casella(indirizzo);
    },

    /** Esegue i job dovuti finché la coda non ne ha più (senza far avanzare il tempo). */
    async eseguiJob(massimo = 1000): Promise<number> {
      let eseguiti = 0;
      for (; eseguiti < massimo; eseguiti++) {
        const job = coda.prossimo();
        if (!job) return eseguiti;
        await (gestori[job.nome] as (p: unknown) => Promise<void>)(job.payload);
      }
      throw new Error("troppi job: possibile ciclo");
    },

    /** Fa avanzare il tempo eseguendo anche i job programmati entro `ms`. */
    async avanza(ms: number): Promise<void> {
      const fine = orologio.ora().getTime() + ms;
      await scenario.eseguiJob();
      for (;;) {
        const prossima = coda.prossimaScadenza();
        if (!prossima || prossima.getTime() > fine) break;
        orologio.imposta(new Date(Math.max(prossima.getTime(), orologio.ora().getTime())));
        await scenario.eseguiJob();
      }
      orologio.imposta(new Date(fine));
      await scenario.eseguiJob();
    },

    perUtente<T>(utenteId: string, lavoro: (ctx: ContestoUtente) => Promise<T>): Promise<T> {
      return unita.perUtente(utenteId, lavoro);
    },

    async chiudi() {
      await conn.chiudi();
    },
  };
  return scenario;
}
