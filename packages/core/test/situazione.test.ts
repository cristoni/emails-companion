import { describe, expect, it } from "vitest";
import {
  derivaVistaSituazione,
  ordinaVisteSituazioni,
  sollecitoConsigliato,
  type VistaSituazione,
} from "../src/dominio/situazione";
import type { Attesa, Attivita, RispostaArrivata } from "../src/dominio/entita";
import type { StatoAttesa } from "../src/dominio/tipi";
import { attesa, attivita, correzione, ore, risposta, situazione } from "./costruttori";

const ORA = ore(100);
const suSituazione = { tipo: "situazione", id: "s1" } as const;

function vista(altro: {
  attivita?: Attivita[];
  attese?: { attesa: Attesa; stato: StatoAttesa }[];
  risposte?: RispostaArrivata[];
  segnaliUrgenza?: { emailId: string; ricevutaIl: Date; urgente: boolean }[];
  correzioni?: Parameters<typeof derivaVistaSituazione>[0]["correzioni"];
  gestitaIl?: Date | null;
  archiviataIl?: Date | null;
  oreScadenzaUrgente?: number;
}) {
  return derivaVistaSituazione({
    situazione: situazione({ gestitaIl: altro.gestitaIl ?? null, archiviataIl: altro.archiviataIl ?? null }),
    attivita: altro.attivita ?? [],
    attese: altro.attese ?? [],
    risposte: altro.risposte ?? [],
    segnaliUrgenza: altro.segnaliUrgenza ?? [],
    correzioni: altro.correzioni ?? [],
    ora: ORA,
    ...(altro.oreScadenzaUrgente === undefined ? {} : { oreScadenzaUrgente: altro.oreScadenzaUrgente }),
  });
}

describe("derivaVistaSituazione: aree", () => {
  it("senza elementi aperti la Situazione è conclusa", () => {
    expect(vista({})).toEqual({
      attiva: false,
      archiviata: false,
      aree: [],
      areaPrincipale: null,
      urgente: false,
      motivoUrgenza: null,
      emailUrgente: null,
      prossimaAzione: { tipo: "nessuna" },
      haProposte: false,
      scadenzaPiuVicina: null,
      prioritaMassima: null,
    });
  });

  it("un'Attività proposta o confermata è Da fare, e una proposta è segnalata", () => {
    const proposta = vista({ attivita: [attivita({ stato: "proposta" })] });
    expect(proposta).toMatchObject({ attiva: true, aree: ["da_fare"], areaPrincipale: "da_fare", haProposte: true });
    const confermata = vista({ attivita: [attivita({ stato: "confermata" })] });
    expect(confermata).toMatchObject({ aree: ["da_fare"], haProposte: false });
  });

  it("le Attività chiuse non sono Da fare", () => {
    for (const stato of ["completata", "scartata", "superata"] as const) {
      expect(vista({ attivita: [attivita({ stato })] }).aree).toEqual([]);
    }
  });

  it("lo stato effettivo dell'Attività segue le correzioni dell'utente", () => {
    const completata = correzione({ tipo: "attivita", id: "t1" }, "stato", "completata");
    expect(vista({ attivita: [attivita({ stato: "confermata" })], correzioni: [completata] }).aree).toEqual([]);
    const confermata = correzione({ tipo: "attivita", id: "t1" }, "stato", "confermata");
    expect(vista({ attivita: [attivita({ stato: "proposta" })], correzioni: [confermata] })).toMatchObject({
      aree: ["da_fare"],
      haProposte: false,
    });
  });

  it("una Risposta arrivata da vedere è in Risposte arrivate", () => {
    expect(vista({ risposte: [risposta({ revisione: "da_vedere" })] })).toMatchObject({
      aree: ["risposte_arrivate"],
      prossimaAzione: { tipo: "rivedi_risposta", rispostaId: "r1" },
    });
    expect(vista({ risposte: [risposta({ revisione: "vista" })] }).aree).toEqual([]);
  });

  it("revisione e collegamento effettivi della risposta seguono le correzioni", () => {
    const vista1 = correzione({ tipo: "risposta", id: "r1" }, "revisione", "vista");
    expect(vista({ risposte: [risposta()], correzioni: [vista1] }).aree).toEqual([]);
    const rifiuto = correzione({ tipo: "risposta", id: "r1" }, "statoCollegamento", "rifiutato");
    expect(vista({ risposte: [risposta()], correzioni: [rifiuto] }).aree).toEqual([]);
    expect(vista({ risposte: [risposta({ statoCollegamento: "rifiutato" })] }).aree).toEqual([]);
  });

  it("una risposta da vedere con collegamento proposto è una proposta", () => {
    expect(vista({ risposte: [risposta({ statoCollegamento: "proposto" })] }).haProposte).toBe(true);
    expect(vista({ risposte: [risposta({ statoCollegamento: "confermato" })] }).haProposte).toBe(false);
  });

  it("un'Attesa aperta o parziale, anche proposta, è In attesa", () => {
    for (const stato of ["aperta", "parziale"] as const) {
      expect(vista({ attese: [{ attesa: attesa({ ciclo: "confermata" }), stato }] }).aree).toEqual(["in_attesa"]);
    }
    expect(vista({ attese: [{ attesa: attesa({ ciclo: "proposta" }), stato: "aperta" }] })).toMatchObject({
      aree: ["in_attesa"],
      haProposte: true,
    });
  });

  it("un'Attesa soddisfatta, annullata, scartata o superata non è In attesa", () => {
    expect(vista({ attese: [{ attesa: attesa(), stato: "soddisfatta" }] }).aree).toEqual([]);
    expect(vista({ attese: [{ attesa: attesa(), stato: "annullata" }] }).aree).toEqual([]);
    expect(vista({ attese: [{ attesa: attesa({ ciclo: "scartata" }), stato: "aperta" }] }).aree).toEqual([]);
    expect(vista({ attese: [{ attesa: attesa({ ciclo: "superata" }), stato: "parziale" }] }).aree).toEqual([]);
  });

  it("elenca le aree in ordine di precedenza e sceglie la principale", () => {
    const v = vista({
      attese: [{ attesa: attesa(), stato: "aperta" }],
      attivita: [attivita({ urgente: true })],
      risposte: [risposta()],
    });
    expect(v.aree).toEqual(["urgente", "risposte_arrivate", "da_fare", "in_attesa"]);
    expect(v.areaPrincipale).toBe("urgente");
  });
});

