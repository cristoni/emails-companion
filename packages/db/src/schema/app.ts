import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { authUtente } from "./auth";

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => "bytea",
  toDriver: (valore) => Buffer.from(valore),
  fromDriver: (valore) => new Uint8Array(valore),
});

const ts = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const tsOpz = () => timestamp({ withTimezone: true });

const utente = () =>
  text()
    .notNull()
    .references(() => authUtente.id, { onDelete: "cascade" });

export interface AvanzamentoImportazione {
  totale: number;
  acquisite: number;
  elenchiPendenti: number;
  lottiPendenti: number;
}

// ── Utente ────────────────────────────────────────────────────────────────

export const chiaveUtente = pgTable("chiave_utente", {
  utenteId: text()
    .primaryKey()
    .references(() => authUtente.id, { onDelete: "cascade" }),
  dekCifrata: bytea().notNull(),
  versioneKek: integer().notNull(),
  creataIl: ts(),
}).enableRLS();

export const preferenzeUtente = pgTable("preferenze_utente", {
  utenteId: text()
    .primaryKey()
    .references(() => authUtente.id, { onDelete: "cascade" }),
  lingua: text().notNull().default("en"),
  tema: text().notNull().default("sistema"),
  fusoOrario: text().notNull().default("UTC"),
  pausaManuale: boolean().notNull().default(false),
  aggiornateIl: ts(),
}).enableRLS();

export const consensoUtente = pgTable(
  "consenso_utente",
  {
    id: uuid().primaryKey(),
    utenteId: utente(),
    versioneInformativa: text().notNull(),
    accettatoIl: ts(),
  },
  (t) => [unique("consenso_utente_versione_uq").on(t.utenteId, t.versioneInformativa)],
).enableRLS();

export const chiaveOpenrouter = pgTable("chiave_openrouter", {
  utenteId: text()
    .primaryKey()
    .references(() => authUtente.id, { onDelete: "cascade" }),
  chiaveCifrata: bytea().notNull(),
  ultimeCifre: text().notNull(),
  etichetta: text(),
  stato: text().notNull(),
  limiteResiduo: doublePrecision(),
  verificataIl: tsOpz(),
  aggiornataIl: ts(),
}).enableRLS();

export const impostazioneModello = pgTable(
  "impostazione_modello",
  {
    utenteId: utente(),
    funzione: text().notNull(),
    modello: text().notNull(),
    stato: text().notNull().default("ok"),
    verificataIl: tsOpz(),
  },
  (t) => [primaryKey({ columns: [t.utenteId, t.funzione] })],
).enableRLS();

export const contestoAi = pgTable(
  "contesto_ai",
  {
    id: uuid().primaryKey(),
    utenteId: utente(),
    numero: integer().notNull(),
    testoCifrato: bytea().notNull(),
    creatoIl: ts(),
  },
  (t) => [unique("contesto_ai_numero_uq").on(t.utenteId, t.numero)],
).enableRLS();

export const pausaAi = pgTable(
  "pausa_ai",
  {
    id: uuid().primaryKey(),
    utenteId: utente(),
    /** '*' = tutte le funzioni. */
    funzione: text().notNull().default("*"),
    motivo: text().notNull(),
    dal: ts(),
    prossimaVerifica: tsOpz(),
  },
  (t) => [unique("pausa_ai_uq").on(t.utenteId, t.funzione, t.motivo)],
).enableRLS();

export const statoElaborazioneUtente = pgTable("stato_elaborazione_utente", {
  utenteId: text()
    .primaryKey()
    .references(() => authUtente.id, { onDelete: "cascade" }),
  riconciliazioneNonPrimaDi: tsOpz(),
  riconciliazioneErrori: integer().notNull().default(0),
  riconciliazioneErrore: text(),
  newsNonPrimaDi: tsOpz(),
  newsErrori: integer().notNull().default(0),
  newsErrore: text(),
  aggiornatoIl: ts(),
}).enableRLS();

// ── Caselle ───────────────────────────────────────────────────────────────

