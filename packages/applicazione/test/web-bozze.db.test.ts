import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ErroreConnettore } from "@ec/core/porte";
import { impostazioni, operativo, posta } from "@ec/db";
import type { CasellaFinta } from "@ec/testing";
import { gestoriJob, opzioniSincronizzazione } from "../src";
import {
  bozzeDellaSituazione,
  confermaInvio,
  decidiEsitoIncerto,
  dettaglioBozza,
  gestoriBozze,
  modificaBozza,
  richiediBozza,
  rigeneraBozza,
  sweeperInvii,
} from "../src/bozze";
import { creaScenario, type Scenario } from "./support/scenario";

const MINUTO = 60_000;
const UTENTE = "anna@esempio.it";
const MARCO = "marco@esempio.example";

let s: Scenario;
beforeEach(async () => {
  s = await creaScenario();
});
afterEach(async () => {
  await s.chiudi();
});

/** Come `s.eseguiJob`, ma con i gestori dei job di bozze e invio. */
async function drena(massimo = 500): Promise<number> {
  const gestori = gestoriJob(s.dip, gestoriBozze(s.dip));
  for (let i = 0; i < massimo; i++) {
    const job = s.coda.prossimo();
    if (!job) return i;
    await (gestori[job.nome] as (p: unknown) => Promise<void>)(job.payload);
  }
  throw new Error("troppi job: possibile ciclo");
}

async function avanza(ms: number): Promise<void> {
  const fine = s.orologio.ora().getTime() + ms;
  await drena();
  for (;;) {
    const prossima = s.coda.prossimaScadenza();
    if (!prossima || prossima.getTime() > fine) break;
    s.orologio.imposta(new Date(Math.max(prossima.getTime(), s.orologio.ora().getTime())));
    await drena();
  }
  s.orologio.imposta(new Date(fine));
  await drena();
}

function script(bozza: () => { output: unknown } | { errore: string } = () => ({ output: { oggetto: "ignorato", corpo: "Ciao Marco, ecco il report." } })) {
  s.modelli
    .quando("classificazione_priorita", () => ({
      output: {
        categoria: "informativa",
        urgente: false,
        base_urgenza: "dedotto",
        priorita: "media",
        motivazione: "Messaggio personale.",
        titolo_situazione: null,
        descrizione_situazione: null,
        evidenze: [],
      },
    }))
    .quando("estrazione_attivita", () => ({ output: { elementi: [], titolo_situazione: null, descrizione_situazione: null } }))
    .quando("attese_risposte", () => ({
      output: { richieste: [], collegamenti: [], valutazioni: [], completamenti: [], titolo_situazione: null, descrizione_situazione: null },
    }))
    .quando("bozze_assistite", bozza as never);
}

async function preparaUtente(indirizzo = UTENTE) {
  const utente = await s.creaUtente(indirizzo);
  const { casella, casellaId } = await s.collegaGmail(utente, indirizzo);
  await drena();
  script();
  return { utente, casella, casellaId: casellaId! };
}

async function riceviDaMarco(utente: string, casella: CasellaFinta, casellaId: string, extra: { oggetto?: string; thread?: string; a?: string } = {}) {
  s.orologio.avanza(MINUTO);
  const idConnettore = casella.ricevi({
    da: MARCO,
    a: [extra.a ?? UTENTE],
    oggetto: extra.oggetto ?? "Report",
    testo: "Ciao Anna, mi mandi il report?",
    il: s.orologio.ora(),
    thread: extra.thread ?? "t-report",
  });
  s.coda.aggiungi("sincronizza_casella", { utenteId: utente, casellaId }, opzioniSincronizzazione(casellaId));
  await drena();
  const copia = await s.perUtente(utente, (ctx) => posta.trovaCopia(ctx, casellaId, idConnettore));
  if (!copia) throw new Error("copia non sincronizzata");
  return copia.emailId;
}

