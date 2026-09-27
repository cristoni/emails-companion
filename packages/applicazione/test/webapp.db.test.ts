import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { impostazioni, posta } from "@ec/db";
import { avviaScollegamento, confermaImportazione, richiediEliminazioneAccount, rimuoviChiaveOpenRouter, statoOnboarding, vistaEmail } from "../src";
import { creaScenario, type Scenario } from "./support/scenario";

let s: Scenario;
beforeEach(async () => {
  s = await creaScenario();
});
afterEach(async () => {
  await s.chiudi();
});

async function conta(query: ReturnType<typeof sql>): Promise<number> {
  const r = await s.db.execute(query);
  return Number((r as unknown as { rows: { n: string }[] }).rows[0]!.n);
}

function nessunaAnalisi() {
  s.modelli
    .quando("classificazione_priorita", () => ({
      output: { categoria: "informativa", urgente: false, base_urgenza: "dedotto", priorita: "bassa", motivazione: "m", titolo_situazione: "T", descrizione_situazione: "D", evidenze: [] },
    }))
    .quando("estrazione_attivita", () => ({ output: { elementi: [], titolo_situazione: null, descrizione_situazione: null } }))
    .quando("attese_risposte", () => ({ output: { richieste: [], collegamenti: [], valutazioni: [], completamenti: [] } }));
}

describe("stato dell'onboarding", () => {
  it("porta all'onboarding solo senza informativa o senza chiave; il resto è un avviso", async () => {
    const senzaNulla = await s.creaUtente("anna@esempio.it", { consenso: false, chiave: false });
    let stato = await s.perUtente(senzaNulla, (ctx) => statoOnboarding(s.dip, ctx));
    expect(stato).toMatchObject({ consenso: false, chiave: null, essenziale: false, completo: false });

    const utente = await s.creaUtente("bruno@esempio.it");
    const { casellaId } = await s.collegaGmail(utente, "bruno@esempio.it");
    await s.eseguiJob();
    stato = await s.perUtente(utente, (ctx) => statoOnboarding(s.dip, ctx));
    expect(stato).toMatchObject({ consenso: true, chiave: "valida", essenziale: true, completo: false, importazioniDaDecidere: [casellaId] });

    await s.perUtente(utente, (ctx) => confermaImportazione(s.dip, ctx, casellaId!));
    stato = await s.perUtente(utente, (ctx) => statoOnboarding(s.dip, ctx));
    expect(stato).toMatchObject({ essenziale: true, completo: true, importazioniDaDecidere: [] });

    // Una casella in scollegamento non blocca l'onboarding; una chiave rimossa sì.
    await s.perUtente(utente, (ctx) => avviaScollegamento(s.dip, ctx, casellaId!));
    await s.perUtente(utente, (ctx) => rimuoviChiaveOpenRouter(ctx));
    stato = await s.perUtente(utente, (ctx) => statoOnboarding(s.dip, ctx));
    expect(stato).toMatchObject({ chiave: null, essenziale: false, completo: false, importazioniDaDecidere: [] });
  });
});

describe("link all'originale nelle viste", () => {
  it("ogni copia ha il link del provider costruito senza caricare credenziali", async () => {
    const utente = await s.creaUtente("anna@esempio.it");
    const { casella, casellaId } = await s.collegaGmail(utente, "anna@esempio.it");
    await s.eseguiJob();
    await s.perUtente(utente, (ctx) => confermaImportazione(s.dip, ctx, casellaId!));
    await s.eseguiJob();
    nessunaAnalisi();
    const idConnettore = casella.ricevi({ da: "marco@cliente.it", a: ["anna@esempio.it"], oggetto: "Ciao", testo: "Un saluto.", il: s.orologio.ora() });
    s.orologio.avanza(2 * 60 * 1000);
    s.coda.aggiungi("pianifica_sincronizzazioni", {});
    await s.eseguiJob();

    const copia = await s.perUtente(utente, (ctx) => posta.trovaCopia(ctx, casellaId!, idConnettore));
    const vista = await s.perUtente(utente, (ctx) => vistaEmail(s.dip, ctx, copia!.emailId));
    expect(vista?.copie).toEqual([expect.objectContaining({ casellaId, linkOriginale: `https://mail.finta.test/anna%40esempio.it#${idConnettore}` })]);
  });
});

describe("eliminazione dell'account dalla webapp", () => {
  it("mette subito in pausa l'analisi, poi il worker revoca, scollega e cancella tutto", async () => {
    const utente = await s.creaUtente("anna@esempio.it");
    const { casella, casellaId } = await s.collegaGmail(utente, "anna@esempio.it");
    await s.eseguiJob();
    await s.perUtente(utente, (ctx) => confermaImportazione(s.dip, ctx, casellaId!));
    nessunaAnalisi();
    casella.ricevi({ da: "marco@cliente.it", a: ["anna@esempio.it"], oggetto: "Ciao", testo: "Un saluto.", il: s.orologio.ora() });
    await s.eseguiJob();
    expect(await conta(sql`select count(*) as n from email where utente_id = ${utente}`)).toBeGreaterThan(0);

    await s.perUtente(utente, (ctx) => richiediEliminazioneAccount(s.dip, ctx));
    expect((await s.perUtente(utente, (ctx) => impostazioni.preferenze(ctx))).pausaManuale).toBe(true);
    expect(s.coda.pendenti.filter((j) => j.nome === "elimina_account")).toHaveLength(1);
    // Una seconda richiesta non accoda un secondo job.
    await s.perUtente(utente, (ctx) => richiediEliminazioneAccount(s.dip, ctx));
    expect(s.coda.pendenti.filter((j) => j.nome === "elimina_account")).toHaveLength(1);

    await s.eseguiJob();
    expect(casella.revocata).toBe(true);
    expect(await conta(sql`select count(*) as n from auth_utente where id = ${utente}`)).toBe(0);
    // Nessuna riga resta in alcuna tabella con i dati dell'utente.
    const tabelle = await s.db.execute(
      sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'utente_id'`,
    );
    const nomi = (tabelle as unknown as { rows: { table_name: string }[] }).rows.map((r) => r.table_name);
    expect(nomi).toContain("email_copia");
    for (const tabella of nomi) {
      expect(await conta(sql`select count(*) as n from ${sql.identifier(tabella)} where utente_id = ${utente}`), tabella).toBe(0);
    }
  });
});