describe("derivaVistaSituazione: urgenza", () => {
  it("l'utente può segnare urgente una Situazione", () => {
    const urgente = correzione(suSituazione, "urgente", true);
    expect(vista({ correzioni: [urgente] })).toMatchObject({
      attiva: true,
      urgente: true,
      motivoUrgenza: "utente",
      aree: ["urgente"],
      prossimaAzione: { tipo: "gestisci_urgenza" },
    });
  });

  it("anche l'urgenza segnata dall'utente si chiude con la gestione, e torna se la segna di nuovo", () => {
    const urgente = correzione(suSituazione, "urgente", true, { creataIl: ore(50) });
    expect(vista({ correzioni: [urgente], gestitaIl: ore(60) })).toMatchObject({
      urgente: false,
      attiva: false,
      prossimaAzione: { tipo: "nessuna" },
    });
    const gestita = correzione(suSituazione, "gestitaIl", ore(60), { creataIl: ore(60) });
    expect(vista({ correzioni: [urgente, gestita] }).urgente).toBe(false);
    const diNuovo = correzione(suSituazione, "urgente", true, { creataIl: ore(70) });
    expect(vista({ correzioni: [urgente, gestita, diNuovo] }).motivoUrgenza).toBe("utente");
    const segnali = [{ emailId: "e1", ricevutaIl: ore(65), urgente: true }];
    expect(vista({ correzioni: [urgente, gestita], segnaliUrgenza: segnali }).motivoUrgenza).toBe("email_urgente");
  });

  it("una correzione a non urgente non nasconde i segnali calcolati", () => {
    const nonUrgente = correzione(suSituazione, "urgente", false);
    const segnali = [{ emailId: "e1", ricevutaIl: ore(90), urgente: true }];
    expect(vista({ segnaliUrgenza: segnali, correzioni: [nonUrgente] }).motivoUrgenza).toBe("email_urgente");
  });

  it("un'email urgente rende urgente la Situazione finché non è segnata come gestita", () => {
    const segnali = [{ emailId: "e1", ricevutaIl: ore(50), urgente: true }];
    expect(vista({ segnaliUrgenza: segnali })).toMatchObject({ urgente: true, motivoUrgenza: "email_urgente" });
    expect(vista({ segnaliUrgenza: segnali, gestitaIl: ore(50) })).toMatchObject({ urgente: false, attiva: false });
    expect(vista({ segnaliUrgenza: segnali, gestitaIl: ore(49) }).urgente).toBe(true);
  });

  it("un'email non urgente non conta", () => {
    expect(vista({ segnaliUrgenza: [{ emailId: "e1", ricevutaIl: ore(50), urgente: false }] }).urgente).toBe(false);
  });

  it("una nuova email urgente dopo la gestione la rende di nuovo urgente", () => {
    const segnali = [
      { emailId: "e1", ricevutaIl: ore(10), urgente: true },
      { emailId: "e2", ricevutaIl: ore(60), urgente: true },
    ];
    expect(vista({ segnaliUrgenza: segnali, gestitaIl: ore(20) })).toMatchObject({ motivoUrgenza: "email_urgente", emailUrgente: "e2" });
  });

  it("indica l'email che rende urgente la Situazione: l'origine se conta, altrimenti la più recente", () => {
    const origine = situazione({}).emailOrigineId;
    const segnali = [
      { emailId: origine, ricevutaIl: ore(10), urgente: true },
      { emailId: "e2", ricevutaIl: ore(30), urgente: true },
      { emailId: "e3", ricevutaIl: ore(40), urgente: false },
    ];
    expect(vista({ segnaliUrgenza: segnali }).emailUrgente).toBe(origine);
    expect(vista({ segnaliUrgenza: segnali, gestitaIl: ore(20) }).emailUrgente).toBe("e2");
    expect(vista({ segnaliUrgenza: segnali, gestitaIl: ore(35) })).toMatchObject({ urgente: false, emailUrgente: null });
    // Con un altro motivo non c'è un'email urgente da indicare.
    const segnata = correzione(suSituazione, "urgente", true, { creataIl: ore(50) });
    expect(vista({ segnaliUrgenza: segnali, correzioni: [segnata] })).toMatchObject({ motivoUrgenza: "utente", emailUrgente: null });
  });

  it("gestitaIl effettivo segue la correzione dell'utente, anche come testo ISO", () => {
    const segnali = [{ emailId: "e1", ricevutaIl: ore(50), urgente: true }];
    const gestita = correzione(suSituazione, "gestitaIl", ore(60));
    expect(vista({ segnaliUrgenza: segnali, correzioni: [gestita] }).urgente).toBe(false);
    const gestitaTesto = correzione(suSituazione, "gestitaIl", ore(60).toISOString());
    expect(vista({ segnaliUrgenza: segnali, correzioni: [gestitaTesto] }).urgente).toBe(false);
    const revocata = correzione(suSituazione, "gestitaIl", ore(60), { revocataIl: ore(61) });
    expect(vista({ segnaliUrgenza: segnali, correzioni: [revocata] }).urgente).toBe(true);
    const senzaFuso = correzione(suSituazione, "gestitaIl", "2026-09-05T13:00:00");
    expect(vista({ segnaliUrgenza: segnali, correzioni: [senzaFuso] }).urgente).toBe(true);
    const annullaGestione = correzione(suSituazione, "gestitaIl", null);
    expect(vista({ segnaliUrgenza: segnali, gestitaIl: ore(60), correzioni: [annullaGestione] }).urgente).toBe(true);
  });

  it("un'Attività aperta urgente creata dopo la gestione rende urgente la Situazione", () => {
    const urgente = attivita({ urgente: true, creataIl: ore(30) });
    expect(vista({ attivita: [urgente] }).motivoUrgenza).toBe("attivita_urgente");
    expect(vista({ attivita: [urgente], gestitaIl: ore(30) }).urgente).toBe(false);
    expect(vista({ attivita: [{ ...urgente, stato: "completata" }] }).urgente).toBe(false);
  });

  it("un'Attività aperta in scadenza entro 48 ore rende urgente la Situazione, anche se gestita", () => {
    const entro = attivita({ scadenza: ore(48, ORA) });
    expect(vista({ attivita: [entro], gestitaIl: ore(99) })).toMatchObject({ urgente: true, motivoUrgenza: "scadenza_vicina" });
    const oltre = attivita({ scadenza: new Date(ore(48, ORA).getTime() + 1) });
    expect(vista({ attivita: [oltre] }).urgente).toBe(false);
    const scaduta = attivita({ scadenza: ore(-5, ORA) });
    expect(vista({ attivita: [scaduta] }).motivoUrgenza).toBe("scadenza_vicina");
    expect(vista({ attivita: [{ ...scaduta, stato: "completata" }] }).urgente).toBe(false);
  });

  it("la soglia della scadenza vicina è configurabile", () => {
    const tra30 = attivita({ scadenza: ore(30, ORA) });
    expect(vista({ attivita: [tra30], oreScadenzaUrgente: 24 }).urgente).toBe(false);
    expect(vista({ attivita: [tra30] }).urgente).toBe(true);
  });

  it("il motivo segue la precedenza utente, email, attività, scadenza", () => {
    const segnali = [{ emailId: "e1", ricevutaIl: ore(50), urgente: true }];
    const attivitaUrgente = attivita({ urgente: true, scadenza: ore(1, ORA) });
    expect(vista({ attivita: [attivitaUrgente], segnaliUrgenza: segnali }).motivoUrgenza).toBe("email_urgente");
    expect(vista({ attivita: [attivitaUrgente] }).motivoUrgenza).toBe("attivita_urgente");
    const urgente = correzione(suSituazione, "urgente", true);
    expect(vista({ attivita: [attivitaUrgente], correzioni: [urgente] }).motivoUrgenza).toBe("utente");
  });
});

