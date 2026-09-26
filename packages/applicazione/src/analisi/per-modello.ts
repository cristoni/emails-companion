import type { EmailPerModello } from "@ec/ai";
import type { Email } from "@ec/core/dominio";

/** Data ISO 8601 con offset nel fuso dell'utente (es. 2026-09-26T09:15:00+02:00). */
export function isoNelFuso(data: Date, fusoOrario: string): string {
  const parti = new Intl.DateTimeFormat("en-CA", {
    timeZone: fusoOrario,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(data);
  const v = (tipo: string) => parti.find((p) => p.type === tipo)?.value ?? "00";
  const locale = Date.UTC(Number(v("year")), Number(v("month")) - 1, Number(v("day")), Number(v("hour")), Number(v("minute")), Number(v("second")));
  const offsetMinuti = Math.round((locale - Math.floor(data.getTime() / 1000) * 1000) / 60000);
  const segno = offsetMinuti >= 0 ? "+" : "-";
  const assoluto = Math.abs(offsetMinuti);
  const offset = `${segno}${String(Math.floor(assoluto / 60)).padStart(2, "0")}:${String(assoluto % 60).padStart(2, "0")}`;
  return `${v("year")}-${v("month")}-${v("day")}T${v("hour")}:${v("minute")}:${v("second")}${offset}`;
}

export function dataNelFuso(data: Date, fusoOrario: string): string {
  return isoNelFuso(data, fusoOrario).slice(0, 10);
}

const LIMITE_CONTESTO = 4000;

export function emailPerModello(email: Email, alias: string, fusoOrario: string, opzioni: { contesto?: boolean } = {}): EmailPerModello {
  const testo = opzioni.contesto && email.testo.length > LIMITE_CONTESTO ? `${email.testo.slice(0, LIMITE_CONTESTO)}…` : email.testo;
  return {
    alias,
    direzione: email.direzione,
    mittente: email.mittente.indirizzo,
    destinatari: email.a.map((d) => d.indirizzo),
    cc: email.cc.map((d) => d.indirizzo),
    oggetto: email.oggetto,
    data: isoNelFuso(email.ricevutaIl, fusoOrario),
    lingua: email.lingua,
    testo,
    allegati: email.nomiAllegati,
  };
}