export const casella = pgTable(
  "casella",
  {
    id: uuid().primaryKey(),
    utenteId: utente(),
    connettore: text().notNull(),
    indirizzoCifrato: bytea(),
    indirizzoGlobale: text(),
    accountEsternoGlobale: text(),
    stato: text().notNull(),
    scopeConcessi: text().array().notNull().default(sql`'{}'::text[]`),
    ultimoErrore: text(),
    collegataIl: ts(),
    scollegataIl: tsOpz(),
    aggiornataIl: ts(),
  },
  (t) => [
    unique("casella_utente_id_uq").on(t.utenteId, t.id),
    uniqueIndex("casella_account_esclusivo_uq")
      .on(t.connettore, t.accountEsternoGlobale)
      .where(sql`${t.stato} <> 'scollegata' AND ${t.accountEsternoGlobale} IS NOT NULL`),
    index("casella_indirizzo_globale_idx").on(t.indirizzoGlobale),
    check(
      "casella_stato_ck",
      sql`${t.stato} IN ('collegata','permessi_incompleti','da_ricollegare','scollegamento_in_corso','scollegata')`,
    ),
  ],
).enableRLS();

const riferimentoCasella = (t: { utenteId: any; casellaId: any }, nome: string) =>
  foreignKey({ name: nome, columns: [t.utenteId, t.casellaId], foreignColumns: [casella.utenteId, casella.id] }).onDelete(
    "cascade",
  );

export const credenzialeCasella = pgTable(
  "credenziale_casella",
  {
    casellaId: uuid().primaryKey(),
    utenteId: utente(),
    refreshTokenCifrato: bytea(),
    accessTokenCifrato: bytea(),
    scadenzaAccesso: tsOpz(),
    generazione: integer().notNull().default(1),
    aggiornataIl: ts(),
  },
  (t) => [riferimentoCasella(t, "credenziale_casella_fk")],
).enableRLS();

export const sincronizzazioneCasella = pgTable(
  "sincronizzazione_casella",
  {
    casellaId: uuid().primaryKey(),
    utenteId: utente(),
    cursore: text(),
    cursoreProvvisorio: text(),
    faseImportazione: text().notNull().default("da_stimare"),
    riferimentoImportazione: ts(),
    finestraRicevuteDa: ts(),
    finestraInviateDa: ts(),
    stima: jsonb().$type<{ numeroEmail: number; costoStimato: number; calcolataIl: string; modelli: Record<string, string> }>(),
    importazioneConfermataIl: tsOpz(),
    avanzamento: jsonb().$type<AvanzamentoImportazione>(),
    ultimaSyncOk: tsOpz(),
    ultimaNotifica: tsOpz(),
    scadenzaWatch: tsOpz(),
    nonPrimaDi: tsOpz(),
    erroriConsecutivi: integer().notNull().default(0),
    ultimoErrore: text(),
    aggiornataIl: ts(),
  },
  (t) => [riferimentoCasella(t, "sincronizzazione_casella_fk")],
).enableRLS();

export const indirizzoUtente = pgTable(
  "indirizzo_utente",
  {
    id: uuid().primaryKey(),
    utenteId: utente(),
    casellaId: uuid().notNull(),
    indirizzoIndice: text().notNull(),
    indirizzoCifrato: bytea().notNull(),
    origine: text().notNull(),
  },
  (t) => [
    riferimentoCasella(t, "indirizzo_utente_casella_fk"),
    unique("indirizzo_utente_uq").on(t.utenteId, t.casellaId, t.indirizzoIndice),
    index("indirizzo_utente_indice_idx").on(t.utenteId, t.indirizzoIndice),
  ],
).enableRLS();

// ── Posta ─────────────────────────────────────────────────────────────────

