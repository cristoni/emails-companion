import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { operativo, posta, riconciliazione } from "@ec/db";
import { opzioniRiconciliazione } from "../src/analisi/analizza-email";
import {
  annullaCorrezioni,
  cambiaCategoria,
  cambiaLingua,
  cambiaUrgenza,
  confermaElemento,
  correggiValutazione,
  rifiutaCollegamento,
  scartaElemento,
  segnaRispostaVista,
} from "../src/correzioni";
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

function classificazione(categoria = "operativa", titolo: string | null = null) {
  return () => ({
    output: {
      categoria,
      urgente: false,
      base_urgenza: "dedotto",
      priorita: "media",
      motivazione: "Motivazione.",
      titolo_situazione: titolo,
      descrizione_situazione: null,
      evidenze: [],
    },
  });
}

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
    const pertinente = ricavi || costi;
    return {
      output: {
        richieste: [],
        collegamenti: dati.situazioni_candidate.map((c: { alias: string }) => ({
          candidato: c.alias,
          pertinente: true,
          confidenza: 0.7,
          motivazione: "Stesso interlocutore.",
          evidenze: [],
        })),
        valutazioni:
          attesa && pertinente
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

async function richiestaInviata(casella: ReturnType<Scenario["casella"]>) {
  s.orologio.avanza(ORA);
  casella.ricevi({
    da: "anna@esempio.it",
    a: ["marco@cliente.it"],
    oggetto: "Dati",
    testo: "Ciao Marco, puoi mandarmi i dati di agosto (ricavi e costi)?",
    il: s.orologio.ora(),
    thread: "t-richiesta",
  });
  await sincronizza();
}

describe("riapertura di un'Attesa chiusa dall'AI (§10.3)", () => {
  it("R1 completa chiude; la correzione la riapre; la rianalisi di R1 non la richiude; R2 completa la richiude", async () => {
    const { utente, casella } = await preparaUtente();
    s.modelli
      .quando("classificazione_priorita", classificazione())
      .quando("estrazione_attivita", () => ({ output: { elementi: [], titolo_situazione: null, descrizione_situazione: null } }))
      .quando("attese_risposte", scriptAtteseRisposte());
    await richiestaInviata(casella);

    const [situazioneId] = await s.perUtente(utente, (ctx) => operativo.idSituazioniVisibili(ctx));
    let v = (await s.perUtente(utente, (ctx) => vistaSituazione(s.dip, ctx, situazioneId!)))!;
    expect(v.situazione.titolo).toBe("Dati di agosto");
    expect(v.attese).toHaveLength(1);
    expect(v.attese[0]!.stato).toBe("aperta");
    expect(v.attese[0]!.proposta).toBe(true);
    const attesaId = v.attese[0]!.id;

    // R1: risposta completa in un altro thread.
    s.orologio.avanza(ORA);
    casella.ricevi({ da: "marco@cliente.it", a: ["anna@esempio.it"], oggetto: "agosto", testo: "Ricavi: 10.000\nCosti: 4.000", il: s.orologio.ora(), thread: "t-r1" });
    await sincronizza();
    v = (await s.perUtente(utente, (ctx) => vistaSituazione(s.dip, ctx, situazioneId!)))!;
    let attesa = v.attese[0]!;
    expect(attesa.stato).toBe("soddisfatta");
    expect(attesa.chiusaDa).toBe("ai");
    expect(attesa.risposte).toHaveLength(1);
    const r1 = attesa.risposte[0]!;
    expect(attesa.rispostaDiChiusura).toBe(r1.id);
    expect(r1.valutazione).toBe("completa");
    expect(r1.requisiti.every((q) => q.evidenze.every((e) => e.verificata))).toBe(true);
    expect(attesa.requisiti.every((q) => q.soddisfatto)).toBe(true);
    // La chiusura dell'AI resta visibile in Risposte arrivate.
    let home = await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx));
    expect(home.aree.risposte_arrivate.map((c) => c.id)).toEqual([situazioneId]);
    expect(home.aree.risposte_arrivate[0]!.prossimaAzione).toMatchObject({
      tipo: "rivedi_risposta",
      rispostaId: r1.id,
      oggettoAttesa: "Dati di agosto",
      valutazione: "completa",
      valutazioneCorretta: false,
    });

    // L'utente corregge la valutazione: l'Attesa si riapre.
    const correzione = await s.perUtente(utente, (ctx) => correggiValutazione(s.dip, ctx, r1.id, "non_pertinente"));
    expect(correzione.codice).toBe("ok");
    v = (await s.perUtente(utente, (ctx) => vistaSituazione(s.dip, ctx, situazioneId!)))!;
    attesa = v.attese[0]!;
    expect(attesa.stato).toBe("aperta");
    expect(attesa.chiusaDa).toBeNull();
    expect(attesa.risposte[0]!.valutazione).toBe("non_pertinente");
    expect(attesa.risposte[0]!.valutazioneAi).toBe("completa");
    expect(v.eventi.map((e) => e.tipo)).toContain("valutazione_corretta");
    // In home la valutazione corretta non è presentata come dell'AI.
    home = await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx));
    expect(home.aree.risposte_arrivate[0]?.prossimaAzione).toMatchObject({ tipo: "rivedi_risposta", valutazione: "non_pertinente", valutazioneCorretta: true });

    // La rianalisi (riconciliazione ripetuta) di R1 non la richiude.
    const r1Email = r1.emailId;
    await s.perUtente(utente, async (ctx) => {
      await riconciliazione.rimettiInCoda(ctx, [r1Email]);
      await ctx.coda.accoda("riconcilia_utente", { utenteId: utente }, opzioniRiconciliazione(utente));
    });
    await s.eseguiJob();
    v = (await s.perUtente(utente, (ctx) => vistaSituazione(s.dip, ctx, situazioneId!)))!;
    expect(v.attese[0]!.stato).toBe("aperta");

    // R1 vista: esce da Risposte arrivate; resta In attesa.
    expect((await s.perUtente(utente, (ctx) => segnaRispostaVista(s.dip, ctx, r1.id))).codice).toBe("ok");
    home = await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx));
    expect(home.aree.in_attesa.map((c) => c.id)).toEqual([situazioneId]);
    expect(home.aree.risposte_arrivate).toHaveLength(0);

    // R2: una nuova risposta completa richiude l'Attesa.
    s.orologio.avanza(ORA);
    casella.ricevi({ da: "marco@cliente.it", a: ["anna@esempio.it"], oggetto: "dati corretti", testo: "Ricavi: 11.000\nCosti: 4.500", il: s.orologio.ora(), thread: "t-r2" });
    await sincronizza();
    v = (await s.perUtente(utente, (ctx) => vistaSituazione(s.dip, ctx, situazioneId!)))!;
    attesa = v.attese[0]!;
    expect(attesa.id).toBe(attesaId);
    expect(attesa.stato).toBe("soddisfatta");
    expect(attesa.chiusaDa).toBe("ai");
    const r2 = attesa.risposte.find((r) => r.id !== r1.id)!;
    expect(attesa.rispostaDiChiusura).toBe(r2.id);
    expect(attesa.risposte.find((r) => r.id === r1.id)!.valutazione).toBe("non_pertinente");

    // Elenco della posta a pagine: nessun duplicato, nessuna email persa.
    const pagina1 = await s.perUtente(utente, (ctx) => elencoPosta(s.dip, ctx, { limite: 2 }));
    expect(pagina1.email).toHaveLength(2);
    expect(pagina1.cursore).not.toBeNull();
    const pagina2 = await s.perUtente(utente, (ctx) => elencoPosta(s.dip, ctx, { limite: 2, prima: pagina1.cursore! }));
    expect(pagina2.cursore).toBeNull();
    const tutte = [...pagina1.email, ...pagina2.email];
    expect(new Set(tutte.map((e) => e.id)).size).toBe(3);
    expect(tutte.map((e) => e.oggetto)).toEqual(["dati corretti", "agosto", "Dati"]);
    expect(tutte[0]!.caselle).toEqual([{ casellaId: expect.any(String), indirizzo: "anna@esempio.it" }]);
  });
});

