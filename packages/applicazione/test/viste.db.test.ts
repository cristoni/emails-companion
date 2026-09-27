import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { annullaCorrezioni, modificaAttivita, segnaGestita } from "../src/correzioni";
import { elencoPosta, vistaEmail, vistaHome, vistaImpostazioni, vistaSituazione, vistaStato } from "../src/viste";
import { creaScenario, type Scenario } from "./support/scenario";

let s: Scenario;
beforeEach(async () => {
  s = await creaScenario();
});
afterEach(async () => {
  await s.chiudi();
});

const ORA = 60 * 60 * 1000;
const MINUTO = 60 * 1000;

function classificazione(opzioni: { urgente?: boolean; categoria?: string; titolo?: string } = {}) {
  return () => ({
    output: {
      categoria: opzioni.categoria ?? "operativa",
      urgente: opzioni.urgente ?? false,
      base_urgenza: "rilevato",
      priorita: "alta",
      motivazione: "Il mittente segnala un blocco in produzione.",
      titolo_situazione: opzioni.titolo ?? "Server giù",
      descrizione_situazione: "Il server di produzione non risponde.",
      evidenze: [{ email: "e1", citazione: "Il server di produzione è giù", campo: "urgenza" }],
    },
  });
}

const nessunaRelazione = () => ({
  output: { richieste: [], collegamenti: [], valutazioni: [], completamenti: [], titolo_situazione: null, descrizione_situazione: null },
});

const nessunElemento = () => ({ output: { elementi: [], titolo_situazione: null, descrizione_situazione: null } });

function unElemento(descrizione: string, citazione: string, scadenza: string | null = null) {
  return () => ({
    output: {
      elementi: [
        {
          esito: "nuovo",
          riferimento: null,
          descrizione,
          scadenza_iso: scadenza,
          scadenza_citazione: scadenza ? citazione : null,
          priorita: "media",
          urgente: false,
          base: "rilevato",
          evidenze: [{ email: "e1", citazione }],
        },
      ],
      titolo_situazione: null,
      descrizione_situazione: null,
    },
  });
}

async function preparaUtente() {
  const utente = await s.creaUtente("anna@esempio.it");
  const { casella } = await s.collegaGmail(utente, "anna@esempio.it");
  await s.eseguiJob();
  return { utente, casella };
}

async function sincronizza() {
  s.orologio.avanza(2 * MINUTO);
  s.coda.aggiungi("pianifica_sincronizzazioni", {});
  await s.eseguiJob();
}

const tutteLeCard = (home: Awaited<ReturnType<typeof vistaHome>>) => Object.values(home.aree).flat();

