import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { posta } from "@ec/db";
import { annullaCorrezioni, cambiaLingua, casellePosta, confermaRianalisi, elencoPosta, stimaRianalisi, vistaEmail, vistaRianalisiEmail } from "../src";
import { creaScenario, type Scenario } from "./support/scenario";

let s: Scenario;
beforeEach(async () => {
  s = await creaScenario();
});
afterEach(async () => {
  await s.chiudi();
});

const ORA = 60 * 60 * 1000;

function script() {
  s.modelli
    .quando("classificazione_priorita", () => ({
      output: {
        categoria: "operativa",
        urgente: false,
        base_urgenza: "dedotto",
        priorita: "media",
        motivazione: "Richiesta diretta con scadenza.",
        titolo_situazione: "Preventivo",
        descrizione_situazione: "Richiesta di un preventivo.",
        evidenze: [],
      },
    }))
    .quando("estrazione_attivita", () => ({ output: { elementi: [], titolo_situazione: null, descrizione_situazione: null } }))
    .quando("attese_risposte", () => ({
      output: { richieste: [], collegamenti: [], valutazioni: [], completamenti: [], titolo_situazione: null, descrizione_situazione: null },
    }));
}

/** Un utente con due caselle e un'email analizzata in ciascuna. */
async function prepara() {
  const utente = await s.creaUtente("anna@esempio.it");
  const prima = await s.collegaGmail(utente, "anna@esempio.it");
  const seconda = await s.collegaGmail(utente, "anna.lavoro@esempio.example");
  await s.eseguiJob();
  script();
  prima.casella.ricevi({
    da: "marco@esempio.example",
    a: ["anna@esempio.it"],
    oggetto: "Preventivo",
    testo: "Ciao Anna,\nmi mandi il preventivo entro venerdì?\nMarco",
    il: new Date(s.orologio.ora().getTime() - 2 * ORA),
  });
  seconda.casella.ricevi({
    da: "giulia@esempio.example",
    a: ["anna.lavoro@esempio.example"],
    oggetto: "Riunione",
    testo: "Confermi la riunione di giovedì?",
    il: new Date(s.orologio.ora().getTime() - ORA),
  });
  s.coda.aggiungi("pianifica_sincronizzazioni", {});
  await s.eseguiJob();
  const ids = await s.perUtente(utente, async (ctx) => {
    const elenco = await posta.elenco(ctx, { limite: 50 });
    return Object.fromEntries(elenco.map((e) => [e.oggetto, e.id])) as Record<string, string>;
  });
  return { utente, primaId: prima.casellaId!, secondaId: seconda.casellaId!, preventivo: ids["Preventivo"]!, riunione: ids["Riunione"]! };
}

describe("web posta: caselle per il filtro", () => {
  it("elenca solo le caselle dell'utente, con indirizzo e stato, e filtrano l'elenco", async () => {
    const { utente, primaId, secondaId, preventivo, riunione } = await prepara();
    const altro = await s.creaUtente("bruno@esempio.example");

    const caselle = await s.perUtente(utente, (ctx) => casellePosta(s.dip, ctx));
    const attese = [
      { id: primaId, indirizzo: "anna@esempio.it", stato: "collegata" },
      { id: secondaId, indirizzo: "anna.lavoro@esempio.example", stato: "collegata" },
    ].sort((a, b) => a.indirizzo.localeCompare(b.indirizzo));
    expect(caselle).toEqual(attese);
    expect(Object.keys(caselle[0]!).sort()).toEqual(["id", "indirizzo", "stato"]);
    expect(await s.perUtente(altro, (ctx) => casellePosta(s.dip, ctx))).toEqual([]);

    const soloPrima = await s.perUtente(utente, (ctx) => elencoPosta(s.dip, ctx, { casellaId: primaId, limite: 20 }));
    expect(soloPrima.email.map((e) => e.id)).toEqual([preventivo]);
    const soloSeconda = await s.perUtente(utente, (ctx) => elencoPosta(s.dip, ctx, { casellaId: secondaId, limite: 20 }));
    expect(soloSeconda.email.map((e) => e.id)).toEqual([riunione]);
  });
});

