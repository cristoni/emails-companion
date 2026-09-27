import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { operativo, posta, riconciliazione } from "@ec/db";
import { opzioniRiconciliazione } from "../src/analisi/analizza-email";
import {
  annullaAttesa,
  annullaCorrezioni,
  archivia,
  cambiaCategoria,
  cambiaUrgenza,
  completaAttivita,
  confermaElemento,
  riapriAttivita,
  riapriSituazione,
  rifiutaCollegamento,
  rifiutaRisposta,
  scartaElemento,
  segnaAttesaSoddisfatta,
  segnaGestita,
} from "../src/correzioni";
import { correzioniDb } from "../src/correzioni/repository";
import { elencoPosta, vistaEmail, vistaHome, vistaSituazione } from "../src/viste";
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

async function preparaUtente(indirizzo = "anna@esempio.it") {
  const utente = await s.creaUtente(indirizzo);
  const { casella } = await s.collegaGmail(utente, indirizzo);
  await s.eseguiJob();
  return { utente, casella };
}

async function sincronizza() {
  s.orologio.avanza(2 * MINUTO);
  s.coda.aggiungi("pianifica_sincronizzazioni", {});
  await s.eseguiJob();
}

/** Classificazione operativa; urgente se il testo contiene "giù". */
function classificazione(categoria = "operativa") {
  return (dati: any) => ({
    output: {
      categoria,
      urgente: String(dati.email.testo).includes("giù"),
      base_urgenza: "dedotto",
      priorita: "media",
      motivazione: "Motivazione.",
      titolo_situazione: null,
      descrizione_situazione: null,
      evidenze: [],
    },
  });
}

const ELEMENTO_CONTRATTO = {
  esito: "nuovo",
  riferimento: null,
  descrizione: "Rivedere il contratto",
  scadenza_iso: null,
  scadenza_citazione: null,
  priorita: "media",
  urgente: false,
  base: "rilevato",
  evidenze: [{ email: "e1", citazione: "puoi rivedere il contratto" }],
};

/** Un'Attività per le email che chiedono di rivedere il contratto, nessuna per le altre. */
const estrazioneContratto = (dati: any) => ({
  output: {
    elementi: String(dati.email.testo).includes("contratto") ? [ELEMENTO_CONTRATTO] : [],
    titolo_situazione: null,
    descrizione_situazione: null,
  },
});

const nessunaRelazione = () => ({
  output: { richieste: [], collegamenti: [], valutazioni: [], completamenti: [], titolo_situazione: null, descrizione_situazione: null },
});

/** Richiesta dei dati di agosto (ricavi e costi) e valutazione delle risposte in base al testo. */
function scriptAtteseRisposte() {
  return (dati: any) => {
    if (dati.email.direzione === "uscita") {
      return {
        output: {
          richieste: [
            {
              esito: "nuovo",
              riferimento: null,
              destinatari: ["marco@cliente.it"],
              oggetto: "Dati di agosto",
              data_attesa_iso: null,
              data_attesa_citazione: null,
              requisiti: ["ricavi", "costi"],
              sollecito_di: null,
              base: "rilevato",
              evidenze: [{ email: "e1", citazione: "puoi mandarmi i dati di agosto" }],
            },
          ],
          collegamenti: [],
          valutazioni: [],
          completamenti: [],
          titolo_situazione: "Dati di agosto",
          descrizione_situazione: "Richiesta dei dati di agosto a Marco.",
        },
      };
    }
    const testo: string = dati.email.testo;
    const attesa = dati.attese_candidate[0];
    const ricavi = testo.includes("Ricavi");
    const costi = testo.includes("Costi");
    return {
      output: {
        richieste: [],
        collegamenti: [],
        valutazioni:
          attesa && (ricavi || costi)
            ? [
                {
                  attesa: attesa.alias,
                  valutazione: ricavi && costi ? "completa" : "parziale",
                  requisiti: [
                    { requisito: `${attesa.alias}r1`, soddisfatto: ricavi, evidenze: ricavi ? [{ email: "e1", citazione: testo.match(/Ricavi: [\d.]+/)![0] }] : [] },
                    { requisito: `${attesa.alias}r2`, soddisfatto: costi, evidenze: costi ? [{ email: "e1", citazione: testo.match(/Costi: [\d.]+/)![0] }] : [] },
                  ],
                  motivazione: "Valutazione della risposta.",
                },
              ]
            : [],
        completamenti: [],
        titolo_situazione: null,
        descrizione_situazione: null,
      },
    };
  };
}

