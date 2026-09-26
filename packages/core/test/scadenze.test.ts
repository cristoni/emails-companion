import { describe, expect, it } from "vitest";
import { validaScadenza } from "../src/dominio/scadenze";

const ricevutaIl = new Date("2026-09-24T15:30:00Z");
const testo = "Ciao, mi mandi il report entro venerdì 2 ottobre? Grazie";
const citazione = "entro venerdì 2 ottobre";

describe("validaScadenza", () => {
  it("accetta una data con citazione verificata, come mezzanotte UTC", () => {
    expect(validaScadenza({ iso: "2026-10-02", citazione, testo, ricevutaIl })).toEqual({
      scadenza: new Date("2026-10-02T00:00:00Z"),
      citazioneVerificata: true,
    });
  });

  it("accetta data e ora ISO complete con fuso", () => {
    expect(validaScadenza({ iso: "2026-10-02T17:00:00+02:00", citazione, testo, ricevutaIl }).scadenza).toEqual(
      new Date("2026-10-02T15:00:00Z"),
    );
    expect(validaScadenza({ iso: "2026-10-02T15:00Z", citazione, testo, ricevutaIl }).scadenza).toEqual(
      new Date("2026-10-02T15:00:00Z"),
    );
    expect(validaScadenza({ iso: "2026-10-02T15:00:00.250Z", citazione, testo, ricevutaIl }).scadenza).toEqual(
      new Date("2026-10-02T15:00:00.250Z"),
    );
  });

  it("rifiuta data e ora senza fuso, che dipenderebbero dalla macchina", () => {
    expect(validaScadenza({ iso: "2026-10-02T17:00:00", citazione, testo, ricevutaIl }).scadenza).toBeNull();
  });

  it("rifiuta date inesistenti o in formati diversi", () => {
    for (const iso of ["2026-02-30", "2026-13-01", "2026-10-02T24:00:00Z", "2026-10-02T12:60:00Z", "02/10/2026", "venerdì", ""]) {
      expect(validaScadenza({ iso, citazione, testo, ricevutaIl }).scadenza).toBeNull();
    }
  });

  it("senza citazione verificata la scadenza resta senza data", () => {
    expect(validaScadenza({ iso: "2026-10-02", citazione: "entro lunedì", testo, ricevutaIl })).toEqual({
      scadenza: null,
      citazioneVerificata: false,
    });
    expect(validaScadenza({ iso: "2026-10-02", citazione: null, testo, ricevutaIl })).toEqual({
      scadenza: null,
      citazioneVerificata: false,
    });
  });

  it("riporta la citazione verificata anche quando la data manca o non è plausibile", () => {
    expect(validaScadenza({ iso: null, citazione, testo, ricevutaIl })).toEqual({ scadenza: null, citazioneVerificata: true });
    expect(validaScadenza({ iso: "2020-01-01", citazione, testo, ricevutaIl })).toEqual({ scadenza: null, citazioneVerificata: true });
  });

  it("tollera fino a un giorno prima della ricezione", () => {
    expect(validaScadenza({ iso: "2026-09-24", citazione, testo, ricevutaIl }).scadenza).toEqual(new Date("2026-09-24T00:00:00Z"));
    expect(validaScadenza({ iso: "2026-09-23", citazione, testo, ricevutaIl }).scadenza).toEqual(new Date("2026-09-23T00:00:00Z"));
    expect(validaScadenza({ iso: "2026-09-22", citazione, testo, ricevutaIl }).scadenza).toBeNull();
    expect(validaScadenza({ iso: "2026-09-23T15:30:00Z", citazione, testo, ricevutaIl }).scadenza).toEqual(
      new Date("2026-09-23T15:30:00Z"),
    );
    expect(validaScadenza({ iso: "2026-09-23T15:29:59Z", citazione, testo, ricevutaIl }).scadenza).toBeNull();
  });

  it("una data senza ora vale per il giorno di calendario: \"entro oggi\" scritto la sera a ovest di UTC è plausibile", () => {
    const seraNewYork = new Date("2026-09-25T00:30:00Z");
    const oggi = "Please send it by today, thanks";
    expect(validaScadenza({ iso: "2026-09-24", citazione: "by today", testo: oggi, ricevutaIl: seraNewYork }).scadenza).toEqual(
      new Date("2026-09-24T00:00:00Z"),
    );
    expect(validaScadenza({ iso: "2026-09-23", citazione: "by today", testo: oggi, ricevutaIl: seraNewYork }).scadenza).toBeNull();
    const tardaSeraSamoa = new Date("2026-09-25T10:59:00Z");
    expect(validaScadenza({ iso: "2026-09-24", citazione: "by today", testo: oggi, ricevutaIl: tardaSeraSamoa }).scadenza).toEqual(
      new Date("2026-09-24T00:00:00Z"),
    );
  });

  it("rifiuta scadenze oltre due anni dalla ricezione", () => {
    expect(validaScadenza({ iso: "2028-09-24T15:30:00Z", citazione, testo, ricevutaIl }).scadenza).toEqual(
      new Date("2028-09-24T15:30:00Z"),
    );
    expect(validaScadenza({ iso: "2028-09-24T15:30:01Z", citazione, testo, ricevutaIl }).scadenza).toBeNull();
  });
});