export const email = pgTable(
  "email",
  {
    id: uuid().primaryKey(),
    utenteId: utente(),
    messageIdIndice: text(),
    mittenteIndice: text().notNull(),
    hashContenutoIndice: text().notNull(),
    direzione: text().notNull(),
    mittenteCifrato: bytea().notNull(),
    destinatariCifrati: bytea().notNull(),
    destinatariIndici: text().array().notNull().default(sql`'{}'::text[]`),
    dominioMittenteIndice: text(),
    oggettoCifrato: bytea().notNull(),
    testoCifrato: bytea().notNull(),
    anteprimaCifrata: bytea().notNull(),
    inReplyToIndice: text(),
    referencesIndici: text().array().notNull().default(sql`'{}'::text[]`),
    nomiAllegatiCifrati: bytea(),
    ricevutaIl: timestamp({ withTimezone: true }).notNull(),
    lingua: text().notNull(),
    fonteLingua: text().notNull(),
    soloPerRisposte: boolean().notNull().default(false),
    statoRiconciliazione: text().notNull().default("in_attesa"),
    riconciliataIl: tsOpz(),
    creataIl: ts(),
  },
  (t) => [
    unique("email_utente_id_uq").on(t.utenteId, t.id),
    uniqueIndex("email_logica_uq")
      .on(t.utenteId, t.messageIdIndice, t.mittenteIndice, t.hashContenutoIndice)
      .where(sql`${t.messageIdIndice} IS NOT NULL`),
    index("email_ricevuta_idx").on(t.utenteId, t.ricevutaIl),
    index("email_message_id_idx").on(t.utenteId, t.messageIdIndice),
    index("email_in_reply_to_idx").on(t.utenteId, t.inReplyToIndice),
    index("email_riconciliazione_idx").on(t.utenteId, t.statoRiconciliazione),
    index("email_references_gin").using("gin", t.referencesIndici),
    index("email_destinatari_gin").using("gin", t.destinatariIndici),
    check("email_direzione_ck", sql`${t.direzione} IN ('entrata','uscita','interna')`),
  ],
).enableRLS();

const riferimentoEmail = (t: { utenteId: any; emailId: any }, nome: string) =>
  foreignKey({ name: nome, columns: [t.utenteId, t.emailId], foreignColumns: [email.utenteId, email.id] }).onDelete(
    "cascade",
  );

export const emailCopia = pgTable(
  "email_copia",
  {
    id: uuid().primaryKey(),
    utenteId: utente(),
    casellaId: uuid().notNull(),
    emailId: uuid().notNull(),
    idConnettore: text().notNull(),
    threadConnettore: text(),
    cartelle: text().array().notNull(),
    etichette: text().array().notNull().default(sql`'{}'::text[]`),
    origineInvio: text(),
    eliminataNelProvider: boolean().notNull().default(false),
    acquisitaIl: ts(),
  },
  (t) => [
    riferimentoCasella(t, "email_copia_casella_fk"),
    riferimentoEmail(t, "email_copia_email_fk"),
    unique("email_copia_connettore_uq").on(t.casellaId, t.idConnettore),
    index("email_copia_thread_idx").on(t.utenteId, t.casellaId, t.threadConnettore),
    index("email_copia_email_idx").on(t.emailId),
  ],
).enableRLS();

export const statoFunzioneEmail = pgTable(
  "stato_funzione_email",
  {
    emailId: uuid().notNull(),
    funzione: text().notNull(),
    utenteId: utente(),
    stato: text().notNull(),
    motivo: text(),
    analisiId: uuid(),
    aggiornatoIl: ts(),
  },
  (t) => [
    primaryKey({ columns: [t.emailId, t.funzione] }),
    riferimentoEmail(t, "stato_funzione_email_fk"),
    index("stato_funzione_email_stato_idx").on(t.utenteId, t.funzione, t.stato),
  ],
).enableRLS();

export const analisiAi = pgTable(
  "analisi_ai",
  {
    id: uuid().primaryKey(),
    utenteId: utente(),
    funzione: text().notNull(),
    modelloRichiesto: text().notNull(),
    modelloServito: text(),
    fornitore: text(),
    versionePrompt: text().notNull(),
    contestoAiVersione: integer(),
    lingua: text().notNull(),
    emailId: uuid(),
    hashInputIndice: text().notNull(),
    stato: text().notNull(),
    outputCifrato: bytea(),
    errore: text(),
    tokenIngresso: integer(),
    tokenUscita: integer(),
    costo: doublePrecision(),
    latenzaMs: integer(),
    idGenerazione: text(),
    richiestaRianalisiId: uuid(),
    avviataIl: ts(),
    completataIl: tsOpz(),
  },
  (t) => [
    unique("analisi_ai_utente_id_uq").on(t.utenteId, t.id),
    uniqueIndex("analisi_ai_claim_uq")
      .on(t.utenteId, t.funzione, t.hashInputIndice)
      .where(sql`${t.stato} IN ('in_corso','completata')`),
    index("analisi_ai_email_idx").on(t.utenteId, t.emailId),
    index("analisi_ai_consumo_idx").on(t.utenteId, t.funzione, t.avviataIl),
  ],
).enableRLS();

