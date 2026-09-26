import { describe, expect, it } from "vitest";
import { risolviAlias, risolviRiferimenti, validaOutput, verificaEvidenze, type OutputAtteseRisposte, type TabellaAlias } from "../src";

const classificazione = {
  categoria: "operativa",
  urgente: true,
  base_urgenza: "dedotto",
  priorita: "alta",
  motivazione: "Il cliente chiede il report per venerdì",
  titolo_situazione: "Report per il cliente",
  descrizione_situazione: "Il cliente chiede il report entro venerdì.",
  evidenze: [{ email: "e1", citazione: "entro venerdì", campo: "priorita" }],
};

describe("validaOutput", () => {
  it("accetta un output conforme e lo restituisce tipizzato", () => {
    const esito = validaOutput("classificazione_priorita", classificazione);
    expect(esito.ok).toBe(true);
    if (esito.ok) expect(esito.output.categoria).toBe("operativa");
  });

  it("rifiuta un output non conforme con percorsi e codici, senza riportare valori", () => {
    const esito = validaOutput("classificazione_priorita", { ...classificazione, categoria: "segreto-canarino", urgente: "sì" });
    expect(esito).toMatchObject({ ok: false, codice: "schema" });
    if (esito.ok) return;
    expect(esito.problemi).toEqual(expect.arrayContaining(["categoria: invalid_value", "urgente: invalid_type"]));
    expect(JSON.stringify(esito)).not.toContain("canarino");
  });

  it("riporta i vincoli di coerenza come codici propri", () => {
    const esito = validaOutput("estrazione_attivita", {
      elementi: [
        { esito: "aggiorna", riferimento: null, descrizione: null, scadenza_iso: null, scadenza_citazione: null, priorita: null, urgente: null, base: "dedotto", evidenze: [] },
      ],
      titolo_situazione: null,
      descrizione_situazione: null,
    });
    expect(esito).toEqual({ ok: false, codice: "schema", problemi: ["elementi.0.riferimento: riferimento_incoerente"] });
  });

  it("rifiuta un valore che non è un oggetto", () => {
    expect(validaOutput("bozze_assistite", "testo libero")).toMatchObject({ ok: false, codice: "schema" });
  });
});

describe("risolviAlias", () => {
  it("restituisce l'id di un alias noto", () => {
    expect(risolviAlias({ e1: "email-1" }, "e1")).toEqual({ ok: true, id: "email-1" });
  });

  it("rifiuta alias assenti, tabelle mancanti e chiavi ereditate", () => {
    for (const [tabella, alias] of [[{ e1: "x" }, "e2"], [undefined, "e1"], [{ e1: "x" }, "constructor"], [{ e1: "x" }, "__proto__"]] as const) {
      expect(risolviAlias(tabella, alias)).toEqual({ ok: false, codice: "alias_sconosciuto" });
    }
  });
});

const ev = (email = "e1") => [{ email, citazione: "ecco i dati di agosto" }];
const attese = (): OutputAtteseRisposte => ({
  richieste: [
    {
      esito: "aggiorna",
      riferimento: "w1",
      destinatari: ["marco@example.com"],
      oggetto: "Dati di agosto",
      data_attesa_iso: null,
      data_attesa_citazione: null,
      requisiti: ["dati di agosto"],
      sollecito_di: "w2",
      base: "rilevato",
      evidenze: ev(),
    },
  ],
  collegamenti: [{ candidato: "s1", pertinente: true, confidenza: 0.8, motivazione: "Stesso argomento", evidenze: ev("e2") }],
  valutazioni: [
    { attesa: "w2", valutazione: "completa", requisiti: [{ requisito: "w2r1", soddisfatto: true, evidenze: ev() }], motivazione: "Dati inviati" },
  ],
  completamenti: [{ attivita: "t1", esito: "completata", nuova_scadenza_iso: null, evidenze: ev() }],
  titolo_situazione: null,
  descrizione_situazione: null,
});