async function ultimaEmail(utente: string): Promise<string> {
  const [id] = await s.perUtente(utente, async (ctx) => (await posta.elenco(ctx, { limite: 1 })).map((e) => e.id));
  return id!;
}

/** Email in entrata con un'Attività "Rivedere il contratto": restituisce email, Situazione e Attività. */
async function richiestaContratto(utente: string, casella: ReturnType<Scenario["casella"]>, da = "marco@cliente.it") {
  s.orologio.avanza(ORA);
  casella.ricevi({ da, a: ["anna@esempio.it"], oggetto: "Contratto", testo: "Ciao Anna, puoi rivedere il contratto?", il: s.orologio.ora() });
  await sincronizza();
  const emailId = await ultimaEmail(utente);
  const situazioneId = (await s.perUtente(utente, (ctx) => operativo.situazionePerOrigine(ctx, emailId)))!;
  const v = (await s.perUtente(utente, (ctx) => vistaSituazione(s.dip, ctx, situazioneId)))!;
  return { emailId, situazioneId, attivitaId: v.attivita[0]!.id };
}

const tutteLeCard = (home: Awaited<ReturnType<typeof vistaHome>>) => Object.values(home.aree).flat();

describe("urgenza corretta dopo 'segna come gestita'", () => {
  it("rendere di nuovo urgente un'email già arrivata riporta la Situazione in Urgente", async () => {
    const { utente, casella } = await preparaUtente();
    s.modelli.quando("classificazione_priorita", classificazione()).quando("estrazione_attivita", estrazioneContratto).quando("attese_risposte", nessunaRelazione);
    s.orologio.avanza(ORA);
    casella.ricevi({ da: "marco@cliente.it", a: ["anna@esempio.it"], oggetto: "Contratto", testo: "Il sito è giù: puoi rivedere il contratto?", il: s.orologio.ora() });
    await sincronizza();
    const emailId = await ultimaEmail(utente);
    const situazioneId = (await s.perUtente(utente, (ctx) => operativo.situazionePerOrigine(ctx, emailId)))!;
    let home = await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx));
    expect(home.aree.urgente.map((c) => c.id)).toEqual([situazioneId]);

    expect((await s.perUtente(utente, (ctx) => segnaGestita(s.dip, ctx, situazioneId))).codice).toBe("ok");
    // Senza urgenza da chiudere non c'è nulla da segnare.
    expect((await s.perUtente(utente, (ctx) => segnaGestita(s.dip, ctx, situazioneId))).codice).toBe("nessuna_modifica");
    home = await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx));
    expect(home.aree.urgente).toHaveLength(0);
    expect(home.aree.da_fare.map((c) => c.id)).toEqual([situazioneId]);

    // L'utente toglie l'urgenza e poi la rimette: la correzione vale dal momento in cui la fa.
    expect((await s.perUtente(utente, (ctx) => cambiaUrgenza(s.dip, ctx, emailId, false))).codice).toBe("ok");
    s.orologio.avanza(MINUTO);
    expect((await s.perUtente(utente, (ctx) => cambiaUrgenza(s.dip, ctx, emailId, true))).codice).toBe("ok");
    home = await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx));
    expect(home.aree.urgente.map((c) => c.id)).toEqual([situazioneId]);
    expect(home.aree.urgente[0]).toMatchObject({ motivoUrgenza: "email_urgente", indicatori: ["da_fare"] });

    // Due "segna come gestita" concorrenti scrivono una sola correzione.
    s.orologio.avanza(MINUTO);
    const esiti = await Promise.all([
      s.perUtente(utente, (ctx) => segnaGestita(s.dip, ctx, situazioneId)),
      s.perUtente(utente, (ctx) => segnaGestita(s.dip, ctx, situazioneId)),
    ]);
    expect(esiti.map((e) => e.codice).sort()).toEqual(["nessuna_modifica", "ok"]);
    home = await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx));
    expect(home.aree.urgente).toHaveLength(0);
    expect(home.aree.da_fare.map((c) => c.id)).toEqual([situazioneId]);
  });
});