describe("home: email urgente senza azioni", () => {
  it("compare in Urgente; 'segna come gestita' la toglie e l'annullamento la riporta", async () => {
    const { utente, casella } = await preparaUtente();
    s.modelli
      .quando("classificazione_priorita", classificazione({ urgente: true }))
      .quando("estrazione_attivita", nessunElemento)
      .quando("attese_risposte", nessunaRelazione);

    s.orologio.avanza(ORA);
    casella.ricevi({ da: "ops@fornitore.it", a: ["anna@esempio.it"], oggetto: "Server giù", testo: "Ciao Anna,\nIl server di produzione è giù.\nOps", il: s.orologio.ora() });
    await sincronizza();

    const home = await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx));
    expect(home.aree.urgente).toHaveLength(1);
    expect(home.aree.da_fare).toHaveLength(0);
    expect(home.aree.in_attesa).toHaveLength(0);
    expect(home.aree.risposte_arrivate).toHaveLength(0);
    const card = home.aree.urgente[0]!;
    expect(card.titolo).toBe("Server giù");
    expect(card.areaPrincipale).toBe("urgente");
    expect(card.indicatori).toEqual([]);
    expect(card.motivoUrgenza).toBe("email_urgente");
    expect(card.prossimaAzione.tipo).toBe("gestisci_urgenza");
    expect(card.caselle).toEqual(["anna@esempio.it"]);
    expect(home.avvisi.map((a) => a.codice)).toContain("importazione_da_confermare");
    expect(home.news).toMatchObject({ vuoto: true, voci: [], nonIncluse: [] });

    const esito = await s.perUtente(utente, (ctx) => segnaGestita(s.dip, ctx, card.id));
    expect(esito.codice).toBe("ok");
    const dopo = await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx));
    expect(tutteLeCard(dopo)).toHaveLength(0);

    const dettaglio = await s.perUtente(utente, (ctx) => vistaSituazione(s.dip, ctx, card.id));
    expect(dettaglio?.stato.attiva).toBe(false);
    expect(dettaglio?.situazione.gestitaIl).not.toBeNull();
    expect(dettaglio?.eventi.map((e) => e.tipo)).toContain("situazione_gestita");

    if (esito.codice !== "ok") throw new Error("atteso ok");
    const annullato = await s.perUtente(utente, (ctx) => annullaCorrezioni(s.dip, ctx, esito.correzioni));
    expect(annullato.codice).toBe("ok");
    const ripristinata = await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx));
    expect(ripristinata.aree.urgente.map((c) => c.id)).toEqual([card.id]);

    // Una nuova email urgente dopo la gestione riporta la Situazione in Urgente.
    await s.perUtente(utente, (ctx) => segnaGestita(s.dip, ctx, card.id));
    s.orologio.avanza(ORA);
    casella.ricevi({
      da: "ops@fornitore.it",
      a: ["anna@esempio.it"],
      oggetto: "Re: Server giù",
      testo: "Il server di produzione è giù di nuovo.",
      il: s.orologio.ora(),
      thread: "t-m1",
      inReplyTo: "m1@finto.test",
    });
    await sincronizza();
    const riaperta = await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx));
    expect(riaperta.aree.urgente.map((c) => c.id)).toEqual([card.id]);
  });
});

describe("home: una card per Situazione", () => {
  it("una Situazione urgente con un'Attività compare una sola volta, con l'indicatore Da fare", async () => {
    const { utente, casella } = await preparaUtente();
    s.modelli
      .quando("classificazione_priorita", classificazione({ urgente: true, titolo: "Contratto Rossi" }))
      .quando("estrazione_attivita", unElemento("Firmare il contratto", "firmare il contratto entro il 30 settembre", "2026-09-30"));

    s.orologio.avanza(ORA);
    casella.ricevi({
      da: "legale@rossi.it",
      a: ["anna@esempio.it"],
      oggetto: "Contratto",
      testo: "Il server di produzione è giù, ma devi firmare il contratto entro il 30 settembre.",
      il: s.orologio.ora(),
    });
    await sincronizza();

    const home = await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx));
    expect(tutteLeCard(home)).toHaveLength(1);
    const card = home.aree.urgente[0]!;
    expect(card.indicatori).toEqual(["da_fare"]);
    expect(card.haProposte).toBe(true);
    expect(card.prossimaAzione).toMatchObject({ tipo: "attivita", descrizione: "Firmare il contratto", scadenza: "2026-09-30T00:00:00.000Z" });
    expect(card.scadenzaPiuVicina).toBe("2026-09-30T00:00:00.000Z");

    // La modifica dell'utente vale subito nella card e nel dettaglio.
    if (card.prossimaAzione.tipo !== "attivita") throw new Error("attesa un'attività");
    const attivitaId = card.prossimaAzione.attivitaId;
    const esito = await s.perUtente(utente, (ctx) =>
      modificaAttivita(s.dip, ctx, attivitaId, { descrizione: "Firmare e rispedire il contratto", scadenza: "2026-10-02" }),
    );
    expect(esito.codice).toBe("ok");
    const dopo = await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx));
    expect(dopo.aree.urgente[0]!.prossimaAzione).toMatchObject({ descrizione: "Firmare e rispedire il contratto", scadenza: "2026-10-02T00:00:00.000Z" });
    const dettaglio = await s.perUtente(utente, (ctx) => vistaSituazione(s.dip, ctx, card.id));
    const attivita = dettaglio!.attivita[0]!;
    expect(attivita.descrizione).toBe("Firmare e rispedire il contratto");
    expect(attivita.proposta).toBe(true);
    expect(attivita.evidenze[0]?.verificata).toBe(true);
    expect(attivita.correzioni.map((c) => c.campo).sort()).toEqual(["descrizione", "scadenza"]);
    expect(dettaglio!.fonti).toHaveLength(1);
    expect(dettaglio!.fonti[0]!.caselle[0]).toMatchObject({ indirizzo: "anna@esempio.it", linkOriginale: "https://mail.finta.test/anna%40esempio.it#m1" });
    expect(dettaglio!.perche.find((p) => p.soggetto.tipo === "attivita")?.funzione).toBe("estrazione_attivita");
  });
});

