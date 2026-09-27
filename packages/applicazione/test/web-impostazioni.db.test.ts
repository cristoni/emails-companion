import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DIRETTIVE_PREDEFINITE } from "@ec/ai";
import { MODELLO_PREDEFINITO } from "@ec/core/dominio";
import { caselle, impostazioni } from "@ec/db";
import {
  aggiornaPreferenze,
  avviaScollegamento,
  confermaImportazione,
  confermaRianalisi,
  confermaRianalisiImpostazioni,
  decidiImportazioneImpostazioni,
  impostaModello,
  pauseEffettiveImpostazioni,
  rifiutaImportazione,
  ripristinaDirettivePredefiniteImpostazioni,
  ripristinaModelloPredefinitoImpostazioni,
  ripristinaVersioneContestoImpostazioni,
  salvaChiaveOpenRouter,
  salvaContestoAi,
  stimaRianalisi,
  stimeImportazioneImpostazioni,
  vistaImpostazioni,
} from "../src";
import { creaScenario, type Scenario } from "./support/scenario";

let s: Scenario;
beforeEach(async () => {
  s = await creaScenario();
});
afterEach(async () => {
  await s.chiudi();
});

describe("impostazioni: stima dell'Importazione iniziale per casella", () => {
  it("riporta numero di email e costo della casella stimata, anche dopo la conferma, e nulla per le caselle scollegate", async () => {
    const utente = await s.creaUtente("anna@esempio.it");
    const { casella, casellaId } = await s.collegaGmail(utente, "anna@esempio.it");
    casella.ricevi({ da: "marco@esempio.example", a: ["anna@esempio.it"], oggetto: "Preventivo", testo: "Ecco il preventivo.", il: new Date(s.orologio.ora().getTime() - 3 * 86_400_000) });
    casella.ricevi({ da: "luca@esempio.example", a: ["anna@esempio.it"], oggetto: "Riunione", testo: "Ci vediamo lunedì.", il: new Date(s.orologio.ora().getTime() - 2 * 86_400_000) });

    // Prima della stima non c'è nulla da mostrare.
    expect(await s.perUtente(utente, (ctx) => stimeImportazioneImpostazioni(ctx))).toEqual({});

    await s.eseguiJob();
    const stime = await s.perUtente(utente, (ctx) => stimeImportazioneImpostazioni(ctx));
    expect(Object.keys(stime)).toEqual([casellaId]);
    expect(stime[casellaId!]).toMatchObject({ numeroEmail: 2 });
    expect(stime[casellaId!]!.costoStimato).toBeGreaterThan(0);
    expect(typeof stime[casellaId!]!.calcolataIl).toBe("string");

    const vista = await s.perUtente(utente, (ctx) => vistaImpostazioni(s.dip, ctx));
    expect(vista.caselle).toEqual([expect.objectContaining({ id: casellaId, faseImportazione: "stimata" })]);

    await s.perUtente(utente, (ctx) => confermaImportazione(s.dip, ctx, casellaId!));
    expect(Object.keys(await s.perUtente(utente, (ctx) => stimeImportazioneImpostazioni(ctx)))).toEqual([casellaId]);

    // Le stime sono per utente: un altro utente non vede la casella di Anna.
    const altro = await s.creaUtente("bruno@esempio.it");
    expect(await s.perUtente(altro, (ctx) => stimeImportazioneImpostazioni(ctx))).toEqual({});

    await s.perUtente(utente, (ctx) => avviaScollegamento(s.dip, ctx, casellaId!));
    await s.eseguiJob();
    expect(await s.perUtente(utente, (ctx) => stimeImportazioneImpostazioni(ctx))).toEqual({});
  });
});