describe("annullamento del rifiuto di un collegamento", () => {
  it("riporta indietro solo gli elementi che il rifiuto aveva spostato", async () => {
    const { utente, casella } = await preparaUtente();
    s.modelli.quando("classificazione_priorita", classificazione()).quando("estrazione_attivita", estrazioneContratto).quando("attese_risposte", nessunaRelazione);
    const a = await richiestaContratto(utente, casella);
    s.orologio.avanza(ORA);
    casella.ricevi({ da: "ops@fornitore.it", a: ["anna@esempio.it"], oggetto: "Server", testo: "Il server è giù.", il: s.orologio.ora() });
    await sincronizza();
    const emailB = await ultimaEmail(utente);
    const sB = (await s.perUtente(utente, (ctx) => operativo.situazionePerOrigine(ctx, emailB)))!;
    expect(sB).not.toBe(a.situazioneId);

    // L'AI propone di collegare l'email del contratto anche alla Situazione del server: gli elementi restano nella propria.
    const collegamento = await s.perUtente(utente, (ctx) =>
      operativo.collega(ctx, { emailId: a.emailId, situazioneId: sB, origine: "ai", ruolo: "risposta", stato: "proposto", confidenza: 0.6, analisiId: null }, s.orologio.ora()),
    );
    const rifiuto = await s.perUtente(utente, (ctx) => rifiutaCollegamento(s.dip, ctx, collegamento.id));
    if (rifiuto.codice !== "ok") throw new Error(`atteso ok, ottenuto ${rifiuto.codice}`);
    await s.eseguiJob();
    expect((await s.perUtente(utente, (ctx) => vistaSituazione(s.dip, ctx, a.situazioneId)))!.attivita.map((x) => x.id)).toEqual([a.attivitaId]);

    expect((await s.perUtente(utente, (ctx) => annullaCorrezioni(s.dip, ctx, rifiuto.correzioni))).codice).toBe("ok");
    const propria = (await s.perUtente(utente, (ctx) => vistaSituazione(s.dip, ctx, a.situazioneId)))!;
    const altra = (await s.perUtente(utente, (ctx) => vistaSituazione(s.dip, ctx, sB)))!;
    expect(propria.attivita.map((x) => x.id)).toEqual([a.attivitaId]);
    expect(altra.attivita).toHaveLength(0);
    expect(altra.collegamenti.find((c) => c.emailId === a.emailId)?.stato).toBe("proposto");
  });
});

describe("spostamento nelle News con l'estrazione ancora da eseguire", () => {
  it("l'estrazione non viene più eseguita; spostata fuori dalle News riparte", async () => {
    const { utente, casella } = await preparaUtente();
    let estrazioneDisponibile = false;
    s.modelli
      .quando("classificazione_priorita", classificazione())
      .quando("estrazione_attivita", (dati) => (estrazioneDisponibile ? estrazioneContratto(dati) : { errore: "modello_incompatibile" }))
      .quando("attese_risposte", nessunaRelazione)
      .quando("riepilogo_news", () => ({ output: { voci: [] } }));

    s.orologio.avanza(ORA);
    casella.ricevi({ da: "news@rivista.it", a: ["anna@esempio.it"], oggetto: "Novità", testo: "Offerta: puoi rivedere il contratto online.", il: s.orologio.ora() });
    await sincronizza();
    const emailId = await ultimaEmail(utente);
    expect((await s.perUtente(utente, (ctx) => posta.statiFunzione(ctx, emailId))).estrazione_attivita?.stato).toBe("in_pausa");

    expect((await s.perUtente(utente, (ctx) => cambiaCategoria(s.dip, ctx, emailId, "news"))).codice).toBe("ok");
    await s.eseguiJob();
    expect((await s.perUtente(utente, (ctx) => posta.statiFunzione(ctx, emailId))).estrazione_attivita?.stato).toBe("non_necessaria");

    // Il modello torna disponibile: la ripresa non estrae elementi da un'email che ora è nelle News.
    estrazioneDisponibile = true;
    await s.avanza(7 * ORA);
    expect(s.modelli.chiamateDi("estrazione_attivita")).toHaveLength(1);
    let home = await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx));
    expect(tutteLeCard(home)).toHaveLength(0);

    // Fuori dalle News l'estrazione riparte.
    expect((await s.perUtente(utente, (ctx) => cambiaCategoria(s.dip, ctx, emailId, "operativa"))).codice).toBe("ok");
    await s.eseguiJob();
    expect(s.modelli.chiamateDi("estrazione_attivita")).toHaveLength(2);
    home = await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx));
    expect(home.aree.da_fare).toHaveLength(1);
  });
});