describe("derivaVistaSituazione: archiviazione", () => {
  const aperta = { attivita: [attivita({ urgente: true })], risposte: [risposta()] };

  it("una Situazione archiviata non è attiva e non compare in nessuna area", () => {
    expect(vista({ ...aperta, archiviataIl: ore(90) })).toMatchObject({
      attiva: false,
      archiviata: true,
      aree: [],
      areaPrincipale: null,
      urgente: false,
      motivoUrgenza: null,
      prossimaAzione: { tipo: "nessuna" },
    });
  });

  it("l'archiviazione e la riapertura sono correzioni", () => {
    const archivia = correzione(suSituazione, "archiviata", true);
    expect(vista({ ...aperta, correzioni: [archivia] })).toMatchObject({ archiviata: true, attiva: false });
    const riapri = correzione(suSituazione, "archiviata", false);
    expect(vista({ ...aperta, archiviataIl: ore(90), correzioni: [riapri] })).toMatchObject({
      archiviata: false,
      attiva: true,
      areaPrincipale: "urgente",
    });
  });
});

describe("derivaVistaSituazione: prossima azione e riepiloghi", () => {
  it("rivedere una risposta viene prima delle Attività, dalla più vecchia", () => {
    const v = vista({
      attivita: [attivita()],
      risposte: [risposta({ id: "r-nuova", arrivataIl: ore(80) }), risposta({ id: "r-vecchia", arrivataIl: ore(70) })],
    });
    expect(v.prossimaAzione).toEqual({ tipo: "rivedi_risposta", rispostaId: "r-vecchia" });
  });

  it("sceglie l'Attività con la scadenza più vicina, poi le senza scadenza", () => {
    const v = vista({
      attivita: [
        attivita({ id: "senza", priorita: "alta" }),
        attivita({ id: "lontana", scadenza: ore(500, ORA) }),
        attivita({ id: "vicina", scadenza: ore(200, ORA), priorita: "bassa" }),
      ],
    });
    expect(v.prossimaAzione).toEqual({ tipo: "attivita", attivitaId: "vicina", scadenza: ore(200, ORA) });
    expect(v.scadenzaPiuVicina).toEqual(ore(200, ORA));
    expect(v.prioritaMassima).toBe("alta");
  });

  it("a parità di scadenza sceglie la priorità più alta, poi la più vecchia", () => {
    const v = vista({
      attivita: [
        attivita({ id: "media", priorita: "media", creataIl: ore(1) }),
        attivita({ id: "alta-recente", priorita: "alta", creataIl: ore(3) }),
        attivita({ id: "alta-vecchia", priorita: "alta", creataIl: ore(2) }),
      ],
    });
    expect(v.prossimaAzione).toEqual({ tipo: "attivita", attivitaId: "alta-vecchia", scadenza: null });
  });

  it("ignora le Attività chiuse per scadenza, priorità e prossima azione", () => {
    const v = vista({ attivita: [attivita({ stato: "completata", scadenza: ore(1, ORA), priorita: "alta" })] });
    expect(v).toMatchObject({ scadenzaPiuVicina: null, prioritaMassima: null, prossimaAzione: { tipo: "nessuna" } });
  });

  it("consiglia un sollecito per l'Attesa oltre la data attesa, altrimenti attende", () => {
    const scaduta = attesa({ id: "w-scaduta", dataAttesa: ore(-10, ORA) });
    const futura = attesa({ id: "w-futura", dataAttesa: ore(10, ORA) });
    expect(
      vista({
        attese: [
          { attesa: futura, stato: "aperta" },
          { attesa: scaduta, stato: "parziale" },
        ],
      }).prossimaAzione,
    ).toEqual({ tipo: "sollecito", attesaId: "w-scaduta" });
    expect(vista({ attese: [{ attesa: futura, stato: "aperta" }] }).prossimaAzione).toEqual({ tipo: "attendi", attesaId: "w-futura" });
  });

  it("le Attività vengono prima dei solleciti", () => {
    const scaduta = attesa({ dataAttesa: ore(-10, ORA) });
    expect(vista({ attivita: [attivita()], attese: [{ attesa: scaduta, stato: "aperta" }] }).prossimaAzione.tipo).toBe("attivita");
  });

  it("attende l'Attesa con la data attesa più vicina, poi quelle senza data", () => {
    const senza = attesa({ id: "w-senza", dataAttesa: null });
    const tra20 = attesa({ id: "w-20", dataAttesa: ore(20, ORA) });
    const tra10 = attesa({ id: "w-10", dataAttesa: ore(10, ORA) });
    const attese = [senza, tra20, tra10].map((a) => ({ attesa: a, stato: "aperta" as const }));
    expect(vista({ attese }).prossimaAzione).toEqual({ tipo: "attendi", attesaId: "w-10" });
  });

  it("un'urgenza senza elementi aperti chiede di gestirla", () => {
    const segnali = [{ emailId: "e1", ricevutaIl: ore(50), urgente: true }];
    expect(vista({ segnaliUrgenza: segnali }).prossimaAzione).toEqual({ tipo: "gestisci_urgenza" });
  });
});