const elementoEstratto = {
  esito: "nuovo",
  riferimento: null,
  descrizione: "Inviare il report",
  scadenza_iso: null,
  scadenza_citazione: null,
  priorita: "media",
  urgente: false,
  base: "dedotto",
  evidenze: [],
};

describe("validaOutput sui riferimenti ripetuti", () => {
  it("rifiuta un elemento esistente, un candidato o un requisito citato due volte, indicando il percorso del doppione", () => {
    const o = attese();
    o.richieste.push({ ...o.richieste[0]!, esito: "non_trovato" });
    o.collegamenti.push({ ...o.collegamenti[0]!, pertinente: false });
    o.valutazioni[0]!.requisiti.push({ ...o.valutazioni[0]!.requisiti[0]!, soddisfatto: false });
    o.valutazioni.push({ ...o.valutazioni[0]!, requisiti: [], valutazione: "non_pertinente" });
    o.completamenti.push({ ...o.completamenti[0]!, esito: "non_pertinente" });
    const esito = validaOutput("attese_risposte", o);
    expect(esito.ok).toBe(false);
    if (esito.ok) return;
    expect([...esito.problemi].sort()).toEqual(
      [
        "richieste.1.riferimento: riferimento_duplicato",
        "collegamenti.1.candidato: riferimento_duplicato",
        "valutazioni.0.requisiti.1.requisito: riferimento_duplicato",
        "valutazioni.1.attesa: riferimento_duplicato",
        "completamenti.1.attivita: riferimento_duplicato",
      ].sort(),
    );
  });

  it("rifiuta due esiti per lo stesso elemento esistente ma accetta più elementi nuovi", () => {
    const esistente = { ...elementoEstratto, esito: "aggiorna", riferimento: "t1" };
    const output = (elementi: object[]) => ({ elementi, titolo_situazione: null, descrizione_situazione: null });
    expect(validaOutput("estrazione_attivita", output([esistente, { ...esistente, esito: "non_trovato" }]))).toEqual({
      ok: false,
      codice: "schema",
      problemi: ["elementi.1.riferimento: riferimento_duplicato"],
    });
    expect(validaOutput("estrazione_attivita", output([elementoEstratto, elementoEstratto, esistente])).ok).toBe(true);
  });
});

