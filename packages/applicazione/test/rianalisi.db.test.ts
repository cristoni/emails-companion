import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { valoreEffettivo } from "@ec/core/dominio";
import { operativo, posta } from "@ec/db";
import { gestoriJob, impostaModello, type GestoriJob } from "../src";
import { aggiornaRiepilogoNews } from "../src/news/riepilogo";
import { confermaRianalisi, rianalizza, riprendiRianalisi, stimaRianalisi } from "../src/rianalisi/rianalizza";
import { rianalisi } from "../src/rianalisi/repository";
import { creaScenario, type Scenario } from "./support/scenario";

const ORA = 60 * 60 * 1000;

let s: Scenario;
let gestori: GestoriJob;

beforeEach(async () => {
  s = await creaScenario();
  gestori = gestoriJob(s.dip, {
    aggiorna_riepilogo_news: async (p) => {
      await aggiornaRiepilogoNews(s.dip, p.utenteId);
    },
    rianalizza: async (p) => {
      await rianalizza(s.dip, p.utenteId, p.richiestaId);
    },
  });
});
afterEach(async () => {
  await s.chiudi();
});

async function eseguiJob(): Promise<void> {
  for (let i = 0; i < 1000; i++) {
    const job = s.coda.prossimo();
    if (!job) return;
    await (gestori[job.nome] as (p: unknown) => Promise<void>)(job.payload);
  }
  throw new Error("troppi job");
}

const DESCRIZIONE_AI = "Mandare il report a Marco";
const DESCRIZIONE_UTENTE = "Mandare il report a Marco e a Giulia";

function script() {
  s.modelli
    .quando("classificazione_priorita", (dati) => ({
      output: {
        categoria: String(dati.email.oggetto).startsWith("News") ? "news" : "operativa",
        urgente: false,
        base_urgenza: "dedotto",
        priorita: "media",
        motivazione: "Richiesta diretta con scadenza.",
        titolo_situazione: "Report di settembre",
        descrizione_situazione: "Richiesta di un report.",
        evidenze: [],
      },
    }))
    .quando("estrazione_attivita", (dati) => {
      const esistente = dati.elementi_esistenti[0];
      return {
        output: {
          elementi: [
            {
              esito: esistente ? "aggiorna" : "nuovo",
              riferimento: esistente ? esistente.alias : null,
              descrizione: esistente ? "Inviare il report" : DESCRIZIONE_AI,
              scadenza_iso: "2026-09-25",
              scadenza_citazione: "entro venerdì",
              priorita: "media",
              urgente: false,
              base: "rilevato",
              evidenze: [{ email: "e1", citazione: "Mi mandi il report entro venerdì?" }],
            },
          ],
          titolo_situazione: null,
          descrizione_situazione: null,
        },
      };
    })
    .quando("attese_risposte", () => ({
      output: { richieste: [], collegamenti: [], valutazioni: [], completamenti: [], titolo_situazione: null, descrizione_situazione: null },
    }))
    .quando("riepilogo_news", (dati) => ({ output: { voci: [{ testo: "Notizie.", email: dati.email.map((e: { alias: string }) => e.alias) }] } }));
}

/** Un'email operativa con un'Attività corretta dall'utente e una News, entrambe nelle ultime ore. */
async function prepara() {
  const utente = await s.creaUtente("anna@esempio.it");
  const { casella } = await s.collegaGmail(utente, "anna@esempio.it");
  await eseguiJob();
  script();
  casella.ricevi({
    da: "marco@cliente.it",
    a: ["anna@esempio.it"],
    oggetto: "Report",
    testo: "Ciao Anna,\nMi mandi il report entro venerdì?\nGrazie, Marco",
    il: new Date(s.orologio.ora().getTime() - 2 * ORA),
  });
  casella.ricevi({ da: "info@notizie.it", a: ["anna@esempio.it"], oggetto: "News del giorno", testo: "Le notizie.", il: new Date(s.orologio.ora().getTime() - ORA) });
  s.coda.aggiungi("pianifica_sincronizzazioni", {});
  await eseguiJob();

  const ids = await s.perUtente(utente, async (ctx) => {
    const elenco = await posta.elenco(ctx, { limite: 50 });
    return Object.fromEntries(elenco.map((e) => [e.oggetto, e.id])) as Record<string, string>;
  });
  const emailId = ids["Report"]!;
  const attivita = await s.perUtente(utente, (ctx) => operativo.attivitaDellEmail(ctx, emailId));
  expect(attivita).toHaveLength(1);
  const attivitaId = attivita[0]!.id;
  await s.perUtente(utente, (ctx) =>
    operativo.correggi(ctx, { tipo: "attivita", id: attivitaId }, "descrizione", DESCRIZIONE_UTENTE, DESCRIZIONE_AI, s.orologio.ora()),
  );
  return { utente, emailId, newsId: ids["News del giorno"]!, attivitaId };
}