describe("impostazioni: azioni con id di un altro utente", () => {
  it("scollegare, confermare o rinviare l'importazione di una casella altrui e confermare una rianalisi altrui non fanno nulla", async () => {
    const anna = await s.creaUtente("anna@esempio.it");
    const bruno = await s.creaUtente("bruno@esempio.it");
    const { casella, casellaId } = await s.collegaGmail(anna, "anna@esempio.it");
    casella.ricevi({ da: "marco@esempio.example", a: ["anna@esempio.it"], oggetto: "Preventivo", testo: "Ecco il preventivo.", il: new Date(s.orologio.ora().getTime() - 86_400_000) });
    await s.eseguiJob();

    expect(await s.perUtente(bruno, (ctx) => avviaScollegamento(s.dip, ctx, casellaId!))).toBe(false);
    expect(await s.perUtente(bruno, (ctx) => confermaImportazione(s.dip, ctx, casellaId!))).toBe(false);
    expect(await s.perUtente(bruno, (ctx) => rifiutaImportazione(s.dip, ctx, casellaId!))).toBe(false);
    // Le azioni di /settings lo dicono come "non trovata", non come importazione già decisa.
    expect(await s.perUtente(bruno, (ctx) => decidiImportazioneImpostazioni(s.dip, ctx, casellaId!, "conferma"))).toBe("non_trovata");
    expect(await s.perUtente(bruno, (ctx) => decidiImportazioneImpostazioni(s.dip, ctx, casellaId!, "rinvia"))).toBe("non_trovata");
    expect(await s.perUtente(anna, (ctx) => caselle.leggi(ctx, casellaId!))).toMatchObject({ stato: "collegata" });
    expect((await s.perUtente(anna, (ctx) => vistaImpostazioni(s.dip, ctx))).caselle).toEqual([
      expect.objectContaining({ id: casellaId, stato: "collegata", faseImportazione: "stimata" }),
    ]);

    const stima = await s.perUtente(anna, (ctx) => stimaRianalisi(s.dip, ctx, { tipo: "aperti" }));
    expect(await s.perUtente(bruno, (ctx) => confermaRianalisi(s.dip, ctx, stima.richiestaId))).toBe(false);
    expect(await s.perUtente(bruno, (ctx) => confermaRianalisiImpostazioni(s.dip, ctx, stima.richiestaId))).toBe("non_trovata");
    // La richiesta di Anna resta confermabile, una sola volta.
    expect(await s.perUtente(anna, (ctx) => confermaRianalisiImpostazioni(s.dip, ctx, stima.richiestaId))).toBe("ok");
    expect(await s.perUtente(anna, (ctx) => confermaRianalisiImpostazioni(s.dip, ctx, stima.richiestaId))).toBe("stima_scaduta");
    expect(await s.perUtente(anna, (ctx) => confermaRianalisiImpostazioni(s.dip, ctx, "non-un-id"))).toBe("non_trovata");
  });

  it("conferma e rinvio dell'importazione dalla pagina: ok sulla propria casella, già decisa se è cambiata, non trovata se scollegata", async () => {
    const anna = await s.creaUtente("anna@esempio.it");
    const { casella, casellaId } = await s.collegaGmail(anna, "anna@esempio.it");
    casella.ricevi({ da: "marco@esempio.example", a: ["anna@esempio.it"], oggetto: "Preventivo", testo: "Ecco il preventivo.", il: new Date(s.orologio.ora().getTime() - 86_400_000) });
    await s.eseguiJob();

    expect(await s.perUtente(anna, (ctx) => decidiImportazioneImpostazioni(s.dip, ctx, casellaId!, "rinvia"))).toBe("ok");
    expect(await s.perUtente(anna, (ctx) => decidiImportazioneImpostazioni(s.dip, ctx, casellaId!, "rinvia"))).toBe("gia_decisa");
    expect(await s.perUtente(anna, (ctx) => decidiImportazioneImpostazioni(s.dip, ctx, casellaId!, "conferma"))).toBe("ok");
    expect(await s.perUtente(anna, (ctx) => decidiImportazioneImpostazioni(s.dip, ctx, casellaId!, "conferma"))).toBe("gia_decisa");

    await s.perUtente(anna, (ctx) => avviaScollegamento(s.dip, ctx, casellaId!));
    expect(await s.perUtente(anna, (ctx) => decidiImportazioneImpostazioni(s.dip, ctx, casellaId!, "conferma"))).toBe("non_trovata");
    expect(await s.perUtente(anna, (ctx) => decidiImportazioneImpostazioni(s.dip, ctx, "non-un-id", "conferma"))).toBe("non_trovata");
  });
});