describe("rifiuto di un collegamento proposto dall'AI (§10.2)", () => {
  it("sposta gli elementi nella Situazione dell'email e non viene riproposto dopo la nuova riconciliazione", async () => {
    const { utente, casella } = await preparaUtente();
    s.modelli
      .quando("classificazione_priorita", classificazione("operativa", "Revisione contratto"))
      .quando("estrazione_attivita", (dati) =>
        dati.email.testo.includes("contratto")
          ? {
              output: {
                elementi: [
                  {
                    esito: "nuovo",
                    riferimento: null,
                    descrizione: "Rivedere il contratto",
                    scadenza_iso: null,
                    scadenza_citazione: null,
                    priorita: "media",
                    urgente: false,
                    base: "rilevato",
                    evidenze: [{ email: "e1", citazione: "puoi rivedere il contratto" }],
                  },
                ],
                titolo_situazione: null,
                descrizione_situazione: null,
              },
            }
          : { output: { elementi: [], titolo_situazione: null, descrizione_situazione: null } },
      )
      .quando("attese_risposte", scriptAtteseRisposte());
    await richiestaInviata(casella);
    const [s1] = await s.perUtente(utente, (ctx) => operativo.idSituazioniVisibili(ctx));

    s.orologio.avanza(ORA);
    casella.ricevi({ da: "marco@cliente.it", a: ["anna@esempio.it"], oggetto: "Contratto", testo: "Ciao Anna, puoi rivedere il contratto?", il: s.orologio.ora(), thread: "t-contratto" });
    await sincronizza();

    let v1 = (await s.perUtente(utente, (ctx) => vistaSituazione(s.dip, ctx, s1!)))!;
    const proposto = v1.collegamenti.find((c) => c.origine === "ai")!;
    expect(proposto.stato).toBe("proposto");
    const emailM = proposto.emailId;
    expect(v1.attivita.map((a) => a.descrizione)).toEqual(["Rivedere il contratto"]);
    expect(v1.stato.haProposte).toBe(true);

    const chiamatePrima = s.modelli.chiamateDi("attese_risposte").length;
    const esito = await s.perUtente(utente, (ctx) => rifiutaCollegamento(s.dip, ctx, proposto.id));
    expect(esito.codice).toBe("ok");
    // Nella stessa transazione l'email torna al riconciliatore.
    expect(s.coda.pendenti.map((j) => j.nome)).toContain("riconcilia_utente");
    await s.eseguiJob();

    v1 = (await s.perUtente(utente, (ctx) => vistaSituazione(s.dip, ctx, s1!)))!;
    expect(v1.attivita).toHaveLength(0);
    expect(v1.collegamenti.find((c) => c.emailId === emailM)?.stato).toBe("rifiutato");
    expect(v1.attese[0]!.risposte.filter((r) => r.emailId === emailM && r.statoCollegamento !== "rifiutato")).toHaveLength(0);
    expect(v1.eventi.map((e) => e.tipo)).toContain("collegamento_rifiutato");

    const propria = await s.perUtente(utente, (ctx) => operativo.situazionePerOrigine(ctx, emailM));
    expect(propria).not.toBeNull();
    expect(propria).not.toBe(s1);
    const v2 = (await s.perUtente(utente, (ctx) => vistaSituazione(s.dip, ctx, propria!)))!;
    expect(v2.situazione.titolo).toBe("Revisione contratto");
    expect(v2.attivita.map((a) => a.descrizione)).toEqual(["Rivedere il contratto"]);

    // Il rifiuto resta come vincolo negativo: nessun collegamento non rifiutato tra l'email e S1.
    const collegamenti = await s.perUtente(utente, (ctx) => operativo.collegamentiDellEmail(ctx, emailM));
    expect(collegamenti.filter((c) => c.situazioneId === s1 && c.stato !== "rifiutato")).toHaveLength(0);
    for (const chiamata of s.modelli.chiamateDi("attese_risposte").slice(chiamatePrima)) {
      expect(chiamata.dati.situazioni_candidate.map((c: { titolo: string }) => c.titolo)).not.toContain("Dati di agosto");
    }

    const home = await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx));
    const card = Object.values(home.aree).flat();
    expect(card.map((c) => c.id).sort()).toEqual([s1, propria].sort());

    // L'annullamento ricongiunge gli elementi alla Situazione di partenza.
    if (esito.codice !== "ok") throw new Error("atteso ok");
    expect((await s.perUtente(utente, (ctx) => annullaCorrezioni(s.dip, ctx, esito.correzioni))).codice).toBe("ok");
    const dopo = (await s.perUtente(utente, (ctx) => vistaSituazione(s.dip, ctx, s1!)))!;
    expect(dopo.attivita.map((a) => a.descrizione)).toEqual(["Rivedere il contratto"]);
    expect(dopo.collegamenti.find((c) => c.emailId === emailM)?.stato).toBe("proposto");
    // La riconciliazione successiva riassorbe la Situazione rimasta vuota: nessuna Situazione fantasma.
    await s.eseguiJob();
    const emailDopo = (await s.perUtente(utente, (ctx) => vistaEmail(s.dip, ctx, emailM)))!;
    expect(emailDopo.situazioni.map((x) => x.situazioneId)).toEqual([s1]);
  });

  it("confermare e scartare le proposte cambia i valori effettivi; un id di un altro utente non si trova", async () => {
    const { utente, casella } = await preparaUtente();
    const altro = await s.creaUtente("bruno@esempio.it");
    s.modelli
      .quando("classificazione_priorita", classificazione())
      .quando("estrazione_attivita", () => ({ output: { elementi: [], titolo_situazione: null, descrizione_situazione: null } }))
      .quando("attese_risposte", scriptAtteseRisposte());
    await richiestaInviata(casella);
    const [s1] = await s.perUtente(utente, (ctx) => operativo.idSituazioniVisibili(ctx));
    const v = (await s.perUtente(utente, (ctx) => vistaSituazione(s.dip, ctx, s1!)))!;
    const attesaId = v.attese[0]!.id;

    expect((await s.perUtente(altro, (ctx) => confermaElemento(s.dip, ctx, { tipo: "attesa", id: attesaId }))).codice).toBe("non_trovato");
    expect(await s.perUtente(altro, (ctx) => vistaSituazione(s.dip, ctx, s1!))).toBeNull();

    expect((await s.perUtente(utente, (ctx) => confermaElemento(s.dip, ctx, { tipo: "attesa", id: attesaId }))).codice).toBe("ok");
    expect((await s.perUtente(utente, (ctx) => confermaElemento(s.dip, ctx, { tipo: "attesa", id: attesaId }))).codice).toBe("nessuna_modifica");
    let dopo = (await s.perUtente(utente, (ctx) => vistaSituazione(s.dip, ctx, s1!)))!;
    expect(dopo.attese[0]).toMatchObject({ ciclo: "confermata", proposta: false, confermata: true, stato: "aperta" });

    const scarto = await s.perUtente(utente, (ctx) => scartaElemento(s.dip, ctx, { tipo: "attesa", id: attesaId }));
    expect(scarto.codice).toBe("ok");
    dopo = (await s.perUtente(utente, (ctx) => vistaSituazione(s.dip, ctx, s1!)))!;
    expect(dopo.attese[0]!.stato).toBe("annullata");
    expect(dopo.stato.attiva).toBe(false);
    const home = await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx));
    expect(Object.values(home.aree).flat()).toHaveLength(0);

    if (scarto.codice !== "ok") throw new Error("atteso ok");
    await s.perUtente(utente, (ctx) => annullaCorrezioni(s.dip, ctx, scarto.correzioni));
    dopo = (await s.perUtente(utente, (ctx) => vistaSituazione(s.dip, ctx, s1!)))!;
    expect(dopo.attese[0]).toMatchObject({ ciclo: "confermata", stato: "aperta" });
  });
});