describe("azioni ripetute in parallelo (doppio invio)", () => {
  it("due conferme concorrenti scrivono una sola correzione; due annullamenti concorrenti ne revocano una volta", async () => {
    const { utente, casella } = await preparaUtente();
    s.modelli.quando("classificazione_priorita", classificazione()).quando("estrazione_attivita", estrazioneContratto).quando("attese_risposte", nessunaRelazione);
    const { attivitaId } = await richiestaContratto(utente, casella);

    const esiti = await Promise.all([
      s.perUtente(utente, (ctx) => confermaElemento(s.dip, ctx, { tipo: "attivita", id: attivitaId })),
      s.perUtente(utente, (ctx) => confermaElemento(s.dip, ctx, { tipo: "attivita", id: attivitaId })),
    ]);
    expect(esiti.map((e) => e.codice).sort()).toEqual(["nessuna_modifica", "ok"]);
    const correzioni = await s.perUtente(utente, (ctx) => operativo.correzioniPer(ctx, [{ tipo: "attivita", id: attivitaId }]));
    expect(correzioni).toHaveLength(1);

    const annullamenti = await Promise.all([
      s.perUtente(utente, (ctx) => annullaCorrezioni(s.dip, ctx, [correzioni[0]!.id])),
      s.perUtente(utente, (ctx) => annullaCorrezioni(s.dip, ctx, [correzioni[0]!.id])),
    ]);
    expect(annullamenti.map((e) => e.codice).sort()).toEqual(["nessuna_modifica", "ok"]);
  });
});

describe("ciclo di vita delle Attività", () => {
  it("completa, riapri, scarta e riapri di nuovo", async () => {
    const { utente, casella } = await preparaUtente();
    s.modelli.quando("classificazione_priorita", classificazione()).quando("estrazione_attivita", estrazioneContratto).quando("attese_risposte", nessunaRelazione);
    const { situazioneId, attivitaId } = await richiestaContratto(utente, casella);
    const attivita = async () => (await s.perUtente(utente, (ctx) => vistaSituazione(s.dip, ctx, situazioneId)))!;

    expect((await s.perUtente(utente, (ctx) => riapriAttivita(s.dip, ctx, attivitaId))).codice).toBe("nessuna_modifica");
    expect((await s.perUtente(utente, (ctx) => completaAttivita(s.dip, ctx, attivitaId))).codice).toBe("ok");
    expect((await s.perUtente(utente, (ctx) => completaAttivita(s.dip, ctx, attivitaId))).codice).toBe("nessuna_modifica");
    let v = await attivita();
    expect(v.attivita[0]).toMatchObject({ stato: "completata", completata: true, completataDa: "utente", completataDaAi: false });
    expect(v.stato.attiva).toBe(false);
    expect(v.eventi.map((e) => e.tipo)).toContain("attivita_completata");
    expect(tutteLeCard(await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx)))).toHaveLength(0);

    expect((await s.perUtente(utente, (ctx) => riapriAttivita(s.dip, ctx, attivitaId))).codice).toBe("ok");
    v = await attivita();
    expect(v.attivita[0]).toMatchObject({ stato: "confermata", confermata: true, completataDa: null });
    expect((await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx))).aree.da_fare.map((c) => c.id)).toEqual([situazioneId]);

    expect((await s.perUtente(utente, (ctx) => scartaElemento(s.dip, ctx, { tipo: "attivita", id: attivitaId }))).codice).toBe("ok");
    expect((await attivita()).attivita[0]!.stato).toBe("scartata");
    expect((await s.perUtente(utente, (ctx) => completaAttivita(s.dip, ctx, attivitaId))).codice).toBe("non_valido");
    expect((await s.perUtente(utente, (ctx) => riapriAttivita(s.dip, ctx, attivitaId))).codice).toBe("ok");
    expect((await attivita()).attivita[0]!.stato).toBe("confermata");
  });
});