describe("sollecitoConsigliato", () => {
  const ora = ore(100);
  it("è consigliato per un'Attesa aperta o parziale oltre la data attesa", () => {
    expect(sollecitoConsigliato(attesa({ dataAttesa: ore(99) }), "aperta", ora)).toBe(true);
    expect(sollecitoConsigliato(attesa({ dataAttesa: ore(99) }), "parziale", ora)).toBe(true);
  });

  it("non è consigliato alla data esatta, senza data o per un'Attesa chiusa", () => {
    expect(sollecitoConsigliato(attesa({ dataAttesa: ora }), "aperta", ora)).toBe(false);
    expect(sollecitoConsigliato(attesa({ dataAttesa: null }), "aperta", ora)).toBe(false);
    expect(sollecitoConsigliato(attesa({ dataAttesa: ore(1) }), "soddisfatta", ora)).toBe(false);
    expect(sollecitoConsigliato(attesa({ dataAttesa: ore(1) }), "annullata", ora)).toBe(false);
  });
});

describe("ordinaVisteSituazioni", () => {
  const base: VistaSituazione = {
    attiva: true,
    archiviata: false,
    aree: ["da_fare"],
    areaPrincipale: "da_fare",
    urgente: false,
    motivoUrgenza: null,
    emailUrgente: null,
    prossimaAzione: { tipo: "nessuna" },
    haProposte: false,
    scadenzaPiuVicina: null,
    prioritaMassima: null,
  };
  const voce = (id: string, vista: Partial<VistaSituazione>, ultimaAttivita = ore(0)) => ({
    id,
    vista: { ...base, ...vista },
    ultimaAttivita,
  });

  it("ordina per area, urgenza, scadenza, priorità, attività recente e id senza modificare l'elenco", () => {
    const elenco = [
      voce("conclusa", { areaPrincipale: null, aree: [], attiva: false }),
      voce("in-attesa", { areaPrincipale: "in_attesa" }),
      voce("da-fare-vecchia", {}, ore(1)),
      voce("da-fare-b", {}, ore(5)),
      voce("da-fare-a", {}, ore(5)),
      voce("da-fare-bassa", { prioritaMassima: "bassa" }),
      voce("da-fare-alta", { prioritaMassima: "alta" }),
      voce("da-fare-lontana", { scadenzaPiuVicina: ore(300) }),
      voce("da-fare-vicina", { scadenzaPiuVicina: ore(200), prioritaMassima: "bassa" }),
      voce("da-fare-urgente", { urgente: true }),
      voce("risposte", { areaPrincipale: "risposte_arrivate" }),
      voce("urgente", { areaPrincipale: "urgente", urgente: true }),
    ];
    const copia = [...elenco];
    expect(ordinaVisteSituazioni(elenco).map((v) => v.id)).toEqual([
      "urgente",
      "risposte",
      "da-fare-urgente",
      "da-fare-vicina",
      "da-fare-lontana",
      "da-fare-alta",
      "da-fare-bassa",
      "da-fare-a",
      "da-fare-b",
      "da-fare-vecchia",
      "in-attesa",
      "conclusa",
    ]);
    expect(elenco).toEqual(copia);
  });
});