describe("impostazioni: pause effettive dell'analisi", () => {
  it("senza cause di pausa l'elenco è vuoto", async () => {
    const utente = await s.creaUtente("anna@esempio.it");
    expect(await s.perUtente(utente, (ctx) => pauseEffettiveImpostazioni(s.dip, ctx))).toEqual([]);
  });

  it("informativa non accettata e chiave assente fermano l'analisi anche senza una pausa registrata", async () => {
    const senzaChiave = await s.creaUtente("anna@esempio.it", { chiave: false });
    expect(await s.perUtente(senzaChiave, (ctx) => pauseEffettiveImpostazioni(s.dip, ctx))).toEqual([
      { funzione: "*", motivo: "chiave_mancante", dal: null, prossimaVerifica: null },
    ]);
    const senzaConsenso = await s.creaUtente("bruno@esempio.it", { consenso: false });
    expect(await s.perUtente(senzaConsenso, (ctx) => pauseEffettiveImpostazioni(s.dip, ctx))).toEqual([
      { funzione: "*", motivo: "consenso_mancante", dal: null, prossimaVerifica: null },
    ]);
  });

  it("pausa manuale, chiave non valida e modello incompatibile compaiono con il loro motivo; le righe registrate portano l'istante", async () => {
    const utente = await s.creaUtente("anna@esempio.it");
    const bruno = await s.creaUtente("bruno@esempio.it");
    await s.perUtente(utente, (ctx) => aggiornaPreferenze(s.dip, ctx, { pausaManuale: true }));
    s.modelli.statoChiave = { stato: "non_valida" };
    expect(await s.perUtente(utente, (ctx) => salvaChiaveOpenRouter(s.dip, ctx, "sk-or-v1-chiaveincollatamale0123456789"))).toBe("non_valida");
    const ora = s.orologio.ora();
    await s.perUtente(utente, async (ctx) => {
      await impostazioni.impostaModello(ctx, "riepilogo_news", "anthropic/modello-di-prova", "incompatibile", ora);
      await impostazioni.apriPausa(ctx, "bozze_assistite", "modello_non_disponibile", crypto.randomUUID(), ora);
    });

    expect(await s.perUtente(utente, (ctx) => pauseEffettiveImpostazioni(s.dip, ctx))).toEqual([
      { funzione: "*", motivo: "pausa_manuale", dal: null, prossimaVerifica: null },
      { funzione: "*", motivo: "chiave_non_valida", dal: null, prossimaVerifica: null },
      { funzione: "riepilogo_news", motivo: "modello_incompatibile", dal: null, prossimaVerifica: null },
      { funzione: "bozze_assistite", motivo: "modello_non_disponibile", dal: ora.toISOString(), prossimaVerifica: null },
    ]);

    // Un'altra persona non vede le pause di Anna.
    expect(await s.perUtente(bruno, (ctx) => pauseEffettiveImpostazioni(s.dip, ctx))).toEqual([]);
  });
});

describe("impostazioni: ripristino del modello predefinito", () => {
  it("riporta la Funzione AI al modello predefinito se compatibile, altrimenti lascia il modello scelto e restituisce l'esito", async () => {
    const utente = await s.creaUtente("anna@esempio.it");
    expect(await s.perUtente(utente, (ctx) => impostaModello(s.dip, ctx, "riepilogo_news", "anthropic/modello-di-prova"))).toBe("ok");
    let vista = await s.perUtente(utente, (ctx) => vistaImpostazioni(s.dip, ctx));
    expect(vista.modelli.find((m) => m.funzione === "riepilogo_news")).toMatchObject({ modello: "anthropic/modello-di-prova", predefinito: MODELLO_PREDEFINITO });

    s.modelli.compatibilita = "incompatibile";
    expect(await s.perUtente(utente, (ctx) => ripristinaModelloPredefinitoImpostazioni(s.dip, ctx, "riepilogo_news"))).toBe("incompatibile");
    vista = await s.perUtente(utente, (ctx) => vistaImpostazioni(s.dip, ctx));
    expect(vista.modelli.find((m) => m.funzione === "riepilogo_news")?.modello).toBe("anthropic/modello-di-prova");

    s.modelli.compatibilita = "ok";
    expect(await s.perUtente(utente, (ctx) => ripristinaModelloPredefinitoImpostazioni(s.dip, ctx, "riepilogo_news"))).toBe("ok");
    vista = await s.perUtente(utente, (ctx) => vistaImpostazioni(s.dip, ctx));
    expect(vista.modelli.find((m) => m.funzione === "riepilogo_news")).toMatchObject({ modello: MODELLO_PREDEFINITO, stato: "ok" });
    // Le altre funzioni non cambiano.
    expect(vista.modelli.filter((m) => m.funzione !== "riepilogo_news").every((m) => m.modello === MODELLO_PREDEFINITO)).toBe(true);
  });
});