describe("home: avvisi", () => {
  it("senza consenso e senza chiave l'analisi è in pausa e la home lo dice con codici", async () => {
    const utente = await s.creaUtente("anna@esempio.it", { chiave: false, consenso: false });
    await s.collegaGmail(utente, "anna@esempio.it", { scope: ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.readonly"] });
    await s.eseguiJob();
    const home = await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx));
    expect(home.avvisi).toEqual(
      expect.arrayContaining([
        { codice: "consenso_mancante" },
        { codice: "analisi_in_pausa", motivo: "chiave_mancante", funzione: "*" },
        { codice: "permessi_incompleti", casellaId: expect.any(String), indirizzo: "anna@esempio.it" },
      ]),
    );
    const impostazioni = await s.perUtente(utente, (ctx) => vistaImpostazioni(s.dip, ctx));
    expect(impostazioni.chiave).toBeNull();
    expect(impostazioni.consenso.accettato).toBe(false);
    expect(impostazioni.caselle[0]).toMatchObject({ lettura: true, invio: false, stato: "permessi_incompleti" });
    expect(impostazioni.modelli.map((m) => m.modello)).toEqual(Array(5).fill("openai/gpt-6-luna"));
  });
});

describe("le viste non trasportano segreti", () => {
  it("nessun DTO contiene la chiave OpenRouter, i token o valori binari", async () => {
    const { utente, casella } = await preparaUtente();
    s.modelli
      .quando("classificazione_priorita", classificazione({ urgente: true }))
      .quando("estrazione_attivita", unElemento("Riavviare il server", "Il server di produzione è giù"));
    s.orologio.avanza(ORA);
    casella.ricevi({ da: "ops@fornitore.it", a: ["anna@esempio.it"], oggetto: "Server giù", testo: "Il server di produzione è giù.", il: s.orologio.ora() });
    await sincronizza();

    const viste = await s.perUtente(utente, async (ctx) => {
      const home = await vistaHome(s.dip, ctx);
      const card = home.aree.urgente[0]!;
      const situazione = await vistaSituazione(s.dip, ctx, card.id);
      const posta = await elencoPosta(s.dip, ctx, { limite: 20 });
      const email = await vistaEmail(s.dip, ctx, posta.email[0]!.id);
      return { home, situazione, posta, email, stato: await vistaStato(s.dip, ctx), impostazioni: await vistaImpostazioni(s.dip, ctx) };
    });

    expect(viste.situazione).not.toBeNull();
    expect(viste.email?.testo).toContain("Il server di produzione è giù.");
    expect(viste.impostazioni.chiave).toMatchObject({ stato: "valida", ultimeCifre: "6789" });
    expect(viste.posta.email).toHaveLength(1);
    expect(viste.stato.caselle[0]?.indirizzo).toBe("anna@esempio.it");

    const serializzate = JSON.stringify(viste);
    for (const canarino of ["sk-or-v1-chiavefintaditest0123456789", "chiavefintaditest", "1//refresh-finto", "ya29.finto"]) {
      expect(serializzate).not.toContain(canarino);
    }
    const nonSemplici: string[] = [];
    const visita = (valore: unknown, percorso: string) => {
      if (valore instanceof Uint8Array || valore instanceof Date || Buffer.isBuffer(valore)) nonSemplici.push(percorso);
      else if (Array.isArray(valore)) valore.forEach((v, i) => visita(v, `${percorso}[${i}]`));
      else if (valore !== null && typeof valore === "object") for (const [k, v] of Object.entries(valore)) visita(v, `${percorso}.${k}`);
    };
    visita(viste, "viste");
    expect(nonSemplici).toEqual([]);
  });
});
