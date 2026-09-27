import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RichiestaModello } from "@ec/core/porte";
import { impostazioni, operativo, posta } from "@ec/db";
import { gestoriJob, impostaModello, type GestoriJob } from "../src";
import { aggiornaOra, aggiornaRiepilogoNews, chiaveUscitaNews, invalidaRiepilogoNews, programmaRiepilogoNews, vistaNews } from "../src/news/riepilogo";
import { news } from "../src/news/repository";
import { creaScenario, type Scenario } from "./support/scenario";

const MINUTO = 60 * 1000;
const ORA = 60 * MINUTO;

let s: Scenario;
let gestori: GestoriJob;

beforeEach(async () => {
  s = await creaScenario();
  gestori = gestoriJob(s.dip, {
    aggiorna_riepilogo_news: async (p) => {
      await aggiornaRiepilogoNews(s.dip, p.utenteId);
    },
  });
});
afterEach(async () => {
  await s.chiudi();
});

/** Come `s.eseguiJob`, ma con il gestore del Riepilogo News collegato. */
async function eseguiJob(): Promise<void> {
  for (let i = 0; i < 1000; i++) {
    const job = s.coda.prossimo();
    if (!job) return;
    await (gestori[job.nome] as (p: unknown) => Promise<void>)(job.payload);
  }
  throw new Error("troppi job");
}

async function avanza(ms: number): Promise<void> {
  const fine = s.orologio.ora().getTime() + ms;
  await eseguiJob();
  for (;;) {
    const prossima = s.coda.prossimaScadenza();
    if (!prossima || prossima.getTime() > fine) break;
    s.orologio.imposta(new Date(Math.max(prossima.getTime(), s.orologio.ora().getTime())));
    await eseguiJob();
  }
  s.orologio.imposta(new Date(fine));
  await eseguiJob();
}

function scriptClassificazione() {
  s.modelli.quando("classificazione_priorita", (dati) => ({
    output: {
      categoria: String(dati.email.oggetto).startsWith("News") ? "news" : "operativa",
      urgente: false,
      base_urgenza: "dedotto",
      priorita: "bassa",
      motivazione: "Comunicazione informativa.",
      titolo_situazione: null,
      descrizione_situazione: null,
      evidenze: [],
    },
  }));
}

/** Voce A: l'email più recente; voce B: tutte le altre (così l'uscita della più vecchia nasconde B). */
function scriptRiepilogo() {
  s.modelli.quando("riepilogo_news", (dati) => {
    const alias: string[] = dati.email.map((e: { alias: string }) => e.alias);
    const voci = [{ testo: `Voce A (${alias.length})`, email: alias.slice(0, 1) }];
    if (alias.length > 1) voci.push({ testo: `Voce B (${alias.length})`, email: alias.slice(1) });
    return { output: { voci } };
  });
}

/** Utente con casella collegata e tre News ricevute alle 05:00, 06:00 e 07:00 (l'orologio è alle 08:00). */
async function preparaNews(oggetti = ["News 1", "News 2", "News 3"]) {
  const utente = await s.creaUtente("anna@esempio.it");
  const { casella } = await s.collegaGmail(utente, "anna@esempio.it");
  await eseguiJob();
  scriptClassificazione();
  scriptRiepilogo();
  const nelProvider: Record<string, string> = {};
  oggetti.forEach((oggetto, i) => {
    nelProvider[oggetto] = casella.ricevi({
      da: `bollettino${i}@notizie.it`,
      a: ["anna@esempio.it"],
      oggetto,
      testo: `Le notizie del giorno numero ${i + 1}.`,
      il: new Date(s.orologio.ora().getTime() - (oggetti.length - i) * ORA),
    });
  });
  s.coda.aggiungi("pianifica_sincronizzazioni", {});
  await eseguiJob();
  const ids = await idPerOggetto(utente);
  return { utente, casella, ids, nelProvider };
}

async function idPerOggetto(utente: string): Promise<Record<string, string>> {
  return s.perUtente(utente, async (ctx) => {
    const elenco = await posta.elenco(ctx, { limite: 50 });
    return Object.fromEntries(elenco.map((e) => [e.oggetto, e.id])) as Record<string, string>;
  });
}

/** Sincronizzazione successiva (il pianificatore considera dovuta una casella dopo un minuto). */
async function sincronizza(): Promise<void> {
  s.orologio.avanza(MINUTO);
  s.coda.aggiungi("pianifica_sincronizzazioni", {});
  await eseguiJob();
}