async function creaSituazione(utente: string, emailOrigineId: string, titolo: string): Promise<string> {
  const ora = s.orologio.ora();
  return s.perUtente(utente, (ctx) => operativo.creaSituazione(ctx, { id: crypto.randomUUID(), emailOrigineId, titolo, descrizione: "", lingua: "it", creataIl: ora }));
}

async function richiedi(utente: string, emailId: string): Promise<string> {
  const esito = await s.perUtente(utente, (ctx) => richiediBozza(s.dip, ctx, { tipo: "risposta", emailId }));
  if (esito.esito !== "richiesta") throw new Error(esito.esito);
  return esito.bozzaId;
}

const dettaglio = (utente: string, bozzaId: string) => s.perUtente(utente, (ctx) => dettaglioBozza(s.dip, ctx, bozzaId));

/** I DTO arrivano ai componenti client: niente Date, undefined o classi. */
function serializzabile<T>(dto: T): void {
  expect(JSON.parse(JSON.stringify(dto))).toEqual(dto);
}

describe("bozze nella webapp", () => {
  it("elenca le bozze della Situazione, comprese quelle di una Situazione assorbita, con DTO serializzabili", async () => {
    const { utente, casella, casellaId } = await preparaUtente();
    const prima = await riceviDaMarco(utente, casella, casellaId, { oggetto: "Report", thread: "t-report" });
    const seconda = await riceviDaMarco(utente, casella, casellaId, { oggetto: "Allegati", thread: "t-allegati" });
    const principale = await creaSituazione(utente, prima, "Report");
    const assorbita = await creaSituazione(utente, seconda, "Allegati");

    const bozzaPrima = await richiedi(utente, prima);
    const bozzaSeconda = await richiedi(utente, seconda);

    const inGenerazione = await s.perUtente(utente, (ctx) => bozzeDellaSituazione(ctx, principale));
    expect(inGenerazione.map((b) => b.id)).toEqual([bozzaPrima]);
    expect(inGenerazione[0]).toMatchObject({ versioneCorrente: 0, oggetto: null, destinatari: [], stato: "modificabile", ultimoInvio: null });

    await s.perUtente(utente, (ctx) => operativo.assorbi(ctx, assorbita, principale, s.orologio.ora()));
    await drena();

    const elenco = await s.perUtente(utente, (ctx) => bozzeDellaSituazione(ctx, principale));
    expect(new Set(elenco.map((b) => b.id))).toEqual(new Set([bozzaPrima, bozzaSeconda]));
    const voce = elenco.find((b) => b.id === bozzaPrima)!;
    expect(inGenerazione[0]?.origine).toBeNull();
    expect(voce).toMatchObject({
      tipo: "risposta",
      stato: "modificabile",
      versioneCorrente: 1,
      origine: "ai",
      oggetto: "Re: Report",
      destinatari: [{ indirizzo: MARCO }],
      casella: { id: casellaId, indirizzo: UTENTE },
      lingua: "it",
      emailRispostaId: prima,
      ultimoInvio: null,
    });
    serializzabile(elenco);

    // Un id assorbito porta alla Situazione che lo contiene; id malformati o di altri utenti non mostrano nulla.
    const perAssorbita = await s.perUtente(utente, (ctx) => bozzeDellaSituazione(ctx, assorbita));
    expect(perAssorbita.map((b) => b.id).sort()).toEqual(elenco.map((b) => b.id).sort());
    expect(await s.perUtente(utente, (ctx) => bozzeDellaSituazione(ctx, "non-un-uuid"))).toEqual([]);
    const altro = await s.creaUtente("bruno@esempio.it");
    expect(await s.perUtente(altro, (ctx) => bozzeDellaSituazione(ctx, principale))).toEqual([]);
    expect(await dettaglio(altro, bozzaPrima)).toBeNull();
    expect(await dettaglio(utente, "non-un-uuid")).toBeNull();
  });

  it("il dettaglio mostra busta, oggetto calcolato ed email usate, e dopo l'invio lo stato dell'ultimo invio", async () => {
    const { utente, casella, casellaId } = await preparaUtente();
    const emailId = await riceviDaMarco(utente, casella, casellaId, { oggetto: "Fwd: Report" });
    const situazioneId = await creaSituazione(utente, emailId, "Report");
    const bozzaId = await richiedi(utente, emailId);
    await drena();

    const d = await dettaglio(utente, bozzaId);
    expect(d).toMatchObject({
      id: bozzaId,
      tipo: "risposta",
      stato: "modificabile",
      situazioneId,
      lingua: "it",
      casella: { id: casellaId, indirizzo: UTENTE, pronta: true },
      emailRisposta: { id: emailId, mittente: { indirizzo: MARCO }, oggetto: "Fwd: Report" },
      oggettoCalcolato: "Re: Report",
      versione: { numero: 1, origine: "ai", oggetto: "Re: Report", corpo: "Ciao Marco, ecco il report.", a: [{ indirizzo: MARCO }], cc: [], bcc: [] },
      invio: null,
      decisioneDal: null,
      puoDecidere: false,
      generazione: null,
    });
    expect(d!.emailContesto.map((e) => e.id)).toContain(emailId);
    expect(d!.versione!.hashBusta).toMatch(/.+/);
    serializzabile(d);

    const modifica = await s.perUtente(utente, (ctx) => modificaBozza(s.dip, ctx, bozzaId, { oggetto: "Re: Report", corpo: "Eccolo.", versioneAttesa: 1 }));
    if (modifica.esito !== "modificata") throw new Error(modifica.esito);
    const modificata = await dettaglio(utente, bozzaId);
    expect(modificata?.versione).toMatchObject({ numero: 2, origine: "utente", corpo: "Eccolo.", hashBusta: modifica.hashBusta });

    const conferma = await s.perUtente(utente, (ctx) => confermaInvio(s.dip, ctx, { bozzaId, versione: 2, hashBusta: modifica.hashBusta }));
    expect(conferma.esito).toBe("confermato");
    expect((await dettaglio(utente, bozzaId))?.invio).toMatchObject({ stato: "confermato", versione: 2 });
    await drena();
    const inviata = await dettaglio(utente, bozzaId);
    expect(inviata).toMatchObject({ stato: "inviata", invio: { stato: "inviato", errore: null } });
    expect(inviata?.invio?.inviatoIl).not.toBeNull();
    const [voce] = await s.perUtente(utente, (ctx) => bozzeDellaSituazione(ctx, situazioneId));
    expect(voce?.ultimoInvio?.stato).toBe("inviato");
    serializzabile(inviata);
  });

  it("finché la versione non esiste spiega se la generazione è in corso, in ritardo, in pausa o fallita", async () => {
    const { utente, casella, casellaId } = await preparaUtente();
    const emailId = await riceviDaMarco(utente, casella, casellaId);
    const bozzaId = await richiedi(utente, emailId);

    expect((await dettaglio(utente, bozzaId))?.generazione).toMatchObject({ stato: "in_corso", motivoPausa: null, errore: null });
    s.orologio.avanza(3 * MINUTO);
    expect((await dettaglio(utente, bozzaId))?.generazione).toMatchObject({ stato: "in_ritardo" });

    // In pausa la generazione non riparte da sola: l'interfaccia deve dire perché e offrire "Rigenera".
    await s.perUtente(utente, (ctx) => impostazioni.aggiornaPreferenze(ctx, { pausaManuale: true }, s.orologio.ora()));
    await drena();
    const inPausa = await dettaglio(utente, bozzaId);
    expect(inPausa?.versione).toBeNull();
    expect(inPausa?.generazione).toMatchObject({ stato: "in_pausa", motivoPausa: "pausa_manuale" });
    serializzabile(inPausa);

    await s.perUtente(utente, (ctx) => impostazioni.aggiornaPreferenze(ctx, { pausaManuale: false }, s.orologio.ora()));
    // Un errore temporaneo è già ripianificato dal job: la generazione non va mostrata come fallita.
    script(() => ({ errore: "temporaneo" }));
    expect(await s.perUtente(utente, (ctx) => rigeneraBozza(s.dip, ctx, bozzaId))).toBe(true);
    await drena();
    expect((await dettaglio(utente, bozzaId))?.generazione).toMatchObject({ stato: "in_corso", errore: null });

    script(() => ({ errore: "moderazione" }));
    expect(await s.perUtente(utente, (ctx) => rigeneraBozza(s.dip, ctx, bozzaId))).toBe(true);
    await drena();
    expect((await dettaglio(utente, bozzaId))?.generazione).toMatchObject({ stato: "fallita", motivoPausa: null, errore: "moderazione" });

    script();
    expect(await s.perUtente(utente, (ctx) => rigeneraBozza(s.dip, ctx, bozzaId))).toBe(true);
    await drena();
    const generata = await dettaglio(utente, bozzaId);
    expect(generata?.generazione).toBeNull();
    expect(generata?.versione?.numero).toBe(1);
  });

  it("con un esito incerto consente la decisione solo al termine della verifica, e 'Invia di nuovo' avvisa del possibile duplicato", async () => {
    const { utente, casella, casellaId } = await preparaUtente();
    const emailId = await riceviDaMarco(utente, casella, casellaId);
    const bozzaId = await richiedi(utente, emailId);
    await drena();
    const v = (await dettaglio(utente, bozzaId))!.versione!;
    casella.erroreInvio = new ErroreConnettore("timeout_invio");
    const conferma = await s.perUtente(utente, (ctx) => confermaInvio(s.dip, ctx, { bozzaId, versione: v.numero, hashBusta: v.hashBusta }));
    if (conferma.esito !== "confermato") throw new Error(conferma.esito);
    await drena();
    expect((await dettaglio(utente, bozzaId))?.invio?.stato).toBe("in_invio");

    s.orologio.avanza(6 * MINUTO);
    await sweeperInvii(s.dip);
    const inVerifica = await dettaglio(utente, bozzaId);
    expect(inVerifica).toMatchObject({ stato: "in_invio", invio: { id: conferma.invioId, stato: "esito_incerto" }, puoDecidere: false });
    expect(inVerifica?.decisioneDal).not.toBeNull();
    serializzabile(inVerifica);

    await avanza(30 * MINUTO);
    const daDecidere = await dettaglio(utente, bozzaId);
    expect(daDecidere).toMatchObject({ invio: { stato: "esito_incerto" }, puoDecidere: true });
    expect(new Date(daDecidere!.ora).getTime()).toBeGreaterThanOrEqual(new Date(daDecidere!.decisioneDal!).getTime());

    const decisione = await s.perUtente(utente, (ctx) => decidiEsitoIncerto(s.dip, ctx, conferma.invioId, "reinvia"));
    expect(decisione).toMatchObject({ esito: "annullato", bozzaId });
    const dopo = await dettaglio(utente, bozzaId);
    expect(dopo).toMatchObject({ stato: "modificabile", invio: { stato: "annullato", errore: "utente_reinvia" }, puoDecidere: false, decisioneDal: null });
    expect(dopo?.avvisi).toContain("possibile_duplicato");
    expect(casella.inviati).toHaveLength(0);
  });

  it("elenca anche la bozza rimasta senza Situazione per un'email collegata solo come proposta, non quella di un collegamento rifiutato", async () => {
    const { utente, casella, casellaId } = await preparaUtente();
    const origine = await riceviDaMarco(utente, casella, casellaId, { oggetto: "Report", thread: "t-report" });
    const proposta = await riceviDaMarco(utente, casella, casellaId, { oggetto: "Dati del report", thread: "t-dati" });
    const rifiutata = await riceviDaMarco(utente, casella, casellaId, { oggetto: "Altro", thread: "t-altro" });
    const estranea = await riceviDaMarco(utente, casella, casellaId, { oggetto: "Estranea", thread: "t-estranea" });
    const situazioneId = await creaSituazione(utente, origine, "Report");
    const ora = s.orologio.ora();
    await s.perUtente(utente, async (ctx) => {
      await operativo.collega(ctx, { emailId: proposta, situazioneId, origine: "ai", ruolo: "contesto", stato: "proposto", confidenza: 0.6, analisiId: null }, ora);
      await operativo.collega(ctx, { emailId: rifiutata, situazioneId, origine: "ai", ruolo: "contesto", stato: "rifiutato", confidenza: 0.6, analisiId: null }, ora);
    });

    const bozzaOrigine = await richiedi(utente, origine);
    const bozzaProposta = await richiedi(utente, proposta);
    const bozzaRifiutata = await richiedi(utente, rifiutata);
    const bozzaEstranea = await richiedi(utente, estranea);
    // Un collegamento solo proposto non assegna la Situazione alla bozza (richiediBozza).
    expect((await dettaglio(utente, bozzaProposta))?.situazioneId).toBeNull();

    const elenco = await s.perUtente(utente, (ctx) => bozzeDellaSituazione(ctx, situazioneId));
    const ids = elenco.map((b) => b.id);
    expect(ids).toContain(bozzaOrigine);
    expect(ids).toContain(bozzaProposta);
    expect(ids).not.toContain(bozzaRifiutata);
    expect(ids).not.toContain(bozzaEstranea);
    expect(new Set(ids).size).toBe(ids.length);
    serializzabile(elenco);
  });

  it("le scritture con gli id di un altro utente risultano non trovate e non cambiano nulla", async () => {
    const { utente, casella, casellaId } = await preparaUtente();
    const emailId = await riceviDaMarco(utente, casella, casellaId);
    const bozzaId = await richiedi(utente, emailId);
    await drena();
    const v = (await dettaglio(utente, bozzaId))!.versione!;

    const altro = await s.creaUtente("bruno@esempio.it");
    expect(await s.perUtente(altro, (ctx) => richiediBozza(s.dip, ctx, { tipo: "risposta", emailId }))).toEqual({ esito: "email_non_trovata" });
    expect(
      await s.perUtente(altro, (ctx) => modificaBozza(s.dip, ctx, bozzaId, { oggetto: "Re: Report", corpo: "Altro testo", versioneAttesa: v.numero })),
    ).toEqual({ esito: "non_trovata" });
    expect(await s.perUtente(altro, (ctx) => rigeneraBozza(s.dip, ctx, bozzaId))).toBe(false);
    expect(await s.perUtente(altro, (ctx) => confermaInvio(s.dip, ctx, { bozzaId, versione: v.numero, hashBusta: v.hashBusta }))).toEqual({ esito: "non_trovata" });
    await drena();

    const invariata = await dettaglio(utente, bozzaId);
    expect(invariata).toMatchObject({ stato: "modificabile", invio: null, versione: { numero: v.numero, corpo: v.corpo, hashBusta: v.hashBusta } });
    expect(casella.inviati).toHaveLength(0);

    const conferma = await s.perUtente(utente, (ctx) => confermaInvio(s.dip, ctx, { bozzaId, versione: v.numero, hashBusta: v.hashBusta }));
    if (conferma.esito !== "confermato") throw new Error(conferma.esito);
    expect(await s.perUtente(altro, (ctx) => decidiEsitoIncerto(s.dip, ctx, conferma.invioId, "non_inviato"))).toEqual({ esito: "non_trovato" });
    expect((await dettaglio(utente, bozzaId))?.invio).toMatchObject({ id: conferma.invioId, stato: "confermato", errore: null });
  });
});