describe("impostazioni: versioni del Contesto AI", () => {
  it("ripristinare una versione ne salva il testo come nuova versione, senza toccare le precedenti", async () => {
    const utente = await s.creaUtente("anna@esempio.it");
    expect(await s.perUtente(utente, (ctx) => salvaContestoAi(s.dip, ctx, "Mittenti importanti: cliente@esempio.example"))).toBe(1);
    expect(await s.perUtente(utente, (ctx) => salvaContestoAi(s.dip, ctx, "Nessun mittente importante"))).toBe(2);

    expect(await s.perUtente(utente, (ctx) => ripristinaVersioneContestoImpostazioni(s.dip, ctx, 1))).toBe(3);
    const vista = await s.perUtente(utente, (ctx) => vistaImpostazioni(s.dip, ctx));
    expect(vista.contestoAi.corrente).toBe(3);
    expect(vista.contestoAi.versioni.map((v) => [v.numero, v.testo])).toEqual([
      [3, "Mittenti importanti: cliente@esempio.example"],
      [2, "Nessun mittente importante"],
      [1, "Mittenti importanti: cliente@esempio.example"],
    ]);
  });

  it("una versione inesistente, di un altro utente o non valida non crea nulla", async () => {
    const anna = await s.creaUtente("anna@esempio.it");
    const bruno = await s.creaUtente("bruno@esempio.it");
    await s.perUtente(anna, (ctx) => salvaContestoAi(s.dip, ctx, "Contesto di Anna"));

    expect(await s.perUtente(bruno, (ctx) => ripristinaVersioneContestoImpostazioni(s.dip, ctx, 1))).toBeNull();
    expect(await s.perUtente(anna, (ctx) => ripristinaVersioneContestoImpostazioni(s.dip, ctx, 7))).toBeNull();
    expect(await s.perUtente(anna, (ctx) => ripristinaVersioneContestoImpostazioni(s.dip, ctx, 0))).toBeNull();
    expect(await s.perUtente(anna, (ctx) => ripristinaVersioneContestoImpostazioni(s.dip, ctx, 1.5))).toBeNull();

    expect((await s.perUtente(bruno, (ctx) => vistaImpostazioni(s.dip, ctx))).contestoAi).toEqual({ corrente: null, versioni: [] });
    expect((await s.perUtente(anna, (ctx) => vistaImpostazioni(s.dip, ctx))).contestoAi.corrente).toBe(1);
  });

  it("ripristinare le Direttive predefinite crea una nuova versione con il loro testo", async () => {
    const utente = await s.creaUtente("anna@esempio.it");
    await s.perUtente(utente, (ctx) => salvaContestoAi(s.dip, ctx, "Tutto è urgente"));
    expect(await s.perUtente(utente, (ctx) => ripristinaDirettivePredefiniteImpostazioni(s.dip, ctx))).toBe(2);
    const vista = await s.perUtente(utente, (ctx) => vistaImpostazioni(s.dip, ctx));
    expect(vista.contestoAi.versioni[0]).toMatchObject({ numero: 2, testo: DIRETTIVE_PREDEFINITE.trim() });
    expect(vista.contestoAi.versioni[1]).toMatchObject({ numero: 1, testo: "Tutto è urgente" });
  });
});