export const classificazioneEmail = pgTable(
  "classificazione_email",
  {
    emailId: uuid().primaryKey(),
    utenteId: utente(),
    categoria: text().notNull(),
    urgente: boolean().notNull(),
    baseUrgenza: text().notNull(),
    priorita: text().notNull(),
    motivazioneCifrata: bytea().notNull(),
    titoloSituazioneCifrato: bytea(),
    descrizioneSituazioneCifrata: bytea(),
    analisiId: uuid(),
    aggiornataIl: ts(),
  },
  (t) => [
    unique("classificazione_email_utente_uq").on(t.utenteId, t.emailId),
    riferimentoEmail(t, "classificazione_email_fk"),
  ],
).enableRLS();

// ── Vista operativa ───────────────────────────────────────────────────────

export const situazione = pgTable(
  "situazione",
  {
    id: uuid().primaryKey(),
    utenteId: utente(),
    emailOrigineId: uuid().notNull(),
    titoloCifrato: bytea().notNull(),
    descrizioneCifrata: bytea().notNull(),
    lingua: text().notNull(),
    assorbitaIn: uuid(),
    gestitaIl: tsOpz(),
    archiviataIl: tsOpz(),
    ultimaAttivita: ts(),
    creataIl: ts(),
    aggiornataIl: ts(),
  },
  (t) => [
    unique("situazione_utente_id_uq").on(t.utenteId, t.id),
    unique("situazione_origine_uq").on(t.utenteId, t.emailOrigineId),
    foreignKey({
      name: "situazione_email_origine_fk",
      columns: [t.utenteId, t.emailOrigineId],
      foreignColumns: [email.utenteId, email.id],
    }),
    index("situazione_attivita_idx").on(t.utenteId, t.ultimaAttivita),
  ],
).enableRLS();

const riferimentoSituazione = (t: { utenteId: any; situazioneId: any }, nome: string) =>
  foreignKey({
    name: nome,
    columns: [t.utenteId, t.situazioneId],
    foreignColumns: [situazione.utenteId, situazione.id],
  }).onDelete("cascade");

export const collegamento = pgTable(
  "collegamento",
  {
    id: uuid().primaryKey(),
    utenteId: utente(),
    emailId: uuid().notNull(),
    situazioneId: uuid().notNull(),
    origine: text().notNull(),
    ruolo: text().notNull(),
    stato: text().notNull(),
    confidenza: doublePrecision(),
    analisiId: uuid(),
    creatoIl: ts(),
    aggiornatoIl: ts(),
  },
  (t) => [
    unique("collegamento_utente_id_uq").on(t.utenteId, t.id),
    unique("collegamento_coppia_uq").on(t.emailId, t.situazioneId),
    riferimentoEmail(t, "collegamento_email_fk"),
    riferimentoSituazione(t, "collegamento_situazione_fk"),
    index("collegamento_situazione_idx").on(t.situazioneId),
  ],
).enableRLS();

export const attivita = pgTable(
  "attivita",
  {
    id: uuid().primaryKey(),
    utenteId: utente(),
    situazioneId: uuid().notNull(),
    emailSorgenteId: uuid().notNull(),
    slot: integer().notNull(),
    descrizioneCifrata: bytea().notNull(),
    scadenza: tsOpz(),
    scadenzaCitazioneCifrata: bytea(),
    priorita: text().notNull(),
    urgente: boolean().notNull().default(false),
    base: text().notNull(),
    stato: text().notNull(),
    completataDa: text(),
    emailCompletamentoId: uuid(),
    completataIl: tsOpz(),
    analisiId: uuid(),
    creataIl: ts(),
    aggiornataIl: ts(),
  },
  (t) => [
    unique("attivita_utente_id_uq").on(t.utenteId, t.id),
    unique("attivita_slot_uq").on(t.emailSorgenteId, t.slot),
    riferimentoSituazione(t, "attivita_situazione_fk"),
    foreignKey({
      name: "attivita_email_fk",
      columns: [t.utenteId, t.emailSorgenteId],
      foreignColumns: [email.utenteId, email.id],
    }).onDelete("cascade"),
    index("attivita_situazione_idx").on(t.situazioneId),
  ],
).enableRLS();

