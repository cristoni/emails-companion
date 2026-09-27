import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { posta } from "@ec/db";
import { annullaSpostamentoDalleNews, cambiaCategoria, spostateFuoriDalleNews, vistaRiepilogoNews } from "../src";
import { creaScenario, type Scenario } from "./support/scenario";

const ORA = 60 * 60 * 1000;

let s: Scenario;

beforeEach(async () => {
  s = await creaScenario();
});
afterEach(async () => {
  await s.chiudi();
});

/** Le email con oggetto "News…" sono News per l'AI, le altre operative. */
function scriptModelli() {
  s.modelli.quando("classificazione_priorita", (dati) => ({
    output: {
      categoria: String(dati.email.oggetto).startsWith("News") ? "news" : "operativa",
      urgente: false,
      base_urgenza: "dedotto",
      priorita: "bassa",
      motivazione: "Comunicazione informativa.",
      titolo_situazione: null,
      descrizione_situazione: null,
      evidenze: [],
    },
  }));
  s.modelli.quando("estrazione_attivita", () => ({ output: { elementi: [], titolo_situazione: null, descrizione_situazione: null } }));
  s.modelli.quando("attese_risposte", () => ({
    output: { richieste: [], collegamenti: [], valutazioni: [], completamenti: [], titolo_situazione: null, descrizione_situazione: null },
  }));
  s.modelli.quando("riepilogo_news", (dati) => ({
    output: { voci: dati.email.map((e: { alias: string }) => ({ testo: `Voce ${e.alias}`, email: [e.alias] })) },
  }));
}

/** Utente con tre email ricevute: due News nella finestra, una operativa e una News di ieri (fuori finestra). */
async function prepara() {
  const utente = await s.creaUtente("anna@esempio.it");
  const { casella } = await s.collegaGmail(utente, "anna@esempio.it");
  await s.eseguiJob();
  scriptModelli();
  const adesso = s.orologio.ora().getTime();
  casella.ricevi({ da: "bollettino@esempio.example", a: ["anna@esempio.it"], oggetto: "News del mattino", testo: "Le notizie del mattino.", il: new Date(adesso - 3 * ORA) });
  casella.ricevi({ da: "aggiornamenti@esempio.example", a: ["anna@esempio.it"], oggetto: "News di prodotto", testo: "Novità del prodotto.", il: new Date(adesso - 2 * ORA) });
  casella.ricevi({ da: "cliente@esempio.example", a: ["anna@esempio.it"], oggetto: "Preventivo", testo: "Ecco il preventivo richiesto.", il: new Date(adesso - ORA) });
  casella.ricevi({ da: "bollettino@esempio.example", a: ["anna@esempio.it"], oggetto: "News di ieri", testo: "Le notizie di ieri.", il: new Date(adesso - 25 * ORA) });
  s.coda.aggiungi("pianifica_sincronizzazioni", {});
  await s.eseguiJob();
  const ids = await s.perUtente(utente, async (ctx) => {
    const elenco = await posta.elenco(ctx, { limite: 50 });
    return Object.fromEntries(elenco.map((e) => [e.oggetto, e.id])) as Record<string, string>;
  });
  return { utente, ids };
}

const spostate = (utente: string) => s.perUtente(utente, (ctx) => spostateFuoriDalleNews(s.dip, ctx));
const membri = async (utente: string) => (await s.perUtente(utente, (ctx) => vistaRiepilogoNews(s.dip, ctx))).membri.map((m) => m.emailId).sort();