async function analisiDi(emailId: string) {
  const r = await s.db.execute(sql`select funzione, stato, richiesta_rianalisi_id from analisi_ai where email_id = ${emailId}::uuid order by avviata_il, id`);
  return (r as unknown as { rows: { funzione: string; stato: string; richiesta_rianalisi_id: string | null }[] }).rows;
}

describe("Rianalizza", () => {
  it("stima numero di email e costo per ambito prima di ogni chiamata", async () => {
    const { utente, emailId } = await prepara();
    const chiamate = s.modelli.chiamate.length;

    const singola = await s.perUtente(utente, (ctx) => stimaRianalisi(s.dip, ctx, { tipo: "email", emailId }));
    expect(singola.numeroEmail).toBe(1);
    // Classificazione ed estrazione: 2 × (3000 × 0,1 + 800 × 0,5) / 1M.
    expect(singola.costoStimato).toBeCloseTo(0.0014, 10);
    expect(singola.prezziMancanti).toEqual([]);

    const giorni = await s.perUtente(utente, (ctx) => stimaRianalisi(s.dip, ctx, { tipo: "giorni", giorni: 1 }));
    expect(giorni.numeroEmail).toBe(2);
    // La News richiede solo la classificazione.
    expect(giorni.costoStimato).toBeCloseTo(0.0021, 10);

    const aperti = await s.perUtente(utente, (ctx) => stimaRianalisi(s.dip, ctx, { tipo: "aperti" }));
    expect(aperti.numeroEmail).toBe(1);

    const richiesta = await s.perUtente(utente, (ctx) => rianalisi.leggi(ctx, singola.richiestaId));
    expect(richiesta).toMatchObject({ stato: "stimata", ambito: { tipo: "email", emailId }, stima: { numeroEmail: 1 } });
    expect(richiesta?.creataIl.getTime()).toBe(s.orologio.ora().getTime());
    expect(s.modelli.chiamate.length).toBe(chiamate);
    expect(s.coda.pendenti.some((j) => j.nome === "rianalizza")).toBe(false);
  });

  it("su una singola email esegue nuove chiamate, supera le analisi precedenti e conserva la correzione dell'utente", async () => {
    const { utente, emailId, attivitaId } = await prepara();
    const classificazioni = s.modelli.chiamateDi("classificazione_priorita").length;
    const estrazioni = s.modelli.chiamateDi("estrazione_attivita").length;
    s.orologio.avanza(60 * 1000);

    const stima = await s.perUtente(utente, (ctx) => stimaRianalisi(s.dip, ctx, { tipo: "email", emailId }));
    expect(await s.perUtente(utente, (ctx) => confermaRianalisi(s.dip, ctx, stima.richiestaId))).toBe(true);
    expect(await s.perUtente(utente, (ctx) => confermaRianalisi(s.dip, ctx, stima.richiestaId))).toBe(false);
    await eseguiJob();

    expect(s.modelli.chiamateDi("classificazione_priorita")).toHaveLength(classificazioni + 1);
    expect(s.modelli.chiamateDi("estrazione_attivita")).toHaveLength(estrazioni + 1);
    expect(s.modelli.chiamateDi("estrazione_attivita").at(-1)!.dati.elementi_esistenti).toHaveLength(1);

    const analisi = await analisiDi(emailId);
    const perFunzione = (f: string) => analisi.filter((a) => a.funzione === f);
    for (const f of ["classificazione_priorita", "estrazione_attivita"]) {
      expect(perFunzione(f).map((a) => [a.stato, a.richiesta_rianalisi_id])).toEqual([
        ["superata", null],
        ["completata", stima.richiestaId],
      ]);
    }

    const attivita = await s.perUtente(utente, (ctx) => operativo.attivitaDellEmail(ctx, emailId));
    expect(attivita).toHaveLength(1);
    expect(attivita[0]!.stato).toBe("proposta");
    const correzioni = await s.perUtente(utente, (ctx) => operativo.correzioniPer(ctx, [{ tipo: "attivita", id: attivitaId }]));
    expect(valoreEffettivo(attivita[0]!.descrizione, correzioni, { tipo: "attivita", id: attivitaId }, "descrizione").valore).toBe(DESCRIZIONE_UTENTE);
    expect(attivita[0]!.descrizione).toBe(DESCRIZIONE_AI);

    const richiesta = await s.perUtente(utente, (ctx) => rianalisi.leggi(ctx, stima.richiestaId));
    expect(richiesta?.stato).toBe("completata");

    // Un secondo passaggio dello stesso job non rifà chiamate.
    const totale = s.modelli.chiamate.length;
    await rianalizza(s.dip, utente, stima.richiestaId);
    expect(s.modelli.chiamate.length).toBe(totale);
  });

  it("si ferma in pausa senza completare la richiesta e riprende con l'id della richiesta", async () => {
    const { utente, emailId } = await prepara();
    s.orologio.avanza(60 * 1000);
    const stima = await s.perUtente(utente, (ctx) => stimaRianalisi(s.dip, ctx, { tipo: "email", emailId }));
    await s.perUtente(utente, (ctx) => confermaRianalisi(s.dip, ctx, stima.richiestaId));
    s.modelli.quando("classificazione_priorita", () => ({ errore: "modello_incompatibile" }));
    await eseguiJob();

    expect(await rianalizza(s.dip, utente, stima.richiestaId)).toBe("in_pausa");
    expect((await s.perUtente(utente, (ctx) => rianalisi.leggi(ctx, stima.richiestaId)))?.stato).toBe("in_corso");
    // L'analisi in vigore resta quella precedente: la ripresa generica non la riesegue senza richiesta.
    const stati = await s.perUtente(utente, (ctx) => posta.statiFunzione(ctx, emailId));
    expect(stati.classificazione_priorita?.stato).toBe("eseguita");
    expect((await analisiDi(emailId)).find((a) => a.funzione === "classificazione_priorita")?.stato).toBe("completata");

    // `riprendiRianalisi` (da chiamare insieme a `riprendiAnalisi`) riprende la rianalisi con l'id della richiesta.
    script();
    const estrazioni = s.modelli.chiamateDi("estrazione_attivita").length;
    await s.perUtente(utente, async (ctx) => {
      await impostaModello(s.dip, ctx, "classificazione_priorita", "openai/gpt-6-luna");
      expect(await riprendiRianalisi(ctx)).toBe(1);
    });
    await eseguiJob();

    expect((await s.perUtente(utente, (ctx) => rianalisi.leggi(ctx, stima.richiestaId)))?.stato).toBe("completata");
    expect(s.modelli.chiamateDi("estrazione_attivita")).toHaveLength(estrazioni + 1);
    const analisi = await analisiDi(emailId);
    expect(analisi.filter((a) => a.stato === "completata").map((a) => [a.funzione, a.richiesta_rianalisi_id]).sort()).toEqual(
      [
        ["classificazione_priorita", stima.richiestaId],
        ["estrazione_attivita", stima.richiestaId],
      ].sort(),
    );
  });

  it("una News riclassificata operativa non si conclude finché l'estrazione, sospesa da una pausa, non è eseguita", async () => {
    const { utente, newsId } = await prepara();
    s.orologio.avanza(60 * 1000);
    const stima = await s.perUtente(utente, (ctx) => stimaRianalisi(s.dip, ctx, { tipo: "email", emailId: newsId }));
    expect(stima.perFunzione).toEqual({ classificazione_priorita: 1 });
    await s.perUtente(utente, (ctx) => confermaRianalisi(s.dip, ctx, stima.richiestaId));

    script();
    s.modelli
      .quando("classificazione_priorita", () => ({
        output: {
          categoria: "operativa",
          urgente: false,
          base_urgenza: "dedotto",
          priorita: "media",
          motivazione: "In realtà richiede un'azione.",
          titolo_situazione: "Notizie da gestire",
          descrizione_situazione: "Da leggere e gestire.",
          evidenze: [],
        },
      }))
      .quando("estrazione_attivita", () => ({ errore: "modello_incompatibile" }));
    const estrazioniPrima = s.modelli.chiamateDi("estrazione_attivita").length;
    await eseguiJob();
    expect(s.modelli.chiamateDi("estrazione_attivita")).toHaveLength(estrazioniPrima + 1);
    expect((await s.perUtente(utente, (ctx) => rianalisi.leggi(ctx, stima.richiestaId)))?.stato).toBe("in_corso");
    // L'estrazione torna allo stato precedente (non necessaria), ma la rianalisi resta da concludere.
    expect((await s.perUtente(utente, (ctx) => posta.statiFunzione(ctx, newsId))).estrazione_attivita?.stato).toBe("non_necessaria");

    s.modelli.quando("estrazione_attivita", () => ({
      output: {
        elementi: [
          {
            esito: "nuovo",
            riferimento: null,
            descrizione: "Leggere le notizie",
            scadenza_iso: null,
            scadenza_citazione: null,
            priorita: "bassa",
            urgente: false,
            base: "dedotto",
            evidenze: [{ email: "e1", citazione: "Le notizie." }],
          },
        ],
        titolo_situazione: null,
        descrizione_situazione: null,
      },
    }));
    const classificazioni = s.modelli.chiamateDi("classificazione_priorita").length;
    s.orologio.avanza(60 * 1000);
    await s.perUtente(utente, async (ctx) => {
      await impostaModello(s.dip, ctx, "estrazione_attivita", "openai/gpt-6-luna");
      await riprendiRianalisi(ctx);
    });
    await eseguiJob();

    expect(s.modelli.chiamateDi("classificazione_priorita")).toHaveLength(classificazioni);
    expect(s.modelli.chiamateDi("estrazione_attivita")).toHaveLength(estrazioniPrima + 2);
    expect((await s.perUtente(utente, (ctx) => rianalisi.leggi(ctx, stima.richiestaId)))?.stato).toBe("completata");
    const estrazioni = (await analisiDi(newsId)).filter((a) => a.funzione === "estrazione_attivita");
    expect(estrazioni.map((a) => [a.stato, a.richiesta_rianalisi_id])).toEqual([
      ["fallita", stima.richiestaId],
      ["completata", stima.richiestaId],
    ]);
    expect(await s.perUtente(utente, (ctx) => operativo.attivitaDellEmail(ctx, newsId))).toHaveLength(1);
  });

  it("rifiuta ambiti non validi, salva l'ambito normalizzato e conferma solo le richieste dell'utente", async () => {
    const { utente, emailId } = await prepara();
    for (const ambito of [
      { tipo: "giorni", giorni: 0 },
      { tipo: "giorni", giorni: 1.5 },
      { tipo: "giorni", giorni: 366 },
      { tipo: "email", emailId: "non-un-id" },
      { tipo: "tutto" },
    ]) {
      await expect(s.perUtente(utente, (ctx) => stimaRianalisi(s.dip, ctx, ambito as never))).rejects.toThrow("ambito_non_valido");
    }
    const stima = await s.perUtente(utente, (ctx) => stimaRianalisi(s.dip, ctx, { tipo: "email", emailId, extra: "x".repeat(100) } as never));
    expect((await s.perUtente(utente, (ctx) => rianalisi.leggi(ctx, stima.richiestaId)))?.ambito).toEqual({ tipo: "email", emailId });

    expect(await s.perUtente(utente, (ctx) => confermaRianalisi(s.dip, ctx, "non-un-id"))).toBe(false);
    const altro = await s.creaUtente("bruno@esempio.it");
    expect(await s.perUtente(altro, (ctx) => confermaRianalisi(s.dip, ctx, stima.richiestaId))).toBe(false);
    expect((await s.perUtente(utente, (ctx) => rianalisi.leggi(ctx, stima.richiestaId)))?.stato).toBe("stimata");
    expect(await s.perUtente(altro, (ctx) => rianalisi.leggi(ctx, stima.richiestaId))).toBeNull();
    // Un altro utente non vede le email di Anna: la sua stima su quell'id è vuota.
    expect((await s.perUtente(altro, (ctx) => stimaRianalisi(s.dip, ctx, { tipo: "email", emailId }))).numeroEmail).toBe(0);
    expect(s.coda.pendenti.some((j) => j.nome === "rianalizza")).toBe(false);
  });

  it("se la rianalisi non si conclude ripristina lo stato precedente con il suo codice d'errore", async () => {
    const { utente, emailId } = await prepara();
    await s.perUtente(utente, (ctx) => posta.impostaStatoFunzione(ctx, emailId, "classificazione_priorita", "errore", s.orologio.ora(), "moderazione"));
    s.orologio.avanza(60 * 1000);
    const stima = await s.perUtente(utente, (ctx) => stimaRianalisi(s.dip, ctx, { tipo: "email", emailId }));
    await s.perUtente(utente, (ctx) => confermaRianalisi(s.dip, ctx, stima.richiestaId));
    s.modelli.quando("classificazione_priorita", () => ({ errore: "temporaneo" }));
    await eseguiJob();

    const stati = await s.perUtente(utente, (ctx) => posta.statiFunzione(ctx, emailId));
    expect(stati.classificazione_priorita).toMatchObject({ stato: "errore", motivo: "moderazione" });
    expect((await s.perUtente(utente, (ctx) => rianalisi.leggi(ctx, stima.richiestaId)))?.stato).toBe("in_corso");
  });

  it("su errori transitori riprova con attese crescenti e lascia in vigore l'analisi precedente", async () => {
    const { utente, emailId } = await prepara();
    s.orologio.avanza(60 * 1000);
    const stima = await s.perUtente(utente, (ctx) => stimaRianalisi(s.dip, ctx, { tipo: "email", emailId }));
    await s.perUtente(utente, (ctx) => confermaRianalisi(s.dip, ctx, stima.richiestaId));
    s.modelli.quando("classificazione_priorita", () => ({ errore: "temporaneo" }));

    const attese: number[] = [];
    await eseguiJob();
    for (let giro = 0; giro < 3; giro++) {
      const pendente = s.coda.pendenti.find((j) => j.nome === "rianalizza");
      expect(pendente).toBeDefined();
      attese.push(pendente!.eseguiIl.getTime() - s.orologio.ora().getTime());
      s.orologio.imposta(pendente!.eseguiIl);
      await eseguiJob();
    }
    expect(attese[0]).toBeGreaterThanOrEqual(60 * 1000);
    expect(attese[2]!).toBeGreaterThan(attese[0]!);
    expect((await s.perUtente(utente, (ctx) => rianalisi.leggi(ctx, stima.richiestaId)))?.stato).toBe("in_corso");
    const stati = await s.perUtente(utente, (ctx) => posta.statiFunzione(ctx, emailId));
    expect(stati.classificazione_priorita?.stato).toBe("eseguita");
    expect((await analisiDi(emailId)).filter((a) => a.stato === "completata").map((a) => a.richiesta_rianalisi_id)).toEqual([null, null]);

    script();
    const pendente = s.coda.pendenti.find((j) => j.nome === "rianalizza")!;
    s.orologio.imposta(pendente.eseguiIl);
    await eseguiJob();
    expect((await s.perUtente(utente, (ctx) => rianalisi.leggi(ctx, stima.richiestaId)))?.stato).toBe("completata");
  });
});