describe("web posta: rianalisi dopo la correzione della lingua", () => {
  it("mostra la stima della sola email, poi l'avanzamento dopo la conferma esplicita", async () => {
    const { utente, preventivo, riunione } = await prepara();
    const esito = await s.perUtente(utente, (ctx) => cambiaLingua(s.dip, ctx, preventivo, "pt-BR"));
    expect(esito.codice).toBe("ok");
    const email = await s.perUtente(utente, (ctx) => vistaEmail(s.dip, ctx, preventivo));
    expect(email?.lingua).toMatchObject({ valore: "pt-br", fonte: "utente", corretta: true });

    const chiamate = s.modelli.chiamate.length;
    const stima = await s.perUtente(utente, (ctx) => stimaRianalisi(s.dip, ctx, { tipo: "email", emailId: preventivo }));
    const vista = await s.perUtente(utente, (ctx) => vistaRianalisiEmail(s.dip, ctx, preventivo, stima.richiestaId));
    expect(vista).toEqual({
      richiestaId: stima.richiestaId,
      stato: "stimata",
      numeroEmail: 1,
      costoStimato: stima.costoStimato,
      creataIl: s.orologio.ora().toISOString(),
    });
    // La stima non chiama modelli e non avvia nulla.
    expect(s.modelli.chiamate.length).toBe(chiamate);
    expect(s.coda.pendenti.some((j) => j.nome === "rianalizza")).toBe(false);

    // Id maiuscoli: stessa richiesta. Un'altra email o un altro utente non la vedono.
    expect((await s.perUtente(utente, (ctx) => vistaRianalisiEmail(s.dip, ctx, preventivo.toUpperCase(), stima.richiestaId.toUpperCase())))?.richiestaId).toBe(stima.richiestaId);
    expect(await s.perUtente(utente, (ctx) => vistaRianalisiEmail(s.dip, ctx, riunione, stima.richiestaId))).toBeNull();
    const altro = await s.creaUtente("bruno@esempio.example");
    expect(await s.perUtente(altro, (ctx) => vistaRianalisiEmail(s.dip, ctx, preventivo, stima.richiestaId))).toBeNull();
    expect(await s.perUtente(utente, (ctx) => vistaRianalisiEmail(s.dip, ctx, preventivo, "non-un-id"))).toBeNull();

    // Una richiesta con un altro ambito non viene mostrata sulla pagina dell'email.
    const giorni = await s.perUtente(utente, (ctx) => stimaRianalisi(s.dip, ctx, { tipo: "giorni", giorni: 1 }));
    expect(await s.perUtente(utente, (ctx) => vistaRianalisiEmail(s.dip, ctx, preventivo, giorni.richiestaId))).toBeNull();

    expect(await s.perUtente(utente, (ctx) => confermaRianalisi(s.dip, ctx, stima.richiestaId))).toBe(true);
    const confermata = await s.perUtente(utente, (ctx) => vistaRianalisiEmail(s.dip, ctx, preventivo, stima.richiestaId));
    expect(confermata?.stato).toBe("confermata");
    expect(s.coda.pendenti.some((j) => j.nome === "rianalizza")).toBe(true);
  });

  it("l'annullamento della correzione riporta la lingua rilevata", async () => {
    const { utente, preventivo } = await prepara();
    const prima = await s.perUtente(utente, (ctx) => vistaEmail(s.dip, ctx, preventivo));
    const esito = await s.perUtente(utente, (ctx) => cambiaLingua(s.dip, ctx, preventivo, "fr"));
    expect(esito.codice).toBe("ok");
    const corretta = await s.perUtente(utente, (ctx) => vistaEmail(s.dip, ctx, preventivo));
    const ids = corretta!.correzioni.filter((c) => c.campo === "lingua").map((c) => c.id);
    expect(ids).toHaveLength(1);
    expect((await s.perUtente(utente, (ctx) => annullaCorrezioni(s.dip, ctx, ids))).codice).toBe("ok");
    const dopo = await s.perUtente(utente, (ctx) => vistaEmail(s.dip, ctx, preventivo));
    expect(dopo?.lingua).toEqual(prima?.lingua);
    expect(dopo?.correzioni.some((c) => c.campo === "lingua")).toBe(false);
  });
});