describe("correzione della categoria e della lingua", () => {
  it("spostare un'email fuori dalle News avvia l'estrazione; riportarla nelle News supera gli elementi non toccati", async () => {
    const { utente, casella } = await preparaUtente();
    s.modelli
      .quando("classificazione_priorita", classificazione("news"))
      .quando("estrazione_attivita", () => ({
        output: {
          elementi: [
            {
              esito: "nuovo",
              riferimento: null,
              descrizione: "Iscriversi al webinar",
              scadenza_iso: null,
              scadenza_citazione: null,
              priorita: "bassa",
              urgente: false,
              base: "rilevato",
              evidenze: [{ email: "e1", citazione: "Iscriviti al webinar" }],
            },
          ],
          titolo_situazione: "Webinar di ottobre",
          descrizione_situazione: null,
        },
      }))
      .quando("attese_risposte", scriptAtteseRisposte());

    s.orologio.avanza(ORA);
    casella.ricevi({ da: "news@rivista.it", a: ["anna@esempio.it"], oggetto: "Novità di ottobre", testo: "Iscriviti al webinar di ottobre.", il: s.orologio.ora() });
    await sincronizza();
    expect(s.modelli.chiamateDi("estrazione_attivita")).toHaveLength(0);
    const [emailId] = await s.perUtente(utente, async (ctx) => (await posta.elenco(ctx, { limite: 5 })).map((e) => e.id));
    const prima = await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx));
    expect(Object.values(prima.aree).flat()).toHaveLength(0);
    expect(prima.news.membri.map((m) => m.emailId)).toEqual([emailId]);
    expect(prima.news.nonIncluse).toEqual([emailId]);

    const fuori = await s.perUtente(utente, (ctx) => cambiaCategoria(s.dip, ctx, emailId!, "operativa"));
    expect(fuori.codice).toBe("ok");
    // L'appartenenza alle News è cambiata: la rigenerazione del riepilogo è programmata.
    expect(s.coda.pendenti.some((j) => j.nome === "aggiorna_riepilogo_news" && j.chiave === `news:${utente}`)).toBe(true);
    const stati = await s.perUtente(utente, (ctx) => posta.statiFunzione(ctx, emailId!));
    expect(stati.estrazione_attivita?.stato).toBe("da_eseguire");
    expect(s.coda.pendenti.map((j) => j.nome)).toContain("analizza_email");
    await s.eseguiJob();
    expect(s.modelli.chiamateDi("estrazione_attivita")).toHaveLength(1);

    let home = await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx));
    expect(home.news.vuoto).toBe(true);
    expect(home.aree.da_fare).toHaveLength(1);
    expect(home.aree.da_fare[0]!.prossimaAzione).toMatchObject({ tipo: "attivita", descrizione: "Iscriversi al webinar" });
    const email = (await s.perUtente(utente, (ctx) => vistaEmail(s.dip, ctx, emailId!)))!;
    expect(email.classificazione).toMatchObject({ categoria: "operativa", categoriaAi: "news" });
    expect(email.situazioni).toHaveLength(1);

    const dentro = await s.perUtente(utente, (ctx) => cambiaCategoria(s.dip, ctx, emailId!, "news"));
    expect(dentro.codice).toBe("ok");
    home = await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx));
    expect(Object.values(home.aree).flat()).toHaveLength(0);

    // Annullare il ritorno nelle News ripristina l'Attività senza nuove chiamate al modello.
    if (dentro.codice !== "ok") throw new Error("atteso ok");
    await s.perUtente(utente, (ctx) => annullaCorrezioni(s.dip, ctx, dentro.correzioni));
    await s.eseguiJob();
    home = await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx));
    expect(home.aree.da_fare).toHaveLength(1);
    expect(s.modelli.chiamateDi("estrazione_attivita")).toHaveLength(1);
  });

  it("rendere urgente un'email senza Situazione ne fa nascere una in Urgente", async () => {
    const { utente, casella } = await preparaUtente();
    s.modelli.quando("classificazione_priorita", classificazione("operativa")).quando("estrazione_attivita", () => ({
      output: { elementi: [], titolo_situazione: null, descrizione_situazione: null },
    }));
    s.orologio.avanza(ORA);
    casella.ricevi({ da: "capo@esempio.org", a: ["anna@esempio.it"], oggetto: "Chiamami", testo: "Chiamami appena puoi.", il: s.orologio.ora() });
    await sincronizza();
    const [emailId] = await s.perUtente(utente, async (ctx) => (await posta.elenco(ctx, { limite: 5 })).map((e) => e.id));
    expect(Object.values((await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx))).aree).flat()).toHaveLength(0);

    expect((await s.perUtente(utente, (ctx) => cambiaUrgenza(s.dip, ctx, emailId!, true))).codice).toBe("ok");
    await s.eseguiJob();
    const home = await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx));
    expect(home.aree.urgente).toHaveLength(1);
    expect(home.aree.urgente[0]).toMatchObject({ motivoUrgenza: "email_urgente", prossimaAzione: { tipo: "gestisci_urgenza" } });
    expect((await s.perUtente(utente, (ctx) => vistaEmail(s.dip, ctx, emailId!)))!.classificazione).toMatchObject({ urgente: true, urgenteAi: false });

    expect((await s.perUtente(utente, (ctx) => cambiaUrgenza(s.dip, ctx, emailId!, false))).codice).toBe("ok");
    expect(Object.values((await s.perUtente(utente, (ctx) => vistaHome(s.dip, ctx))).aree).flat()).toHaveLength(0);
  });

  it("la lingua corretta dall'utente cambia la fonte e l'annullamento ripristina quella rilevata", async () => {
    const { utente, casella } = await preparaUtente();
    s.modelli.quando("classificazione_priorita", classificazione("informativa")).quando("estrazione_attivita", () => ({
      output: { elementi: [], titolo_situazione: null, descrizione_situazione: null },
    }));
    s.orologio.avanza(ORA);
    casella.ricevi({ da: "info@esempio.org", a: ["anna@esempio.it"], oggetto: "Ok", testo: "Ok, thanks!", il: s.orologio.ora() });
    await sincronizza();
    const [emailId] = await s.perUtente(utente, async (ctx) => (await posta.elenco(ctx, { limite: 5 })).map((e) => e.id));

    expect((await s.perUtente(utente, (ctx) => cambiaLingua(s.dip, ctx, emailId!, "xx yy"))).codice).toBe("non_valido");
    const esito = await s.perUtente(utente, (ctx) => cambiaLingua(s.dip, ctx, emailId!, "EN"));
    expect(esito.codice).toBe("ok");
    let email = (await s.perUtente(utente, (ctx) => vistaEmail(s.dip, ctx, emailId!)))!;
    expect(email.lingua).toEqual({ valore: "en", fonte: "utente", corretta: true });

    if (esito.codice !== "ok") throw new Error("atteso ok");
    await s.perUtente(utente, (ctx) => annullaCorrezioni(s.dip, ctx, esito.correzioni));
    email = (await s.perUtente(utente, (ctx) => vistaEmail(s.dip, ctx, emailId!)))!;
    expect(email.lingua).toEqual({ valore: "it", fonte: "rilevata", corretta: false });
  });
});
