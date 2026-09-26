import { describe, expect, it } from "vitest";
import {
  DOMINI_POSTA_PUBBLICA,
  dominioDi,
  normalizzaIndirizzo,
  normalizzaOggetto,
  punteggioCandidato,
  selezionaCandidati,
  somiglianzaTrigrammi,
  togliPrefissiOggetto,
} from "../src/dominio/correlazione";
import { ore } from "./costruttori";

describe("indirizzi e domini", () => {
  it("normalizza gli indirizzi", () => {
    expect(normalizzaIndirizzo("  Marco.Rossi@Cliente.IT ")).toBe("marco.rossi@cliente.it");
  });

  it("estrae il dominio normalizzato, o null se manca", () => {
    expect(dominioDi(" marco@Cliente.it ")).toBe("cliente.it");
    expect(dominioDi("strano@a@b.it")).toBe("b.it");
    expect(dominioDi("senza-chiocciola")).toBeNull();
    expect(dominioDi("vuoto@")).toBeNull();
  });

  it("conosce i domini di posta pubblica", () => {
    for (const d of ["gmail.com", "googlemail.com", "outlook.com", "hotmail.it", "libero.it", "proton.me", "icloud.com", "mail.com"]) {
      expect(DOMINI_POSTA_PUBBLICA.has(d)).toBe(true);
    }
    expect(DOMINI_POSTA_PUBBLICA.has("cliente.it")).toBe(false);
  });
});

describe("normalizzaOggetto", () => {
  it("toglie prefissi di risposta e inoltro ripetuti, in più lingue", () => {
    expect(normalizzaOggetto("RE: R: Fwd:  Report   Agosto ")).toBe("report agosto");
    expect(normalizzaOggetto("AW: WG: Angebot")).toBe("angebot");
    expect(normalizzaOggetto("I: Inoltro: Rif: FW: dati")).toBe("dati");
    expect(normalizzaOggetto("Re[2]: Re (3): Fw: dati")).toBe("dati");
    expect(normalizzaOggetto("RE : dati")).toBe("dati");
  });

  it("non tocca parole che iniziano come un prefisso né prefissi a metà oggetto", () => {
    expect(normalizzaOggetto("Report: dati")).toBe("report: dati");
    expect(normalizzaOggetto("Richiesta re: dati")).toBe("richiesta re: dati");
    expect(normalizzaOggetto("Iscrizione")).toBe("iscrizione");
  });

  it("togliPrefissiOggetto conserva maiuscole e spazi interni", () => {
    expect(togliPrefissiOggetto("RE: Fwd: Report  Agosto")).toBe("Report  Agosto");
  });
});

describe("somiglianzaTrigrammi", () => {
  it("vale 1 per oggetti uguali a meno di prefissi e maiuscole", () => {
    expect(somiglianzaTrigrammi("Re: Report agosto", "REPORT AGOSTO")).toBe(1);
  });

  it("vale 0 per oggetti senza trigrammi in comune o vuoti", () => {
    expect(somiglianzaTrigrammi("abc", "xyz")).toBe(0);
    expect(somiglianzaTrigrammi("", "")).toBe(0);
    expect(somiglianzaTrigrammi("Re:", "Fwd:")).toBe(0);
  });

  it("è simmetrica e cresce con la sovrapposizione", () => {
    const vicina = somiglianzaTrigrammi("Report vendite agosto", "Report vendite agosto 2026");
    const lontana = somiglianzaTrigrammi("Report vendite agosto", "Cena di squadra");
    expect(vicina).toBe(somiglianzaTrigrammi("Report vendite agosto 2026", "Report vendite agosto"));
    expect(vicina).toBeGreaterThan(0.5);
    expect(vicina).toBeLessThan(1);
    expect(lontana).toBeLessThan(vicina);
  });
});