const chiamateRiepilogo = () => s.modelli.chiamateDi("riepilogo_news");

describe("Riepilogo News", () => {
  it("senza News nelle ultime 24 ore mostra lo stato vuoto senza chiamare il modello", async () => {
    const utente = await s.creaUtente("anna@esempio.it");
    const { casella } = await s.collegaGmail(utente, "anna@esempio.it");
    await eseguiJob();
    scriptClassificazione();
    scriptRiepilogo();
    casella.ricevi({ da: "vecchia@notizie.it", a: ["anna@esempio.it"], oggetto: "News di ieri", testo: "Notizie.", il: new Date(s.orologio.ora().getTime() - 25 * ORA) });
    s.coda.aggiungi("pianifica_sincronizzazioni", {});
    await eseguiJob();

    expect(await aggiornaRiepilogoNews(s.dip, utente)).toBe("vuoto");
    const vista = await s.perUtente(utente, (ctx) => vistaNews(s.dip, ctx));
    expect(vista.vuoto).toBe(true);
    expect(vista.voci).toEqual([]);
    expect(vista.membri).toEqual([]);
    expect(vista.nonIncluse).toBe(0);
    expect(chiamateRiepilogo()).toHaveLength(0);
  });

  it("raggruppa per 10 minuti, genera con una sola chiamata e collega ogni voce alle sue email", async () => {
    const { utente, ids } = await preparaNews();
    const inizio = s.orologio.ora();
    await s.perUtente(utente, (ctx) => programmaRiepilogoNews(s.dip, ctx));
    await s.perUtente(utente, (ctx) => programmaRiepilogoNews(s.dip, ctx));
    const job = s.coda.pendenti.filter((j) => j.nome === "aggiorna_riepilogo_news");
    expect(job).toHaveLength(1);
    expect(job[0]!.eseguiIl.getTime()).toBe(inizio.getTime() + 10 * MINUTO);

    await avanza(9 * MINUTO);
    expect(chiamateRiepilogo()).toHaveLength(0);
    await avanza(1 * MINUTO);
    expect(chiamateRiepilogo()).toHaveLength(1);

    const chiamata = chiamateRiepilogo()[0]!;
    expect(chiamata.dati.email.map((e: { oggetto: string }) => e.oggetto)).toEqual(["News 3", "News 2", "News 1"]);
    expect(chiamata.richiesta.sistema).toContain('tag "it"');

    const vista = await s.perUtente(utente, (ctx) => vistaNews(s.dip, ctx));
    expect(vista.vuoto).toBe(false);
    expect(vista.generatoIl?.getTime()).toBe(inizio.getTime() + 10 * MINUTO);
    expect(vista.voci).toEqual([
      { testo: "Voce A (3)", emailIds: [ids["News 3"]] },
      { testo: "Voce B (3)", emailIds: [ids["News 2"], ids["News 1"]] },
    ]);
    expect(vista.nonIncluse).toBe(0);
    expect(vista.membri.map((m) => m.oggetto)).toEqual(["News 3", "News 2", "News 1"]);
    expect(vista.membri[0]).toMatchObject({ emailId: ids["News 3"], casellaIndirizzo: "anna@esempio.it", nelRiepilogo: true });
    expect(vista.membri[0]!.mittente.indirizzo).toBe("bollettino2@notizie.it");
  });

  it("non richiama il modello se le email incluse non sono cambiate", async () => {
    const { utente } = await preparaNews();
    expect(await aggiornaRiepilogoNews(s.dip, utente)).toBe("generato");
    expect(await aggiornaRiepilogoNews(s.dip, utente)).toBe("invariato");
    await s.perUtente(utente, (ctx) => programmaRiepilogoNews(s.dip, ctx));
    await avanza(40 * MINUTO);
    expect(chiamateRiepilogo()).toHaveLength(1);
  });

  it("dopo una generazione la successiva rispetta i 30 minuti, mentre 'Aggiorna' la esegue subito", async () => {
    const { utente, casella } = await preparaNews(["News 1", "News 2"]);
    expect(await aggiornaRiepilogoNews(s.dip, utente)).toBe("generato");
    const generato = s.orologio.ora();

    s.orologio.avanza(2 * MINUTO);
    casella.ricevi({ da: "altro@notizie.it", a: ["anna@esempio.it"], oggetto: "News 3", testo: "Altre notizie.", il: s.orologio.ora() });
    s.coda.aggiungi("pianifica_sincronizzazioni", {});
    await eseguiJob();
    const prevista = await s.perUtente(utente, (ctx) => programmaRiepilogoNews(s.dip, ctx));
    expect(prevista.getTime()).toBe(generato.getTime() + 30 * MINUTO);
    expect((await s.perUtente(utente, (ctx) => vistaNews(s.dip, ctx))).nonIncluse).toBe(1);

    await s.perUtente(utente, (ctx) => aggiornaOra(s.dip, ctx));
    await eseguiJob();
    expect(chiamateRiepilogo()).toHaveLength(2);
    const vista = await s.perUtente(utente, (ctx) => vistaNews(s.dip, ctx));
    expect(vista.nonIncluse).toBe(0);
    expect(vista.membri).toHaveLength(3);
  });

  it("quando un'email esce dalle 24 ore la voce che la cita sparisce e le altre sue fonti contano come non incluse", async () => {
    const { utente, ids } = await preparaNews();
    expect(await aggiornaRiepilogoNews(s.dip, utente)).toBe("generato");
    const pendente = s.coda.pendenti.find((j) => j.chiave === chiaveUscitaNews(utente));
    // News 1 (05:00 del 21) esce alle 05:00 del 22; la rigenerazione segue la regola dei 10 minuti.
    expect(pendente?.eseguiIl.toISOString()).toBe("2026-09-22T05:10:00.000Z");

    s.orologio.imposta("2026-09-22T05:00:30Z");
    const vista = await s.perUtente(utente, (ctx) => vistaNews(s.dip, ctx));
    expect(vista.membri.map((m) => m.emailId)).toEqual([ids["News 3"], ids["News 2"]]);
    expect(vista.voci).toEqual([{ testo: "Voce A (3)", emailIds: [ids["News 3"]] }]);
    expect(vista.nonIncluse).toBe(1);
    expect(vista.membri.find((m) => m.emailId === ids["News 2"])?.nelRiepilogo).toBe(false);

    await avanza(10 * MINUTO);
    expect(chiamateRiepilogo()).toHaveLength(2);
    const dopo = await s.perUtente(utente, (ctx) => vistaNews(s.dip, ctx));
    expect(dopo.voci.map((v) => v.testo)).toEqual(["Voce A (2)", "Voce B (2)"]);
    expect(dopo.nonIncluse).toBe(0);
  });

  it("una News corretta in operativa esce subito dal riepilogo e ne provoca la rigenerazione", async () => {
    const { utente, ids } = await preparaNews();
    expect(await aggiornaRiepilogoNews(s.dip, utente)).toBe("generato");
    s.orologio.avanza(ORA);

    await s.perUtente(utente, async (ctx) => {
      await operativo.correggi(ctx, { tipo: "email", id: ids["News 2"]! }, "categoria", "operativa", "news", s.orologio.ora());
      await programmaRiepilogoNews(s.dip, ctx);
    });
    const vista = await s.perUtente(utente, (ctx) => vistaNews(s.dip, ctx));
    expect(vista.membri.map((m) => m.emailId)).toEqual([ids["News 3"], ids["News 1"]]);
    expect(vista.voci.map((v) => v.testo)).toEqual(["Voce A (3)"]);
    expect(vista.nonIncluse).toBe(1);

    await avanza(10 * MINUTO);
    expect(chiamateRiepilogo()).toHaveLength(2);
    expect(chiamateRiepilogo()[1]!.dati.email.map((e: { oggetto: string }) => e.oggetto)).toEqual(["News 3", "News 1"]);
    const dopo = await s.perUtente(utente, (ctx) => vistaNews(s.dip, ctx));
    expect(dopo.voci).toEqual([
      { testo: "Voce A (2)", emailIds: [ids["News 3"]] },
      { testo: "Voce B (2)", emailIds: [ids["News 1"]] },
    ]);
  });

  it("scarta una generazione se le email incluse cambiano mentre il modello risponde", async () => {
    const { utente, ids } = await preparaNews();
    const invoca = s.modelli.invoca.bind(s.modelli);
    let corretta = false;
    s.modelli.invoca = async (r: RichiestaModello) => {
      const esito = await invoca(r);
      if (r.funzione === "riepilogo_news" && !corretta) {
        corretta = true;
        await s.perUtente(utente, (ctx) => operativo.correggi(ctx, { tipo: "email", id: ids["News 2"]! }, "categoria", "operativa", "news", s.orologio.ora()));
      }
      return esito;
    };

    expect(await aggiornaRiepilogoNews(s.dip, utente)).toBe("superato");
    expect(await s.perUtente(utente, (ctx) => news.leggi(ctx))).toBeNull();
    expect(s.coda.pendenti.some((j) => j.nome === "aggiorna_riepilogo_news")).toBe(true);

    await avanza(10 * MINUTO);
    expect(chiamateRiepilogo()).toHaveLength(2);
    const vista = await s.perUtente(utente, (ctx) => vistaNews(s.dip, ctx));
    expect(vista.voci.flatMap((v) => v.emailIds).sort()).toEqual([ids["News 1"], ids["News 3"]].sort());
    expect(vista.nonIncluse).toBe(0);
  });

  it("con fonti in lingue diverse usa la lingua dell'interfaccia, che entra nella firma", async () => {
    s.dip.lingua = { rileva: (t) => ({ lingua: t.includes("Hallo") ? "de" : "en", affidabile: true }) };
    const utente = await s.creaUtente("anna@esempio.it");
    const { casella } = await s.collegaGmail(utente, "anna@esempio.it");
    await eseguiJob();
    scriptClassificazione();
    scriptRiepilogo();
    await s.perUtente(utente, (ctx) => impostazioni.aggiornaPreferenze(ctx, { lingua: "it" }, s.orologio.ora()));
    casella.ricevi({ da: "a@notizie.de", a: ["anna@esempio.it"], oggetto: "News DE", testo: "Hallo, heute gibt es Neuigkeiten.", il: new Date(s.orologio.ora().getTime() - ORA) });
    casella.ricevi({ da: "b@news.com", a: ["anna@esempio.it"], oggetto: "News EN", testo: "Here is today's news.", il: new Date(s.orologio.ora().getTime() - 2 * ORA) });
    s.coda.aggiungi("pianifica_sincronizzazioni", {});
    await eseguiJob();

    expect(await aggiornaRiepilogoNews(s.dip, utente)).toBe("generato");
    expect(chiamateRiepilogo()[0]!.richiesta.sistema).toContain('tag "it"');

    await s.perUtente(utente, (ctx) => impostazioni.aggiornaPreferenze(ctx, { lingua: "en" }, s.orologio.ora()));
    expect(await aggiornaRiepilogoNews(s.dip, utente)).toBe("generato");
    expect(chiamateRiepilogo()[1]!.richiesta.sistema).toContain('tag "en"');
  });

  it("corretta la lingua di una fonte, il riepilogo si rigenera con la regola dei 10/30 minuti nella nuova lingua", async () => {
    const { utente, ids } = await preparaNews(["News 1"]);
    expect(await aggiornaRiepilogoNews(s.dip, utente)).toBe("generato");
    const generato = s.orologio.ora();
    expect(chiamateRiepilogo()[0]!.richiesta.sistema).toContain('tag "it"');

    s.orologio.avanza(MINUTO);
    const prevista = await s.perUtente(utente, async (ctx) => {
      await posta.aggiornaLingua(ctx, ids["News 1"]!, "fr", "utente");
      return invalidaRiepilogoNews(s.dip, ctx);
    });
    expect(prevista.getTime()).toBe(generato.getTime() + 30 * MINUTO);
    await avanza(30 * MINUTO);
    expect(chiamateRiepilogo()).toHaveLength(2);
    expect(chiamateRiepilogo()[1]!.richiesta.sistema).toContain('tag "fr"');
  });

  it("'Aggiorna' rigenera anche a insieme invariato: riusa l'output se nulla è cambiato, richiama il modello se è cambiato il modello", async () => {
    const { utente } = await preparaNews();
    expect(await aggiornaRiepilogoNews(s.dip, utente)).toBe("generato");

    s.orologio.avanza(5 * MINUTO);
    await s.perUtente(utente, (ctx) => aggiornaOra(s.dip, ctx));
    const job = s.coda.pendenti.filter((j) => j.nome === "aggiorna_riepilogo_news" && j.chiave === `news:${utente}`);
    expect(job.map((j) => j.eseguiIl.getTime())).toEqual([s.orologio.ora().getTime()]);
    await eseguiJob();
    // Stesso input della generazione precedente: output riusato, nessuna nuova chiamata.
    expect(chiamateRiepilogo()).toHaveLength(1);
    const vista = await s.perUtente(utente, (ctx) => vistaNews(s.dip, ctx));
    expect(vista.generatoIl?.getTime()).toBe(s.orologio.ora().getTime());
    expect(vista.voci.map((v) => v.testo)).toEqual(["Voce A (3)", "Voce B (3)"]);

    await s.perUtente(utente, (ctx) => impostaModello(s.dip, ctx, "riepilogo_news", "anthropic/claude-riepilogo"));
    await s.perUtente(utente, (ctx) => aggiornaOra(s.dip, ctx));
    await eseguiJob();
    expect(chiamateRiepilogo()).toHaveLength(2);
    expect(chiamateRiepilogo()[1]!.modello).toBe("anthropic/claude-riepilogo");
  });

  it("un'email che l'AI ha ritenuto operativa entra nel riepilogo se l'utente la corregge in News", async () => {
    const { utente, casella } = await preparaNews(["News 1"]);
    s.modelli.quando("estrazione_attivita", () => ({ output: { elementi: [], titolo_situazione: null, descrizione_situazione: null } }));
    casella.ricevi({ da: "ufficio@cliente.it", a: ["anna@esempio.it"], oggetto: "Aggiornamento", testo: "Solo per conoscenza.", il: new Date(s.orologio.ora().getTime() - 30 * MINUTO) });
    await sincronizza();
    const ids = await idPerOggetto(utente);
    expect(await aggiornaRiepilogoNews(s.dip, utente)).toBe("generato");
    expect(chiamateRiepilogo()[0]!.dati.email.map((e: { oggetto: string }) => e.oggetto)).toEqual(["News 1"]);

    await s.perUtente(utente, async (ctx) => {
      await operativo.correggi(ctx, { tipo: "email", id: ids["Aggiornamento"]! }, "categoria", "news", "operativa", s.orologio.ora());
      await programmaRiepilogoNews(s.dip, ctx);
    });
    const vista = await s.perUtente(utente, (ctx) => vistaNews(s.dip, ctx));
    expect(vista.membri.map((m) => m.emailId)).toEqual([ids["Aggiornamento"], ids["News 1"]]);
    expect(vista.membri[0]!.nelRiepilogo).toBe(false);
    expect(vista.nonIncluse).toBe(1);

    await avanza(30 * MINUTO);
    expect(chiamateRiepilogo()).toHaveLength(2);
    expect(chiamateRiepilogo()[1]!.dati.email.map((e: { oggetto: string }) => e.oggetto)).toEqual(["Aggiornamento", "News 1"]);
    expect((await s.perUtente(utente, (ctx) => vistaNews(s.dip, ctx))).nonIncluse).toBe(0);
  });

  it("un'email eliminata nel provider esce dal riepilogo e nasconde la voce che la cita", async () => {
    const { utente, casella, ids, nelProvider } = await preparaNews();
    expect(await aggiornaRiepilogoNews(s.dip, utente)).toBe("generato");

    casella.elimina(nelProvider["News 2"]!);
    await sincronizza();
    const vista = await s.perUtente(utente, (ctx) => vistaNews(s.dip, ctx));
    expect(vista.membri.map((m) => m.emailId)).toEqual([ids["News 3"], ids["News 1"]]);
    expect(vista.voci).toEqual([{ testo: "Voce A (3)", emailIds: [ids["News 3"]] }]);
    expect(vista.nonIncluse).toBe(1);

    expect(await aggiornaRiepilogoNews(s.dip, utente)).toBe("generato");
    expect(chiamateRiepilogo()[1]!.dati.email.map((e: { oggetto: string }) => e.oggetto)).toEqual(["News 3", "News 1"]);
  });

  it("non include mai le News di un altro utente", async () => {
    const { utente, ids } = await preparaNews();
    const altro = await s.creaUtente("bruno@esempio.it");
    const { casella: casellaBruno } = await s.collegaGmail(altro, "bruno@esempio.it");
    await eseguiJob();
    casellaBruno.ricevi({ da: "redazione@notizie.it", a: ["bruno@esempio.it"], oggetto: "News di Bruno", testo: "Notizie per Bruno.", il: new Date(s.orologio.ora().getTime() - 30 * MINUTO) });
    await sincronizza();
    const idsBruno = await idPerOggetto(altro);

    expect(await aggiornaRiepilogoNews(s.dip, utente)).toBe("generato");
    expect(chiamateRiepilogo()[0]!.dati.email.map((e: { oggetto: string }) => e.oggetto)).toEqual(["News 3", "News 2", "News 1"]);
    const vistaAnna = await s.perUtente(utente, (ctx) => vistaNews(s.dip, ctx));
    expect(vistaAnna.membri.map((m) => m.emailId)).toEqual([ids["News 3"], ids["News 2"], ids["News 1"]]);

    expect(await aggiornaRiepilogoNews(s.dip, altro)).toBe("generato");
    const vistaBruno = await s.perUtente(altro, (ctx) => vistaNews(s.dip, ctx));
    expect(vistaBruno.membri.map((m) => m.emailId)).toEqual([idsBruno["News di Bruno"]]);
    expect(vistaBruno.voci.flatMap((v) => v.emailIds)).toEqual([idsBruno["News di Bruno"]]);
    expect(vistaBruno.membri[0]!.casellaIndirizzo).toBe("bruno@esempio.it");
  });

  it("conserva le voci cifrate e legate all'utente", async () => {
    const { utente, ids } = await preparaNews();
    expect(await aggiornaRiepilogoNews(s.dip, utente)).toBe("generato");
    const righe = await s.db.execute(sql`select voci_cifrate from riepilogo_news where utente_id = ${utente}`);
    const [riga] = (righe as unknown as { rows: { voci_cifrate: Uint8Array }[] }).rows;
    const grezzo = Buffer.from(riga!.voci_cifrate).toString("latin1");
    expect(grezzo).not.toContain("Voce A");
    expect(grezzo).not.toContain(ids["News 3"]!);
    // I dati associati legano il valore alla riga dell'utente: con un altro id la decifratura fallisce.
    await expect(
      s.perUtente(utente, (ctx) => ctx.codec.decifraJson("riepilogo_news", "voci", crypto.randomUUID(), riga!.voci_cifrate)),
    ).rejects.toThrow();
  });

  it("un errore definitivo resta un codice, non viene riaccodato e distanzia i tentativi successivi", async () => {
    const { utente } = await preparaNews();
    s.modelli.quando("riepilogo_news", () => ({ errore: "moderazione" }));
    // Il job già pianificato dalla classificazione delle News resta com'era: l'errore non ne aggiunge altri.
    const primaNews = s.coda.pendenti.filter((j) => j.nome === "aggiorna_riepilogo_news").map((j) => [j.chiave, j.eseguiIl.getTime()]);
    expect(await aggiornaRiepilogoNews(s.dip, utente)).toBe("errore");
    expect(s.coda.pendenti.filter((j) => j.nome === "aggiorna_riepilogo_news").map((j) => [j.chiave, j.eseguiIl.getTime()])).toEqual(primaNews);
    const vista = await s.perUtente(utente, (ctx) => vistaNews(s.dip, ctx));
    expect(vista).toMatchObject({ errore: "moderazione", voci: [], nonIncluse: 3, vuoto: false });

    for (let i = 0; i < 5; i++) expect(await aggiornaRiepilogoNews(s.dip, utente)).toBe("errore");
    const stato = await s.perUtente(utente, (ctx) => impostazioni.statoElaborazione(ctx));
    expect(stato?.newsErrori).toBe(6);
    expect(stato?.newsNonPrimaDi).not.toBeNull();
    // Con lo stesso insieme un nuovo cambio non ripete subito la stessa chiamata fallita.
    const prevista = await s.perUtente(utente, (ctx) => programmaRiepilogoNews(s.dip, ctx));
    expect(prevista.getTime()).toBe(stato!.newsNonPrimaDi!.getTime());
    expect(prevista.getTime()).toBeGreaterThan(s.orologio.ora().getTime() + 10 * MINUTO);

    // "Aggiorna" resta possibile subito; un successo azzera l'errore.
    scriptRiepilogo();
    await s.perUtente(utente, (ctx) => aggiornaOra(s.dip, ctx));
    await eseguiJob();
    const dopo = await s.perUtente(utente, (ctx) => vistaNews(s.dip, ctx));
    expect(dopo.errore).toBeNull();
    expect(dopo.nonIncluse).toBe(0);
    expect((await s.perUtente(utente, (ctx) => impostazioni.statoElaborazione(ctx)))?.newsNonPrimaDi).toBeNull();
  });
});