describe("decisioni sulle Attese e rifiuto di una Risposta arrivata", () => {
  it("rifiutare una risposta la toglie dal calcolo; soddisfatta e annullata sono decisioni dell'utente annullabili", async () => {
    const { utente, casella } = await preparaUtente();
    s.modelli
      .quando("classificazione_priorita", classificazione())
      .quando("estrazione_attivita", () => ({ output: { elementi: [], titolo_situazione: null, descrizione_situazione: null } }))
      .quando("attese_risposte", scriptAtteseRisposte());
    s.orologio.avanza(ORA);
    casella.ricevi({ da: "anna@esempio.it", a: ["marco@cliente.it"], oggetto: "Dati", testo: "Ciao Marco, puoi mandarmi i dati di agosto (ricavi e costi)?", il: s.orologio.ora(), thread: "t-richiesta" });
    await sincronizza();
    const [situazioneId] = await s.perUtente(utente, (ctx) => operativo.idSituazioniVisibili(ctx));
    const dettaglio = async () => (await s.perUtente(utente, (ctx) => vistaSituazione(s.dip, ctx, situazioneId!)))!;

    s.orologio.avanza(ORA);
    casella.ricevi({ da: "marco@cliente.it", a: ["anna@esempio.it"], oggetto: "ricavi", testo: "Ricavi: 10.000", il: s.orologio.ora(), thread: "t-richiesta" });
    await sincronizza();
    let v = await dettaglio();
    const attesaId = v.attese[0]!.id;
    expect(v.attese[0]!.stato).toBe("parziale");
    const r1 = v.attese[0]!.risposte[0]!;

    expect((await s.perUtente(utente, (ctx) => rifiutaRisposta(s.dip, ctx, r1.id))).codice).toBe("ok");
    expect((await s.perUtente(utente, (ctx) => rifiutaRisposta(s.dip, ctx, r1.id))).codice).toBe("nessuna_modifica");
    v = await dettaglio();
    expect(v.attese[0]!.stato).toBe("aperta");
    expect(v.attese[0]!.risposte[0]).toMatchObject({ statoCollegamento: "rifiutato" });
    expect(v.stato.aree).not.toContain("risposte_arrivate");

    // La riconciliazione ripetuta non ripropone la risposta rifiutata.
    await s.perUtente(utente, async (ctx) => {
      await riconciliazione.rimettiInCoda(ctx, [r1.emailId]);
      await ctx.coda.accoda("riconcilia_utente", { utenteId: utente }, opzioniRiconciliazione(utente));
    });
    await s.eseguiJob();
    v = await dettaglio();
    expect(v.attese[0]!.stato).toBe("aperta");
    expect(v.attese[0]!.risposte[0]!.statoCollegamento).toBe("rifiutato");

    const soddisfatta = await s.perUtente(utente, (ctx) => segnaAttesaSoddisfatta(s.dip, ctx, attesaId));
    if (soddisfatta.codice !== "ok") throw new Error("atteso ok");
    v = await dettaglio();
    expect(v.attese[0]).toMatchObject({ stato: "soddisfatta", chiusaDa: "utente" });
    expect(v.stato.attiva).toBe(false);

    const annullata = await s.perUtente(utente, (ctx) => annullaAttesa(s.dip, ctx, attesaId));
    if (annullata.codice !== "ok") throw new Error("atteso ok");
    expect((await dettaglio()).attese[0]!.stato).toBe("annullata");

    await s.perUtente(utente, (ctx) => annullaCorrezioni(s.dip, ctx, annullata.correzioni));
    expect((await dettaglio()).attese[0]!.stato).toBe("soddisfatta");
    await s.perUtente(utente, (ctx) => annullaCorrezioni(s.dip, ctx, soddisfatta.correzioni));
    v = await dettaglio();
    expect(v.attese[0]).toMatchObject({ stato: "aperta", chiusaDa: null });
    expect((await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx))).aree.in_attesa.map((c) => c.id)).toEqual([situazioneId]);
  });
});