export const attesa = pgTable(
  "attesa",
  {
    id: uuid().primaryKey(),
    utenteId: utente(),
    situazioneId: uuid().notNull(),
    emailRichiestaId: uuid().notNull(),
    slot: integer().notNull(),
    destinatariCifrati: bytea().notNull(),
    destinatariIndici: text().array().notNull().default(sql`'{}'::text[]`),
    oggettoCifrato: bytea().notNull(),
    dataAttesa: tsOpz(),
    dataAttesaCitazioneCifrata: bytea(),
    ciclo: text().notNull(),
    base: text().notNull(),
    analisiId: uuid(),
    creataIl: ts(),
    aggiornataIl: ts(),
  },
  (t) => [
    unique("attesa_utente_id_uq").on(t.utenteId, t.id),
    unique("attesa_slot_uq").on(t.emailRichiestaId, t.slot),
    riferimentoSituazione(t, "attesa_situazione_fk"),
    foreignKey({
      name: "attesa_email_fk",
      columns: [t.utenteId, t.emailRichiestaId],
      foreignColumns: [email.utenteId, email.id],
    }).onDelete("cascade"),
    index("attesa_situazione_idx").on(t.situazioneId),
    index("attesa_destinatari_gin").using("gin", t.destinatariIndici),
  ],
).enableRLS();

const riferimentoAttesa = (t: { utenteId: any; attesaId: any }, nome: string) =>
  foreignKey({ name: nome, columns: [t.utenteId, t.attesaId], foreignColumns: [attesa.utenteId, attesa.id] }).onDelete(
    "cascade",
  );

export const attesaRequisito = pgTable(
  "attesa_requisito",
  {
    id: uuid().primaryKey(),
    utenteId: utente(),
    attesaId: uuid().notNull(),
    descrizioneCifrata: bytea().notNull(),
    ordine: integer().notNull(),
  },
  (t) => [
    unique("attesa_requisito_utente_id_uq").on(t.utenteId, t.id),
    riferimentoAttesa(t, "attesa_requisito_attesa_fk"),
  ],
).enableRLS();

export const rispostaArrivata = pgTable(
  "risposta_arrivata",
  {
    id: uuid().primaryKey(),
    utenteId: utente(),
    attesaId: uuid().notNull(),
    emailId: uuid().notNull(),
    origine: text().notNull(),
    statoCollegamento: text().notNull(),
    confidenza: doublePrecision(),
    valutazione: text().notNull(),
    motivazioneCifrata: bytea(),
    revisione: text().notNull().default("da_vedere"),
    arrivataIl: timestamp({ withTimezone: true }).notNull(),
    analisiId: uuid(),
    creataIl: ts(),
    aggiornataIl: ts(),
  },
  (t) => [
    unique("risposta_arrivata_utente_id_uq").on(t.utenteId, t.id),
    unique("risposta_arrivata_coppia_uq").on(t.attesaId, t.emailId),
    riferimentoAttesa(t, "risposta_arrivata_attesa_fk"),
    riferimentoEmail(t, "risposta_arrivata_email_fk"),
  ],
).enableRLS();

