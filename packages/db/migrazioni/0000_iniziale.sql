CREATE TABLE "auth_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_account" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth_sessione" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "auth_sessione_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "auth_sessione" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth_utente" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_utente_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "auth_utente" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auth_verifica" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_verifica" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "analisi_ai" (
	"id" uuid PRIMARY KEY NOT NULL,
	"utente_id" text NOT NULL,
	"funzione" text NOT NULL,
	"modello_richiesto" text NOT NULL,
	"modello_servito" text,
	"fornitore" text,
	"versione_prompt" text NOT NULL,
	"contesto_ai_versione" integer,
	"lingua" text NOT NULL,
	"email_id" uuid,
	"hash_input_indice" text NOT NULL,
	"stato" text NOT NULL,
	"output_cifrato" "bytea",
	"errore" text,
	"token_ingresso" integer,
	"token_uscita" integer,
	"costo" double precision,
	"latenza_ms" integer,
	"id_generazione" text,
	"richiesta_rianalisi_id" uuid,
	"avviata_il" timestamp with time zone DEFAULT now() NOT NULL,
	"completata_il" timestamp with time zone,
	CONSTRAINT "analisi_ai_utente_id_uq" UNIQUE("utente_id","id")
);
--> statement-breakpoint
ALTER TABLE "analisi_ai" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "attesa" (
	"id" uuid PRIMARY KEY NOT NULL,
	"utente_id" text NOT NULL,
	"situazione_id" uuid NOT NULL,
	"email_richiesta_id" uuid NOT NULL,
	"slot" integer NOT NULL,
	"destinatari_cifrati" "bytea" NOT NULL,
	"destinatari_indici" text[] DEFAULT '{}'::text[] NOT NULL,
	"oggetto_cifrato" "bytea" NOT NULL,
	"data_attesa" timestamp with time zone,
	"data_attesa_citazione_cifrata" "bytea",
	"ciclo" text NOT NULL,
	"base" text NOT NULL,
	"analisi_id" uuid,
	"creata_il" timestamp with time zone DEFAULT now() NOT NULL,
	"aggiornata_il" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attesa_utente_id_uq" UNIQUE("utente_id","id"),
	CONSTRAINT "attesa_slot_uq" UNIQUE("email_richiesta_id","slot")
);
--> statement-breakpoint
ALTER TABLE "attesa" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "attesa_requisito" (
	"id" uuid PRIMARY KEY NOT NULL,
	"utente_id" text NOT NULL,
	"attesa_id" uuid NOT NULL,
	"descrizione_cifrata" "bytea" NOT NULL,
	"ordine" integer NOT NULL,
	CONSTRAINT "attesa_requisito_utente_id_uq" UNIQUE("utente_id","id")
);
--> statement-breakpoint
ALTER TABLE "attesa_requisito" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "attivita" (
	"id" uuid PRIMARY KEY NOT NULL,
	"utente_id" text NOT NULL,
	"situazione_id" uuid NOT NULL,
	"email_sorgente_id" uuid NOT NULL,
	"slot" integer NOT NULL,
	"descrizione_cifrata" "bytea" NOT NULL,
	"scadenza" timestamp with time zone,
	"scadenza_citazione_cifrata" "bytea",
	"priorita" text NOT NULL,
	"urgente" boolean DEFAULT false NOT NULL,
	"base" text NOT NULL,
	"stato" text NOT NULL,
	"completata_da" text,
	"email_completamento_id" uuid,
	"completata_il" timestamp with time zone,
	"analisi_id" uuid,
	"creata_il" timestamp with time zone DEFAULT now() NOT NULL,
	"aggiornata_il" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attivita_utente_id_uq" UNIQUE("utente_id","id"),
	CONSTRAINT "attivita_slot_uq" UNIQUE("email_sorgente_id","slot")
);
--> statement-breakpoint
ALTER TABLE "attivita" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bozza" (
	"id" uuid PRIMARY KEY NOT NULL,
	"utente_id" text NOT NULL,
	"situazione_id" uuid,
	"casella_id" uuid NOT NULL,
	"email_risposta_id" uuid,
	"attesa_id" uuid,
	"tipo" text NOT NULL,
	"stato" text DEFAULT 'modificabile' NOT NULL,
	"versione_corrente" integer DEFAULT 0 NOT NULL,
	"creata_il" timestamp with time zone DEFAULT now() NOT NULL,
	"aggiornata_il" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bozza_utente_id_uq" UNIQUE("utente_id","id"),
	CONSTRAINT "bozza_stato_ck" CHECK ("bozza"."stato" IN ('modificabile','in_invio','inviata'))
);
--> statement-breakpoint
ALTER TABLE "bozza" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bozza_versione" (
	"id" uuid PRIMARY KEY NOT NULL,
	"utente_id" text NOT NULL,
	"bozza_id" uuid NOT NULL,
	"versione" integer NOT NULL,
	"destinatari_cifrati" "bytea" NOT NULL,
	"oggetto_cifrato" "bytea" NOT NULL,
	"corpo_cifrato" "bytea" NOT NULL,
	"hash_busta" text NOT NULL,
	"origine" text NOT NULL,
	"email_contesto" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"analisi_id" uuid,
	"creata_il" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bozza_versione_uq" UNIQUE("bozza_id","versione")
);
--> statement-breakpoint
ALTER TABLE "bozza_versione" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "casella" (
	"id" uuid PRIMARY KEY NOT NULL,
	"utente_id" text NOT NULL,
	"connettore" text NOT NULL,
	"indirizzo_cifrato" "bytea",
	"indirizzo_globale" text,
	"account_esterno_globale" text,
	"stato" text NOT NULL,
	"scope_concessi" text[] DEFAULT '{}'::text[] NOT NULL,
	"ultimo_errore" text,
	"collegata_il" timestamp with time zone DEFAULT now() NOT NULL,
	"scollegata_il" timestamp with time zone,
	"aggiornata_il" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "casella_utente_id_uq" UNIQUE("utente_id","id"),
	CONSTRAINT "casella_stato_ck" CHECK ("casella"."stato" IN ('collegata','permessi_incompleti','da_ricollegare','scollegamento_in_corso','scollegata'))
);
--> statement-breakpoint
ALTER TABLE "casella" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "chiave_openrouter" (
	"utente_id" text PRIMARY KEY NOT NULL,
	"chiave_cifrata" "bytea" NOT NULL,
	"ultime_cifre" text NOT NULL,
	"etichetta" text,
	"stato" text NOT NULL,
	"limite_residuo" double precision,
	"verificata_il" timestamp with time zone,
	"aggiornata_il" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chiave_openrouter" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "chiave_utente" (
	"utente_id" text PRIMARY KEY NOT NULL,
	"dek_cifrata" "bytea" NOT NULL,
	"versione_kek" integer NOT NULL,
	"creata_il" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chiave_utente" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "classificazione_email" (
	"email_id" uuid PRIMARY KEY NOT NULL,
	"utente_id" text NOT NULL,
	"categoria" text NOT NULL,
	"urgente" boolean NOT NULL,
	"base_urgenza" text NOT NULL,
	"priorita" text NOT NULL,
	"motivazione_cifrata" "bytea" NOT NULL,
	"titolo_situazione_cifrato" "bytea",
	"descrizione_situazione_cifrata" "bytea",
	"analisi_id" uuid,
	"aggiornata_il" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classificazione_email_utente_uq" UNIQUE("utente_id","email_id")
);
--> statement-breakpoint
ALTER TABLE "classificazione_email" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "collegamento" (
	"id" uuid PRIMARY KEY NOT NULL,
	"utente_id" text NOT NULL,
	"email_id" uuid NOT NULL,
	"situazione_id" uuid NOT NULL,
	"origine" text NOT NULL,
	"ruolo" text NOT NULL,
	"stato" text NOT NULL,
	"confidenza" double precision,
	"analisi_id" uuid,
	"creato_il" timestamp with time zone DEFAULT now() NOT NULL,
	"aggiornato_il" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collegamento_utente_id_uq" UNIQUE("utente_id","id"),
	CONSTRAINT "collegamento_coppia_uq" UNIQUE("email_id","situazione_id")
);
--> statement-breakpoint
ALTER TABLE "collegamento" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "consenso_utente" (
	"id" uuid PRIMARY KEY NOT NULL,
	"utente_id" text NOT NULL,
	"versione_informativa" text NOT NULL,
	"accettato_il" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consenso_utente_versione_uq" UNIQUE("utente_id","versione_informativa")
);
--> statement-breakpoint
ALTER TABLE "consenso_utente" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contesto_ai" (
	"id" uuid PRIMARY KEY NOT NULL,
	"utente_id" text NOT NULL,
	"numero" integer NOT NULL,
	"testo_cifrato" "bytea" NOT NULL,
	"creato_il" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contesto_ai_numero_uq" UNIQUE("utente_id","numero")
);
--> statement-breakpoint
ALTER TABLE "contesto_ai" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "correzione" (
	"id" uuid PRIMARY KEY NOT NULL,
	"utente_id" text NOT NULL,
	"soggetto_tipo" text NOT NULL,
	"situazione_id" uuid,
	"attivita_id" uuid,
	"attesa_id" uuid,
	"risposta_id" uuid,
	"email_id" uuid,
	"collegamento_id" uuid,
	"campo" text NOT NULL,
	"valore_cifrato" "bytea" NOT NULL,
	"valore_precedente_cifrato" "bytea",
	"creata_il" timestamp with time zone DEFAULT now() NOT NULL,
	"revocata_il" timestamp with time zone,
	CONSTRAINT "correzione_un_soggetto_ck" CHECK (num_nonnulls("correzione"."situazione_id", "correzione"."attivita_id", "correzione"."attesa_id", "correzione"."risposta_id", "correzione"."email_id", "correzione"."collegamento_id") = 1),
	CONSTRAINT "correzione_tipo_ck" CHECK ("correzione"."soggetto_tipo" IN ('situazione','attivita','attesa','risposta','email','collegamento'))
);
--> statement-breakpoint
ALTER TABLE "correzione" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "credenziale_casella" (
	"casella_id" uuid PRIMARY KEY NOT NULL,
	"utente_id" text NOT NULL,
	"refresh_token_cifrato" "bytea",
	"access_token_cifrato" "bytea",
	"scadenza_accesso" timestamp with time zone,
	"generazione" integer DEFAULT 1 NOT NULL,
	"aggiornata_il" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credenziale_casella" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "email" (
	"id" uuid PRIMARY KEY NOT NULL,
	"utente_id" text NOT NULL,
	"message_id_indice" text,
	"mittente_indice" text NOT NULL,
	"hash_contenuto_indice" text NOT NULL,
	"direzione" text NOT NULL,
	"mittente_cifrato" "bytea" NOT NULL,
	"destinatari_cifrati" "bytea" NOT NULL,
	"destinatari_indici" text[] DEFAULT '{}'::text[] NOT NULL,
	"dominio_mittente_indice" text,
	"oggetto_cifrato" "bytea" NOT NULL,
	"testo_cifrato" "bytea" NOT NULL,
	"anteprima_cifrata" "bytea" NOT NULL,
	"in_reply_to_indice" text,
	"references_indici" text[] DEFAULT '{}'::text[] NOT NULL,
	"nomi_allegati_cifrati" "bytea",
	"ricevuta_il" timestamp with time zone NOT NULL,
	"lingua" text NOT NULL,
	"fonte_lingua" text NOT NULL,
	"solo_per_risposte" boolean DEFAULT false NOT NULL,
	"stato_riconciliazione" text DEFAULT 'in_attesa' NOT NULL,
	"generazione_riconciliazione" integer DEFAULT 0 NOT NULL,
	"riconciliata_il" timestamp with time zone,
	"creata_il" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_utente_id_uq" UNIQUE("utente_id","id"),
	CONSTRAINT "email_direzione_ck" CHECK ("email"."direzione" IN ('entrata','uscita','interna'))
);
--> statement-breakpoint
ALTER TABLE "email" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "email_copia" (
	"id" uuid PRIMARY KEY NOT NULL,
	"utente_id" text NOT NULL,
	"casella_id" uuid NOT NULL,
	"email_id" uuid NOT NULL,
	"id_connettore" text NOT NULL,
	"thread_connettore" text,
	"cartelle" text[] NOT NULL,
	"etichette" text[] DEFAULT '{}'::text[] NOT NULL,
	"origine_invio" text,
	"eliminata_nel_provider" boolean DEFAULT false NOT NULL,
	"acquisita_il" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_copia_connettore_uq" UNIQUE("casella_id","id_connettore")
);
--> statement-breakpoint
ALTER TABLE "email_copia" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "evento_situazione" (
	"id" uuid PRIMARY KEY NOT NULL,
	"utente_id" text NOT NULL,
	"situazione_id" uuid NOT NULL,
	"attore" text NOT NULL,
	"tipo" text NOT NULL,
	"riferimenti" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dettagli_cifrati" "bytea",
	"creato_il" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evento_situazione" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "evidenza" (
	"id" uuid PRIMARY KEY NOT NULL,
	"utente_id" text NOT NULL,
	"email_id" uuid NOT NULL,
	"classificazione_email_id" uuid,
	"situazione_id" uuid,
	"attivita_id" uuid,
	"attesa_id" uuid,
	"risposta_id" uuid,
	"requisito_id" uuid,
	"campo" text NOT NULL,
	"base" text NOT NULL,
	"citazione_cifrata" "bytea" NOT NULL,
	"inizio" integer,
	"fine" integer,
	"verificata" boolean NOT NULL,
	"analisi_id" uuid,
	"creata_il" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidenza_un_soggetto_ck" CHECK (num_nonnulls("evidenza"."classificazione_email_id", "evidenza"."situazione_id", "evidenza"."attivita_id", "evidenza"."attesa_id", "evidenza"."risposta_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "evidenza" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "impostazione_modello" (
	"utente_id" text NOT NULL,
	"funzione" text NOT NULL,
	"modello" text NOT NULL,
	"stato" text DEFAULT 'ok' NOT NULL,
	"verificata_il" timestamp with time zone,
	CONSTRAINT "impostazione_modello_utente_id_funzione_pk" PRIMARY KEY("utente_id","funzione")
);
--> statement-breakpoint
ALTER TABLE "impostazione_modello" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "indirizzo_utente" (
	"id" uuid PRIMARY KEY NOT NULL,
	"utente_id" text NOT NULL,
	"casella_id" uuid NOT NULL,
	"indirizzo_indice" text NOT NULL,
	"indirizzo_cifrato" "bytea" NOT NULL,
	"origine" text NOT NULL,
	CONSTRAINT "indirizzo_utente_uq" UNIQUE("utente_id","casella_id","indirizzo_indice")
);
--> statement-breakpoint
ALTER TABLE "indirizzo_utente" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invio" (
	"id" uuid PRIMARY KEY NOT NULL,
	"utente_id" text NOT NULL,
	"bozza_id" uuid NOT NULL,
	"versione" integer NOT NULL,
	"hash_busta" text NOT NULL,
	"stato" text NOT NULL,
	"message_id" text,
	"impronta" text,
	"inizio_invio" timestamp with time zone,
	"id_connettore" text,
	"thread_connettore" text,
	"errore" text,
	"confermato_il" timestamp with time zone DEFAULT now() NOT NULL,
	"inviato_il" timestamp with time zone,
	"aggiornato_il" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invio_stato_ck" CHECK ("invio"."stato" IN ('confermato','in_invio','inviato','fallito','esito_incerto','annullato'))
);
--> statement-breakpoint
ALTER TABLE "invio" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pausa_ai" (
	"id" uuid PRIMARY KEY NOT NULL,
	"utente_id" text NOT NULL,
	"funzione" text DEFAULT '*' NOT NULL,
	"motivo" text NOT NULL,
	"dal" timestamp with time zone DEFAULT now() NOT NULL,
	"prossima_verifica" timestamp with time zone,
	CONSTRAINT "pausa_ai_uq" UNIQUE("utente_id","funzione","motivo")
);
--> statement-breakpoint
ALTER TABLE "pausa_ai" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "preferenze_utente" (
	"utente_id" text PRIMARY KEY NOT NULL,
	"lingua" text DEFAULT 'en' NOT NULL,
	"tema" text DEFAULT 'sistema' NOT NULL,
	"fuso_orario" text DEFAULT 'UTC' NOT NULL,
	"pausa_manuale" boolean DEFAULT false NOT NULL,
	"aggiornate_il" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "preferenze_utente" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "requisito_soddisfatto" (
	"risposta_id" uuid NOT NULL,
	"requisito_id" uuid NOT NULL,
	"utente_id" text NOT NULL,
	CONSTRAINT "requisito_soddisfatto_risposta_id_requisito_id_pk" PRIMARY KEY("risposta_id","requisito_id")
);
--> statement-breakpoint
ALTER TABLE "requisito_soddisfatto" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "richiesta_rianalisi" (
	"id" uuid PRIMARY KEY NOT NULL,
	"utente_id" text NOT NULL,
	"ambito" jsonb NOT NULL,
	"stima" jsonb,
	"stato" text NOT NULL,
	"creata_il" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "richiesta_rianalisi" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "riepilogo_news" (
	"utente_id" text PRIMARY KEY NOT NULL,
	"firma_insieme" text NOT NULL,
	"voci_cifrate" "bytea" NOT NULL,
	"finestra_fine" timestamp with time zone NOT NULL,
	"generato_il" timestamp with time zone DEFAULT now() NOT NULL,
	"analisi_id" uuid
);
--> statement-breakpoint
ALTER TABLE "riepilogo_news" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "risposta_arrivata" (
	"id" uuid PRIMARY KEY NOT NULL,
	"utente_id" text NOT NULL,
	"attesa_id" uuid NOT NULL,
	"email_id" uuid NOT NULL,
	"origine" text NOT NULL,
	"stato_collegamento" text NOT NULL,
	"confidenza" double precision,
	"valutazione" text NOT NULL,
	"motivazione_cifrata" "bytea",
	"revisione" text DEFAULT 'da_vedere' NOT NULL,
	"arrivata_il" timestamp with time zone NOT NULL,
	"analisi_id" uuid,
	"creata_il" timestamp with time zone DEFAULT now() NOT NULL,
	"aggiornata_il" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "risposta_arrivata_utente_id_uq" UNIQUE("utente_id","id"),
	CONSTRAINT "risposta_arrivata_coppia_uq" UNIQUE("attesa_id","email_id")
);
--> statement-breakpoint
ALTER TABLE "risposta_arrivata" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sincronizzazione_casella" (
	"casella_id" uuid PRIMARY KEY NOT NULL,
	"utente_id" text NOT NULL,
	"cursore" text,
	"cursore_provvisorio" text,
	"fase_importazione" text DEFAULT 'da_stimare' NOT NULL,
	"riferimento_importazione" timestamp with time zone DEFAULT now() NOT NULL,
	"finestra_ricevute_da" timestamp with time zone DEFAULT now() NOT NULL,
	"finestra_inviate_da" timestamp with time zone DEFAULT now() NOT NULL,
	"stima" jsonb,
	"importazione_confermata_il" timestamp with time zone,
	"avanzamento" jsonb,
	"ultima_sync_ok" timestamp with time zone,
	"ultima_notifica" timestamp with time zone,
	"scadenza_watch" timestamp with time zone,
	"non_prima_di" timestamp with time zone,
	"errori_consecutivi" integer DEFAULT 0 NOT NULL,
	"ultimo_errore" text,
	"aggiornata_il" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sincronizzazione_casella" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "situazione" (
	"id" uuid PRIMARY KEY NOT NULL,
	"utente_id" text NOT NULL,
	"email_origine_id" uuid NOT NULL,
	"titolo_cifrato" "bytea" NOT NULL,
	"descrizione_cifrata" "bytea" NOT NULL,
	"lingua" text NOT NULL,
	"assorbita_in" uuid,
	"gestita_il" timestamp with time zone,
	"archiviata_il" timestamp with time zone,
	"ultima_attivita" timestamp with time zone DEFAULT now() NOT NULL,
	"creata_il" timestamp with time zone DEFAULT now() NOT NULL,
	"aggiornata_il" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "situazione_utente_id_uq" UNIQUE("utente_id","id"),
	CONSTRAINT "situazione_origine_uq" UNIQUE("utente_id","email_origine_id")
);
--> statement-breakpoint
ALTER TABLE "situazione" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stato_elaborazione_utente" (
	"utente_id" text PRIMARY KEY NOT NULL,
	"riconciliazione_non_prima_di" timestamp with time zone,
	"riconciliazione_errori" integer DEFAULT 0 NOT NULL,
	"riconciliazione_errore" text,
	"news_non_prima_di" timestamp with time zone,
	"news_errori" integer DEFAULT 0 NOT NULL,
	"news_errore" text,
	"aggiornato_il" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stato_elaborazione_utente" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stato_funzione_email" (
	"email_id" uuid NOT NULL,
	"funzione" text NOT NULL,
	"utente_id" text NOT NULL,
	"stato" text NOT NULL,
	"motivo" text,
	"analisi_id" uuid,
	"aggiornato_il" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stato_funzione_email_email_id_funzione_pk" PRIMARY KEY("email_id","funzione")
);
--> statement-breakpoint
ALTER TABLE "stato_funzione_email" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_auth_utente_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessione" ADD CONSTRAINT "auth_sessione_user_id_auth_utente_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analisi_ai" ADD CONSTRAINT "analisi_ai_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attesa" ADD CONSTRAINT "attesa_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attesa" ADD CONSTRAINT "attesa_situazione_fk" FOREIGN KEY ("utente_id","situazione_id") REFERENCES "public"."situazione"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attesa" ADD CONSTRAINT "attesa_email_fk" FOREIGN KEY ("utente_id","email_richiesta_id") REFERENCES "public"."email"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attesa_requisito" ADD CONSTRAINT "attesa_requisito_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attesa_requisito" ADD CONSTRAINT "attesa_requisito_attesa_fk" FOREIGN KEY ("utente_id","attesa_id") REFERENCES "public"."attesa"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attivita" ADD CONSTRAINT "attivita_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attivita" ADD CONSTRAINT "attivita_situazione_fk" FOREIGN KEY ("utente_id","situazione_id") REFERENCES "public"."situazione"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attivita" ADD CONSTRAINT "attivita_email_fk" FOREIGN KEY ("utente_id","email_sorgente_id") REFERENCES "public"."email"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bozza" ADD CONSTRAINT "bozza_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bozza" ADD CONSTRAINT "bozza_casella_fk" FOREIGN KEY ("utente_id","casella_id") REFERENCES "public"."casella"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bozza" ADD CONSTRAINT "bozza_situazione_fk" FOREIGN KEY ("utente_id","situazione_id") REFERENCES "public"."situazione"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bozza_versione" ADD CONSTRAINT "bozza_versione_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bozza_versione" ADD CONSTRAINT "bozza_versione_bozza_fk" FOREIGN KEY ("utente_id","bozza_id") REFERENCES "public"."bozza"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "casella" ADD CONSTRAINT "casella_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chiave_openrouter" ADD CONSTRAINT "chiave_openrouter_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chiave_utente" ADD CONSTRAINT "chiave_utente_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classificazione_email" ADD CONSTRAINT "classificazione_email_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classificazione_email" ADD CONSTRAINT "classificazione_email_fk" FOREIGN KEY ("utente_id","email_id") REFERENCES "public"."email"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collegamento" ADD CONSTRAINT "collegamento_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collegamento" ADD CONSTRAINT "collegamento_email_fk" FOREIGN KEY ("utente_id","email_id") REFERENCES "public"."email"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collegamento" ADD CONSTRAINT "collegamento_situazione_fk" FOREIGN KEY ("utente_id","situazione_id") REFERENCES "public"."situazione"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consenso_utente" ADD CONSTRAINT "consenso_utente_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contesto_ai" ADD CONSTRAINT "contesto_ai_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correzione" ADD CONSTRAINT "correzione_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correzione" ADD CONSTRAINT "correzione_situazione_fk" FOREIGN KEY ("utente_id","situazione_id") REFERENCES "public"."situazione"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correzione" ADD CONSTRAINT "correzione_attivita_fk" FOREIGN KEY ("utente_id","attivita_id") REFERENCES "public"."attivita"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correzione" ADD CONSTRAINT "correzione_attesa_fk" FOREIGN KEY ("utente_id","attesa_id") REFERENCES "public"."attesa"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correzione" ADD CONSTRAINT "correzione_risposta_fk" FOREIGN KEY ("utente_id","risposta_id") REFERENCES "public"."risposta_arrivata"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correzione" ADD CONSTRAINT "correzione_email_fk" FOREIGN KEY ("utente_id","email_id") REFERENCES "public"."email"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correzione" ADD CONSTRAINT "correzione_collegamento_fk" FOREIGN KEY ("utente_id","collegamento_id") REFERENCES "public"."collegamento"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credenziale_casella" ADD CONSTRAINT "credenziale_casella_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credenziale_casella" ADD CONSTRAINT "credenziale_casella_fk" FOREIGN KEY ("utente_id","casella_id") REFERENCES "public"."casella"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email" ADD CONSTRAINT "email_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_copia" ADD CONSTRAINT "email_copia_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_copia" ADD CONSTRAINT "email_copia_casella_fk" FOREIGN KEY ("utente_id","casella_id") REFERENCES "public"."casella"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_copia" ADD CONSTRAINT "email_copia_email_fk" FOREIGN KEY ("utente_id","email_id") REFERENCES "public"."email"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_situazione" ADD CONSTRAINT "evento_situazione_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_situazione" ADD CONSTRAINT "evento_situazione_fk" FOREIGN KEY ("utente_id","situazione_id") REFERENCES "public"."situazione"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidenza" ADD CONSTRAINT "evidenza_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidenza" ADD CONSTRAINT "evidenza_email_fk" FOREIGN KEY ("utente_id","email_id") REFERENCES "public"."email"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidenza" ADD CONSTRAINT "evidenza_classificazione_fk" FOREIGN KEY ("utente_id","classificazione_email_id") REFERENCES "public"."classificazione_email"("utente_id","email_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidenza" ADD CONSTRAINT "evidenza_situazione_fk" FOREIGN KEY ("utente_id","situazione_id") REFERENCES "public"."situazione"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidenza" ADD CONSTRAINT "evidenza_attivita_fk" FOREIGN KEY ("utente_id","attivita_id") REFERENCES "public"."attivita"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidenza" ADD CONSTRAINT "evidenza_attesa_fk" FOREIGN KEY ("utente_id","attesa_id") REFERENCES "public"."attesa"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidenza" ADD CONSTRAINT "evidenza_risposta_fk" FOREIGN KEY ("utente_id","risposta_id") REFERENCES "public"."risposta_arrivata"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impostazione_modello" ADD CONSTRAINT "impostazione_modello_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indirizzo_utente" ADD CONSTRAINT "indirizzo_utente_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indirizzo_utente" ADD CONSTRAINT "indirizzo_utente_casella_fk" FOREIGN KEY ("utente_id","casella_id") REFERENCES "public"."casella"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invio" ADD CONSTRAINT "invio_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invio" ADD CONSTRAINT "invio_bozza_fk" FOREIGN KEY ("utente_id","bozza_id") REFERENCES "public"."bozza"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pausa_ai" ADD CONSTRAINT "pausa_ai_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferenze_utente" ADD CONSTRAINT "preferenze_utente_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisito_soddisfatto" ADD CONSTRAINT "requisito_soddisfatto_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisito_soddisfatto" ADD CONSTRAINT "requisito_soddisfatto_risposta_fk" FOREIGN KEY ("utente_id","risposta_id") REFERENCES "public"."risposta_arrivata"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisito_soddisfatto" ADD CONSTRAINT "requisito_soddisfatto_requisito_fk" FOREIGN KEY ("utente_id","requisito_id") REFERENCES "public"."attesa_requisito"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "richiesta_rianalisi" ADD CONSTRAINT "richiesta_rianalisi_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riepilogo_news" ADD CONSTRAINT "riepilogo_news_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risposta_arrivata" ADD CONSTRAINT "risposta_arrivata_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risposta_arrivata" ADD CONSTRAINT "risposta_arrivata_attesa_fk" FOREIGN KEY ("utente_id","attesa_id") REFERENCES "public"."attesa"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risposta_arrivata" ADD CONSTRAINT "risposta_arrivata_email_fk" FOREIGN KEY ("utente_id","email_id") REFERENCES "public"."email"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sincronizzazione_casella" ADD CONSTRAINT "sincronizzazione_casella_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sincronizzazione_casella" ADD CONSTRAINT "sincronizzazione_casella_fk" FOREIGN KEY ("utente_id","casella_id") REFERENCES "public"."casella"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "situazione" ADD CONSTRAINT "situazione_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "situazione" ADD CONSTRAINT "situazione_email_origine_fk" FOREIGN KEY ("utente_id","email_origine_id") REFERENCES "public"."email"("utente_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stato_elaborazione_utente" ADD CONSTRAINT "stato_elaborazione_utente_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stato_funzione_email" ADD CONSTRAINT "stato_funzione_email_utente_id_auth_utente_id_fk" FOREIGN KEY ("utente_id") REFERENCES "public"."auth_utente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stato_funzione_email" ADD CONSTRAINT "stato_funzione_email_fk" FOREIGN KEY ("utente_id","email_id") REFERENCES "public"."email"("utente_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analisi_ai_claim_uq" ON "analisi_ai" USING btree ("utente_id","funzione","hash_input_indice") WHERE "analisi_ai"."stato" IN ('in_corso','completata');--> statement-breakpoint
CREATE INDEX "analisi_ai_email_idx" ON "analisi_ai" USING btree ("utente_id","email_id");--> statement-breakpoint
CREATE INDEX "analisi_ai_consumo_idx" ON "analisi_ai" USING btree ("utente_id","funzione","avviata_il");--> statement-breakpoint
CREATE INDEX "attesa_situazione_idx" ON "attesa" USING btree ("situazione_id");--> statement-breakpoint
CREATE INDEX "attesa_destinatari_gin" ON "attesa" USING gin ("destinatari_indici");--> statement-breakpoint
CREATE INDEX "attivita_situazione_idx" ON "attivita" USING btree ("situazione_id");--> statement-breakpoint
CREATE UNIQUE INDEX "casella_account_esclusivo_uq" ON "casella" USING btree ("connettore","account_esterno_globale") WHERE "casella"."stato" <> 'scollegata' AND "casella"."account_esterno_globale" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "casella_indirizzo_globale_idx" ON "casella" USING btree ("indirizzo_globale");--> statement-breakpoint
CREATE INDEX "collegamento_situazione_idx" ON "collegamento" USING btree ("situazione_id");--> statement-breakpoint
CREATE INDEX "correzione_utente_idx" ON "correzione" USING btree ("utente_id","creata_il");--> statement-breakpoint
CREATE UNIQUE INDEX "email_logica_uq" ON "email" USING btree ("utente_id","message_id_indice","mittente_indice","hash_contenuto_indice") WHERE "email"."message_id_indice" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "email_ricevuta_idx" ON "email" USING btree ("utente_id","ricevuta_il");--> statement-breakpoint
CREATE INDEX "email_message_id_idx" ON "email" USING btree ("utente_id","message_id_indice");--> statement-breakpoint
CREATE INDEX "email_in_reply_to_idx" ON "email" USING btree ("utente_id","in_reply_to_indice");--> statement-breakpoint
CREATE INDEX "email_riconciliazione_idx" ON "email" USING btree ("utente_id","stato_riconciliazione");--> statement-breakpoint
CREATE INDEX "email_references_gin" ON "email" USING gin ("references_indici");--> statement-breakpoint
CREATE INDEX "email_destinatari_gin" ON "email" USING gin ("destinatari_indici");--> statement-breakpoint
CREATE INDEX "email_copia_thread_idx" ON "email_copia" USING btree ("utente_id","casella_id","thread_connettore");--> statement-breakpoint
CREATE INDEX "email_copia_email_idx" ON "email_copia" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "evento_situazione_idx" ON "evento_situazione" USING btree ("situazione_id","creato_il");--> statement-breakpoint
CREATE INDEX "evidenza_attivita_idx" ON "evidenza" USING btree ("attivita_id");--> statement-breakpoint
CREATE INDEX "evidenza_attesa_idx" ON "evidenza" USING btree ("attesa_id");--> statement-breakpoint
CREATE INDEX "evidenza_risposta_idx" ON "evidenza" USING btree ("risposta_id");--> statement-breakpoint
CREATE INDEX "evidenza_classificazione_idx" ON "evidenza" USING btree ("classificazione_email_id");--> statement-breakpoint
CREATE INDEX "indirizzo_utente_indice_idx" ON "indirizzo_utente" USING btree ("utente_id","indirizzo_indice");--> statement-breakpoint
CREATE UNIQUE INDEX "invio_attivo_uq" ON "invio" USING btree ("bozza_id") WHERE "invio"."stato" IN ('confermato','in_invio','inviato','esito_incerto');--> statement-breakpoint
CREATE INDEX "invio_stato_idx" ON "invio" USING btree ("stato","aggiornato_il");--> statement-breakpoint
CREATE INDEX "situazione_attivita_idx" ON "situazione" USING btree ("utente_id","ultima_attivita");--> statement-breakpoint
CREATE INDEX "stato_funzione_email_stato_idx" ON "stato_funzione_email" USING btree ("utente_id","funzione","stato");