describe("risolviRiferimenti", () => {
  const tabella: TabellaAlias = {
    email: { e1: "email-1", e2: "email-2" },
    situazioni: { s1: "sit-1" },
    atteseEsistenti: { w1: "attesa-1" },
    atteseCandidate: { w2: "attesa-2", w3: "attesa-3" },
    requisiti: { w2r1: { id: "req-21", attesa: "w2" }, w3r1: { id: "req-31", attesa: "w3" } },
    attivitaCandidate: { t1: "att-1" },
  };

  const output = attese;

  it("sostituisce ogni alias con l'id del ruolo corrispondente", () => {
    const esito = risolviRiferimenti("attese_risposte", output(), tabella);
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    const o = esito.output;
    expect(o.richieste[0]).toMatchObject({ riferimento: "attesa-1", sollecito_di: "attesa-2", evidenze: [{ email: "email-1" }] });
    expect(o.collegamenti[0]).toMatchObject({ candidato: "sit-1", evidenze: [{ email: "email-2" }] });
    expect(o.valutazioni[0]).toMatchObject({ attesa: "attesa-2", requisiti: [{ requisito: "req-21", evidenze: [{ email: "email-1" }] }] });
    expect(o.completamenti[0]).toMatchObject({ attivita: "att-1" });
  });

  it("non modifica l'output ricevuto", () => {
    const originale = output();
    risolviRiferimenti("attese_risposte", originale, tabella);
    expect(originale).toEqual(output());
  });

  it("rifiuta alias sconosciuti o di un ruolo diverso", () => {
    const casi: ((o: OutputAtteseRisposte) => void)[] = [
      (o) => (o.richieste[0]!.evidenze[0]!.email = "e9"),
      (o) => (o.richieste[0]!.riferimento = "w2"),
      (o) => (o.richieste[0]!.sollecito_di = "w1"),
      (o) => (o.collegamenti[0]!.candidato = "e1"),
      (o) => (o.valutazioni[0]!.attesa = "w1"),
      (o) => (o.completamenti[0]!.attivita = "t2"),
    ];
    for (const altera of casi) {
      const o = output();
      altera(o);
      expect(risolviRiferimenti("attese_risposte", o, tabella)).toEqual({ ok: false, codice: "alias_sconosciuto" });
    }
  });

  it("rifiuta un requisito che non appartiene all'attesa valutata", () => {
    const o = output();
    o.valutazioni[0]!.requisiti[0]!.requisito = "w3r1";
    expect(risolviRiferimenti("attese_risposte", o, tabella)).toEqual({ ok: false, codice: "alias_sconosciuto" });
  });

  it("risolve i riferimenti dell'estrazione solo verso gli elementi esistenti", () => {
    const elemento = {
      esito: "non_trovato" as const,
      riferimento: "t1",
      descrizione: null,
      scadenza_iso: null,
      scadenza_citazione: null,
      priorita: null,
      urgente: null,
      base: "dedotto" as const,
      evidenze: [],
    };
    const o = { elementi: [elemento], titolo_situazione: null, descrizione_situazione: null };
    expect(risolviRiferimenti("estrazione_attivita", o, { elementiEsistenti: { t1: "att-9" } })).toMatchObject({
      ok: true,
      output: { elementi: [{ riferimento: "att-9" }] },
    });
    expect(risolviRiferimenti("estrazione_attivita", o, { attivitaCandidate: { t1: "att-9" } })).toEqual({ ok: false, codice: "alias_sconosciuto" });
  });

  it("risolve le email del riepilogo e delle evidenze della classificazione", () => {
    expect(risolviRiferimenti("riepilogo_news", { voci: [{ testo: "Novità", email: ["e2", "e1"] }] }, tabella)).toEqual({
      ok: true,
      output: { voci: [{ testo: "Novità", email: ["email-2", "email-1"] }] },
    });
    const c = validaOutput("classificazione_priorita", classificazione);
    if (!c.ok) throw new Error("fixture");
    expect(risolviRiferimenti("classificazione_priorita", c.output, tabella)).toMatchObject({ ok: true, output: { evidenze: [{ email: "email-1", campo: "priorita" }] } });
    expect(risolviRiferimenti("bozze_assistite", { oggetto: "Re: dati", corpo: "Grazie" }, {})).toEqual({ ok: true, output: { oggetto: "Re: dati", corpo: "Grazie" } });
  });
});

describe("verificaEvidenze", () => {
  const testi = { "email-1": "Ciao,\nti  mando i “dati” di agosto domani.\nMarco" };

  it("verifica le citazioni letterali e ne riporta l'intervallo", () => {
    const [evidenza] = verificaEvidenze([{ email: "email-1", citazione: 'mando i "dati" di agosto' }], testi);
    expect(evidenza).toMatchObject({ emailId: "email-1", verificata: true });
    expect(testi["email-1"].slice(evidenza!.inizio!, evidenza!.fine!)).toBe("mando i “dati” di agosto");
  });

  it("segna come non verificate le citazioni inventate o di email senza testo", () => {
    expect(verificaEvidenze([{ email: "email-1", citazione: "dati di settembre" }, { email: "email-2", citazione: "dati di agosto" }], testi)).toEqual([
      { emailId: "email-1", citazione: "dati di settembre", verificata: false, inizio: null, fine: null },
      { emailId: "email-2", citazione: "dati di agosto", verificata: false, inizio: null, fine: null },
    ]);
  });
});