export const requisitoSoddisfatto = pgTable(
  "requisito_soddisfatto",
  {
    rispostaId: uuid().notNull(),
    requisitoId: uuid().notNull(),
    utenteId: utente(),
  },
  (t) => [
    primaryKey({ columns: [t.rispostaId, t.requisitoId] }),
    foreignKey({
      name: "requisito_soddisfatto_risposta_fk",
      columns: [t.utenteId, t.rispostaId],
      foreignColumns: [rispostaArrivata.utenteId, rispostaArrivata.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "requisito_soddisfatto_requisito_fk",
      columns: [t.utenteId, t.requisitoId],
      foreignColumns: [attesaRequisito.utenteId, attesaRequisito.id],
    }).onDelete("cascade"),
  ],
).enableRLS();

/** Evidenza: esattamente un soggetto tipizzato (più il requisito quando riguarda una risposta). */
export const evidenza = pgTable(
  "evidenza",
  {
    id: uuid().primaryKey(),
    utenteId: utente(),
    emailId: uuid().notNull(),
    classificazioneEmailId: uuid(),
    situazioneId: uuid(),
    attivitaId: uuid(),
    attesaId: uuid(),
    rispostaId: uuid(),
    requisitoId: uuid(),
    campo: text().notNull(),
    base: text().notNull(),
    citazioneCifrata: bytea().notNull(),
    inizio: integer(),
    fine: integer(),
    verificata: boolean().notNull(),
    analisiId: uuid(),
    creataIl: ts(),
  },
  (t) => [
    riferimentoEmail(t, "evidenza_email_fk"),
    foreignKey({
      name: "evidenza_classificazione_fk",
      columns: [t.utenteId, t.classificazioneEmailId],
      foreignColumns: [classificazioneEmail.utenteId, classificazioneEmail.emailId],
    }).onDelete("cascade"),
    foreignKey({
      name: "evidenza_situazione_fk",
      columns: [t.utenteId, t.situazioneId],
      foreignColumns: [situazione.utenteId, situazione.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "evidenza_attivita_fk",
      columns: [t.utenteId, t.attivitaId],
      foreignColumns: [attivita.utenteId, attivita.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "evidenza_attesa_fk",
      columns: [t.utenteId, t.attesaId],
      foreignColumns: [attesa.utenteId, attesa.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "evidenza_risposta_fk",
      columns: [t.utenteId, t.rispostaId],
      foreignColumns: [rispostaArrivata.utenteId, rispostaArrivata.id],
    }).onDelete("cascade"),
    check(
      "evidenza_un_soggetto_ck",
      sql`num_nonnulls(${t.classificazioneEmailId}, ${t.situazioneId}, ${t.attivitaId}, ${t.attesaId}, ${t.rispostaId}) = 1`,
    ),
    index("evidenza_attivita_idx").on(t.attivitaId),
    index("evidenza_attesa_idx").on(t.attesaId),
    index("evidenza_risposta_idx").on(t.rispostaId),
    index("evidenza_classificazione_idx").on(t.classificazioneEmailId),
  ],
).enableRLS();

export const correzione = pgTable(
  "correzione",
  {
    id: uuid().primaryKey(),
    utenteId: utente(),
    soggettoTipo: text().notNull(),
    situazioneId: uuid(),
    attivitaId: uuid(),
    attesaId: uuid(),
    rispostaId: uuid(),
    emailId: uuid(),
    collegamentoId: uuid(),
    campo: text().notNull(),
    valoreCifrato: bytea().notNull(),
    valorePrecedenteCifrato: bytea(),
    creataIl: ts(),
    revocataIl: tsOpz(),
  },
  (t) => [
    foreignKey({
      name: "correzione_situazione_fk",
      columns: [t.utenteId, t.situazioneId],
      foreignColumns: [situazione.utenteId, situazione.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "correzione_attivita_fk",
      columns: [t.utenteId, t.attivitaId],
      foreignColumns: [attivita.utenteId, attivita.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "correzione_attesa_fk",
      columns: [t.utenteId, t.attesaId],
      foreignColumns: [attesa.utenteId, attesa.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "correzione_risposta_fk",
      columns: [t.utenteId, t.rispostaId],
      foreignColumns: [rispostaArrivata.utenteId, rispostaArrivata.id],
    }).onDelete("cascade"),
    riferimentoEmail(t, "correzione_email_fk"),
    foreignKey({
      name: "correzione_collegamento_fk",
      columns: [t.utenteId, t.collegamentoId],
      foreignColumns: [collegamento.utenteId, collegamento.id],
    }).onDelete("cascade"),
    check(
      "correzione_un_soggetto_ck",
      sql`num_nonnulls(${t.situazioneId}, ${t.attivitaId}, ${t.attesaId}, ${t.rispostaId}, ${t.emailId}, ${t.collegamentoId}) = 1`,
    ),
    check(
      "correzione_tipo_ck",
      sql`${t.soggettoTipo} IN ('situazione','attivita','attesa','risposta','email','collegamento')`,
    ),
    index("correzione_utente_idx").on(t.utenteId, t.creataIl),
  ],
).enableRLS();

export const eventoSituazione = pgTable(
  "evento_situazione",
  {
    id: uuid().primaryKey(),
    utenteId: utente(),
    situazioneId: uuid().notNull(),
    attore: text().notNull(),
    tipo: text().notNull(),
    riferimenti: jsonb().$type<Record<string, string>>().notNull().default({}),
    dettagliCifrati: bytea(),
    creatoIl: ts(),
  },
  (t) => [
    riferimentoSituazione(t, "evento_situazione_fk"),
    index("evento_situazione_idx").on(t.situazioneId, t.creatoIl),
  ],
).enableRLS();

export const riepilogoNews = pgTable("riepilogo_news", {
  utenteId: text()
    .primaryKey()
    .references(() => authUtente.id, { onDelete: "cascade" }),
  firmaInsieme: text().notNull(),
  vociCifrate: bytea().notNull(),
  finestraFine: timestamp({ withTimezone: true }).notNull(),
  generatoIl: ts(),
  analisiId: uuid(),
}).enableRLS();

export const richiestaRianalisi = pgTable("richiesta_rianalisi", {
  id: uuid().primaryKey(),
  utenteId: utente(),
  ambito: jsonb().$type<{ tipo: "email"; emailId: string } | { tipo: "aperti" } | { tipo: "giorni"; giorni: number }>().notNull(),
  stima: jsonb().$type<{ numeroEmail: number; costoStimato: number }>(),
  stato: text().notNull(),
  creataIl: ts(),
}).enableRLS();

// ── Bozze e invio ─────────────────────────────────────────────────────────

export const bozza = pgTable(
  "bozza",
  {
    id: uuid().primaryKey(),
    utenteId: utente(),
    situazioneId: uuid(),
    casellaId: uuid().notNull(),
    emailRispostaId: uuid(),
    attesaId: uuid(),
    tipo: text().notNull(),
    stato: text().notNull().default("modificabile"),
    versioneCorrente: integer().notNull().default(0),
    creataIl: ts(),
    aggiornataIl: ts(),
  },
  (t) => [
    unique("bozza_utente_id_uq").on(t.utenteId, t.id),
    riferimentoCasella(t, "bozza_casella_fk"),
    foreignKey({
      name: "bozza_situazione_fk",
      columns: [t.utenteId, t.situazioneId],
      foreignColumns: [situazione.utenteId, situazione.id],
    }).onDelete("cascade"),
    check("bozza_stato_ck", sql`${t.stato} IN ('modificabile','in_invio','inviata')`),
  ],
).enableRLS();

export const bozzaVersione = pgTable(
  "bozza_versione",
  {
    id: uuid().primaryKey(),
    utenteId: utente(),
    bozzaId: uuid().notNull(),
    versione: integer().notNull(),
    destinatariCifrati: bytea().notNull(),
    oggettoCifrato: bytea().notNull(),
    corpoCifrato: bytea().notNull(),
    hashBusta: text().notNull(),
    origine: text().notNull(),
    emailContesto: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    analisiId: uuid(),
    creataIl: ts(),
  },
  (t) => [
    unique("bozza_versione_uq").on(t.bozzaId, t.versione),
    foreignKey({
      name: "bozza_versione_bozza_fk",
      columns: [t.utenteId, t.bozzaId],
      foreignColumns: [bozza.utenteId, bozza.id],
    }).onDelete("cascade"),
  ],
).enableRLS();

export const invio = pgTable(
  "invio",
  {
    id: uuid().primaryKey(),
    utenteId: utente(),
    bozzaId: uuid().notNull(),
    versione: integer().notNull(),
    hashBusta: text().notNull(),
    stato: text().notNull(),
    messageId: text(),
    impronta: text(),
    inizioInvio: tsOpz(),
    idConnettore: text(),
    threadConnettore: text(),
    errore: text(),
    confermatoIl: ts(),
    inviatoIl: tsOpz(),
    aggiornatoIl: ts(),
  },
  (t) => [
    foreignKey({
      name: "invio_bozza_fk",
      columns: [t.utenteId, t.bozzaId],
      foreignColumns: [bozza.utenteId, bozza.id],
    }).onDelete("cascade"),
    uniqueIndex("invio_attivo_uq")
      .on(t.bozzaId)
      .where(sql`${t.stato} IN ('confermato','in_invio','inviato','esito_incerto')`),
    index("invio_stato_idx").on(t.stato, t.aggiornatoIl),
    check(
      "invio_stato_ck",
      sql`${t.stato} IN ('confermato','in_invio','inviato','fallito','esito_incerto','annullato')`,
    ),
  ],
).enableRLS();