describe("punteggioCandidato", () => {
  const utente = new Set(["io@studio.it", "Gabriele@Gmail.com"]);
  const contesto = { indirizziUtente: utente };
  const email = {
    mittente: "anna@fornitore.it",
    destinatari: ["io@studio.it"],
    oggetto: "Offerta",
    references: [],
    inReplyTo: null,
  };
  const candidato = {
    situazioneId: "s1",
    partecipanti: ["io@studio.it", "luca@altro.it"],
    messageIds: ["<m1@altro.it>"],
    oggetti: ["Cena di squadra"],
    ultimaAttivita: ore(0),
  };

  it("senza segnali vale 0", () => {
    expect(punteggioCandidato(email, candidato, contesto)).toBe(0);
  });

  it("gli indirizzi dell'utente non contano come partecipanti in comune", () => {
    const soloUtente = { ...candidato, partecipanti: ["IO@studio.it", "gabriele@gmail.com"] };
    expect(punteggioCandidato({ ...email, destinatari: ["io@studio.it", "gabriele@gmail.com"] }, soloUtente, contesto)).toBe(0);
  });

  it("ogni segnale da solo basta, e i riferimenti pesano più dei partecipanti, che pesano più di dominio e oggetto", () => {
    const riferimenti = punteggioCandidato({ ...email, inReplyTo: " <m1@altro.it> " }, candidato, contesto);
    const references = punteggioCandidato({ ...email, references: ["m1@altro.it"] }, candidato, contesto);
    const partecipante = punteggioCandidato(email, { ...candidato, partecipanti: ["Anna@Fornitore.it"] }, contesto);
    const dominio = punteggioCandidato(email, { ...candidato, partecipanti: ["paolo@fornitore.it"] }, contesto);
    const oggetto = punteggioCandidato({ ...email, oggetto: "Re: Cena di squadra" }, candidato, contesto);

    for (const p of [riferimenti, references, partecipante, dominio, oggetto]) expect(p).toBeGreaterThan(0);
    expect(references).toBe(riferimenti);
    expect(riferimenti).toBeGreaterThan(partecipante);
    expect(partecipante).toBeGreaterThan(dominio);
    expect(partecipante).toBeGreaterThan(oggetto);
  });

  it("i segnali si sommano senza superare 1", () => {
    const tutti = punteggioCandidato(
      { ...email, oggetto: "Cena di squadra", inReplyTo: "<m1@altro.it>" },
      { ...candidato, partecipanti: ["anna@fornitore.it"] },
      contesto,
    );
    const soloRiferimenti = punteggioCandidato({ ...email, inReplyTo: "<m1@altro.it>" }, candidato, contesto);
    expect(tutti).toBeGreaterThan(soloRiferimenti);
    expect(tutti).toBeLessThanOrEqual(1);
  });

  it("il dominio non conta se è di posta pubblica o dell'utente", () => {
    const pubblico = { ...email, mittente: "anna@gmail.com" };
    expect(punteggioCandidato(pubblico, { ...candidato, partecipanti: ["paolo@gmail.com"] }, contesto)).toBe(0);
    const collega = { ...email, mittente: "sara@studio.it" };
    expect(punteggioCandidato(collega, { ...candidato, partecipanti: ["piero@studio.it"] }, contesto)).toBe(0);
  });

  it("un oggetto poco simile non conta", () => {
    expect(punteggioCandidato({ ...email, oggetto: "Cena aziendale di fine anno" }, candidato, contesto)).toBe(0);
  });

  it("un blocco citato o inoltrato che nomina un partecipante o l'oggetto del candidato conta", () => {
    const partecipanteCitato = { ...email, testoCitato: "Il giorno lun, Luca <LUCA@altro.it> ha scritto: ..." };
    expect(punteggioCandidato(partecipanteCitato, candidato, contesto)).toBeGreaterThan(0);
    const oggettoCitato = { ...email, testoCitato: "---------- Forwarded message ---------\nSubject: Cena di  squadra" };
    expect(punteggioCandidato(oggettoCitato, candidato, contesto)).toBeGreaterThan(0);
    const utenteCitato = { ...email, testoCitato: "io@studio.it ha scritto: ok" };
    expect(punteggioCandidato(utenteCitato, candidato, contesto)).toBe(0);
  });
});

describe("selezionaCandidati", () => {
  const ora = ore(24 * 100);
  const indirizziUtente = new Set(["io@studio.it"]);
  const email = { mittente: "anna@fornitore.it", destinatari: ["io@studio.it"], oggetto: "Offerta", references: [], inReplyTo: null };
  const candidato = (situazioneId: string, altro: { partecipanti?: string[]; ultimaAttivita?: Date; messageIds?: string[] } = {}) => ({
    situazioneId,
    partecipanti: altro.partecipanti ?? ["anna@fornitore.it"],
    messageIds: altro.messageIds ?? [],
    oggetti: [],
    ultimaAttivita: altro.ultimaAttivita ?? ora,
  });

  it("scarta punteggio zero, esclusi e Situazioni ferme da più di 60 giorni", () => {
    const esito = selezionaCandidati(
      email,
      [
        candidato("s-zero", { partecipanti: ["altro@x.it"] }),
        candidato("s-esclusa"),
        candidato("s-vecchia", { ultimaAttivita: new Date(ora.getTime() - 60 * 86_400_000 - 1) }),
        candidato("s-limite", { ultimaAttivita: new Date(ora.getTime() - 60 * 86_400_000) }),
      ],
      { ora, indirizziUtente, esclusi: new Set(["s-esclusa"]) },
    );
    expect(esito.map((c) => c.situazioneId)).toEqual(["s-limite"]);
  });

  it("ordina per punteggio e poi per id, al massimo 10", () => {
    const candidati = Array.from({ length: 12 }, (_, i) => candidato(`s${String(i).padStart(2, "0")}`)).reverse();
    candidati.push(candidato("s-forte", { messageIds: ["m1"] }));
    const esito = selezionaCandidati({ ...email, inReplyTo: "m1" }, candidati, { ora, indirizziUtente });
    expect(esito).toHaveLength(10);
    expect(esito.map((c) => c.situazioneId)).toEqual(["s-forte", "s00", "s01", "s02", "s03", "s04", "s05", "s06", "s07", "s08"]);
    expect(esito[0]!.punteggio).toBeGreaterThan(esito[1]!.punteggio);
  });

  it("accetta orizzonte e massimo diversi", () => {
    const candidati = [candidato("a", { ultimaAttivita: ore(-24 * 10, ora) }), candidato("b")];
    expect(selezionaCandidati(email, candidati, { ora, indirizziUtente, orizzonteGiorni: 5 }).map((c) => c.situazioneId)).toEqual(["b"]);
    expect(selezionaCandidati(email, candidati, { ora, indirizziUtente, massimo: 1 }).map((c) => c.situazioneId)).toEqual(["a"]);
  });
});