describe("archiviazione e reindirizzamento", () => {
  it("una Situazione archiviata esce dalla home e dai candidati; riaperta torna", async () => {
    const { utente, casella } = await preparaUtente();
    s.modelli.quando("classificazione_priorita", classificazione()).quando("estrazione_attivita", estrazioneContratto).quando("attese_risposte", nessunaRelazione);
    const { situazioneId } = await richiestaContratto(utente, casella);

    const esito = await s.perUtente(utente, (ctx) => archivia(s.dip, ctx, situazioneId));
    expect(esito.codice).toBe("ok");
    expect((await s.perUtente(utente, (ctx) => archivia(s.dip, ctx, situazioneId))).codice).toBe("nessuna_modifica");
    expect(tutteLeCard(await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx)))).toHaveLength(0);
    const v = (await s.perUtente(utente, (ctx) => vistaSituazione(s.dip, ctx, situazioneId)))!;
    expect(v.stato).toMatchObject({ archiviata: true, attiva: false, areaPrincipale: null });
    expect(v.prossimaAzione).toEqual({ tipo: "nessuna" });
    // Il riconciliatore legge la riga: la Situazione archiviata non è più un candidato di correlazione.
    const recenti = await s.perUtente(utente, (ctx) => riconciliazione.situazioniRecenti(ctx, new Date(0), 50));
    expect(recenti).not.toContain(situazioneId);

    expect((await s.perUtente(utente, (ctx) => riapriSituazione(s.dip, ctx, situazioneId))).codice).toBe("ok");
    expect((await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx))).aree.da_fare.map((c) => c.id)).toEqual([situazioneId]);
    expect(await s.perUtente(utente, (ctx) => riconciliazione.situazioniRecenti(ctx, new Date(0), 50))).toContain(situazioneId);
  });

  it("il dettaglio di una Situazione assorbita reindirizza alla destinazione", async () => {
    const { utente, casella } = await preparaUtente();
    s.modelli.quando("classificazione_priorita", classificazione()).quando("estrazione_attivita", estrazioneContratto).quando("attese_risposte", nessunaRelazione);
    const a = await richiestaContratto(utente, casella);
    const b = await richiestaContratto(utente, casella, "giulia@cliente.it");
    expect(b.situazioneId).not.toBe(a.situazioneId);
    await s.perUtente(utente, (ctx) => operativo.assorbi(ctx, b.situazioneId, a.situazioneId, s.orologio.ora()));

    const v = (await s.perUtente(utente, (ctx) => vistaSituazione(s.dip, ctx, b.situazioneId)))!;
    expect(v.id).toBe(a.situazioneId);
    expect(v.reindirizzataDa).toBe(b.situazioneId);
    expect(v.attivita.map((x) => x.id).sort()).toEqual([a.attivitaId, b.attivitaId].sort());
    const home = await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx));
    expect(tutteLeCard(home).map((c) => c.id)).toEqual([a.situazioneId]);

    // Le azioni sull'id assorbito agiscono sulla destinazione.
    expect((await s.perUtente(utente, (ctx) => archivia(s.dip, ctx, b.situazioneId))).codice).toBe("ok");
    expect((await s.perUtente(utente, (ctx) => correzioniDb.situazione(ctx, a.situazioneId)))!.archiviataIl).not.toBeNull();
  });
});

describe("isolamento tra utenti", () => {
  it("gli id di un altro utente non si trovano e le sue correzioni non si annullano", async () => {
    const { utente, casella } = await preparaUtente();
    s.modelli.quando("classificazione_priorita", classificazione()).quando("estrazione_attivita", estrazioneContratto).quando("attese_risposte", nessunaRelazione);
    const a = await richiestaContratto(utente, casella);
    const altro = await s.creaUtente("bruno@esempio.it");
    const conferma = await s.perUtente(utente, (ctx) => confermaElemento(s.dip, ctx, { tipo: "attivita", id: a.attivitaId }));
    if (conferma.codice !== "ok") throw new Error("atteso ok");
    const [collegamento] = await s.perUtente(utente, (ctx) => operativo.collegamentiDellEmail(ctx, a.emailId));

    const come = <T>(lavoro: (ctx: Parameters<Parameters<Scenario["perUtente"]>[1]>[0]) => Promise<T>) => s.perUtente(altro, lavoro);
    expect((await come((ctx) => annullaCorrezioni(s.dip, ctx, conferma.correzioni))).codice).toBe("non_trovato");
    expect((await come((ctx) => rifiutaCollegamento(s.dip, ctx, collegamento!.id))).codice).toBe("non_trovato");
    expect((await come((ctx) => cambiaCategoria(s.dip, ctx, a.emailId, "news"))).codice).toBe("non_trovato");
    expect((await come((ctx) => segnaGestita(s.dip, ctx, a.situazioneId))).codice).toBe("non_trovato");
    expect((await come((ctx) => completaAttivita(s.dip, ctx, a.attivitaId))).codice).toBe("non_trovato");
    expect(await come((ctx) => vistaEmail(s.dip, ctx, a.emailId))).toBeNull();
    expect((await come((ctx) => elencoPosta(s.dip, ctx, { limite: 10 }))).email).toHaveLength(0);
    expect(tutteLeCard(await come((ctx) => vistaHome(s.dip, ctx)))).toHaveLength(0);

    const v = (await s.perUtente(utente, (ctx) => vistaSituazione(s.dip, ctx, a.situazioneId)))!;
    expect(v.attivita[0]!.stato).toBe("confermata");
    expect(v.attivita[0]!.correzioni.map((c) => c.id)).toEqual(conferma.correzioni);
  });
});