describe("web home: spostamento fuori dalle News e annullamento", () => {
  it("elenca le email spostate fuori dalle News e le rimette nelle News con l'annullamento", async () => {
    const { utente, ids } = await prepara();
    const mattino = ids["News del mattino"]!;
    const prodotto = ids["News di prodotto"]!;
    expect(await membri(utente)).toEqual([mattino, prodotto].sort());
    expect(await spostate(utente)).toEqual([]);

    const esito = await s.perUtente(utente, (ctx) => cambiaCategoria(s.dip, ctx, mattino, "operativa"));
    expect(esito.codice).toBe("ok");
    expect(await membri(utente)).toEqual([prodotto]);

    const elenco = await spostate(utente);
    expect(elenco).toHaveLength(1);
    expect(elenco[0]).toMatchObject({
      emailId: mattino,
      oggetto: "News del mattino",
      mittente: { indirizzo: "bollettino@esempio.example" },
      casella: "anna@esempio.it",
      categoria: "operativa",
      correzioni: esito.codice === "ok" ? esito.correzioni : [],
    });

    const annullato = await s.perUtente(utente, (ctx) => annullaSpostamentoDalleNews(s.dip, ctx, mattino));
    expect(annullato.codice).toBe("ok");
    expect(await spostate(utente)).toEqual([]);
    expect(await membri(utente)).toEqual([mattino, prodotto].sort());
  });

  it("dopo più cambi di categoria l'annullamento revoca tutta la catena e l'email torna nelle News", async () => {
    const { utente, ids } = await prepara();
    const mattino = ids["News del mattino"]!;
    await s.perUtente(utente, (ctx) => cambiaCategoria(s.dip, ctx, mattino, "operativa"));
    s.orologio.avanza(1000);
    await s.perUtente(utente, (ctx) => cambiaCategoria(s.dip, ctx, mattino, "informativa"));

    const [voce] = await spostate(utente);
    expect(voce?.categoria).toBe("informativa");
    expect(voce?.correzioni).toHaveLength(2);

    expect((await s.perUtente(utente, (ctx) => annullaSpostamentoDalleNews(s.dip, ctx, mattino))).codice).toBe("ok");
    expect(await membri(utente)).toContain(mattino);
    expect(await spostate(utente)).toEqual([]);
  });

  it("un'email portata nelle News dall'utente e poi spostata fuori torna nelle News mantenendo la prima correzione", async () => {
    const { utente, ids } = await prepara();
    const preventivo = ids["Preventivo"]!;
    await s.perUtente(utente, (ctx) => cambiaCategoria(s.dip, ctx, preventivo, "news"));
    expect(await membri(utente)).toContain(preventivo);
    // Portata nelle News dall'utente ma non spostata fuori: non è tra le spostate.
    expect(await spostate(utente)).toEqual([]);

    s.orologio.avanza(1000);
    const fuori = await s.perUtente(utente, (ctx) => cambiaCategoria(s.dip, ctx, preventivo, "operativa"));
    const [voce] = await spostate(utente);
    expect(voce?.emailId).toBe(preventivo);
    expect(voce?.correzioni).toEqual(fuori.codice === "ok" ? [fuori.correzioni[0]] : []);

    await s.perUtente(utente, (ctx) => annullaSpostamentoDalleNews(s.dip, ctx, preventivo));
    expect(await membri(utente)).toContain(preventivo);
  });

  it("ignora le email fuori dalla finestra delle 24 ore e gli id sconosciuti o malformati", async () => {
    const { utente, ids } = await prepara();
    const ieri = ids["News di ieri"]!;
    expect((await s.perUtente(utente, (ctx) => cambiaCategoria(s.dip, ctx, ieri, "operativa"))).codice).toBe("ok");
    expect(await spostate(utente)).toEqual([]);
    expect((await s.perUtente(utente, (ctx) => annullaSpostamentoDalleNews(s.dip, ctx, ieri))).codice).toBe("non_trovato");
    expect((await s.perUtente(utente, (ctx) => annullaSpostamentoDalleNews(s.dip, ctx, crypto.randomUUID()))).codice).toBe("non_trovato");
    expect((await s.perUtente(utente, (ctx) => annullaSpostamentoDalleNews(s.dip, ctx, "non-un-id"))).codice).toBe("non_trovato");
  });

  it("non mostra né annulla gli spostamenti di un altro utente", async () => {
    const { utente, ids } = await prepara();
    const mattino = ids["News del mattino"]!;
    await s.perUtente(utente, (ctx) => cambiaCategoria(s.dip, ctx, mattino, "operativa"));
    const altro = await s.creaUtente("bruno@esempio.it");
    expect(await spostate(altro)).toEqual([]);
    expect((await s.perUtente(altro, (ctx) => annullaSpostamentoDalleNews(s.dip, ctx, mattino))).codice).toBe("non_trovato");
    expect(await spostate(utente)).toHaveLength(1);
  });
});
