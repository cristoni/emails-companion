# Rilascio e configurazione

Questa guida elenca i passi di configurazione, **da fare solo al proprietario del progetto** perché richiedono i suoi account. Nessun valore segreto va nel repository: le variabili sono elencate in `.env.example`.

## 1. Google Cloud (due progetti: sviluppo e produzione)

Per ciascun progetto:

1. **Schermata di consenso OAuth**:
   - tipo **Esterno**, stato **In produzione** (non verificato per il pilota);
   - scope: `openid`, `email`, `profile`, `gmail.readonly`, `gmail.send`;
   - dominio e link all'informativa `/privacy`.

   Il progetto ammette al massimo 100 utenti in tutta la sua vita: le prove vanno fatte sul progetto di sviluppo. In stato "Testing" i refresh token scadono dopo 7 giorni.
2. **API**: abilitare Gmail API. Per le notifiche push abilitare anche Pub/Sub.
3. **Credenziali OAuth** (applicazione web). URI di reindirizzamento:
   - `https://<dominio>/api/auth/callback/google`, per l'accesso con Better Auth;
   - `https://<dominio>/api/caselle/google/callback`, per il flusso proprio (Collega, Ricollega, Autorizza).

   Google non accetta caratteri jolly, quindi le preview Vercel non possono accedere con Google.
4. **Notifiche** (facoltative):
   ```sh
   gcloud pubsub topics create gmail-watch
   gcloud pubsub topics add-iam-policy-binding gmail-watch \
     --member=serviceAccount:gmail-api-push@system.gserviceaccount.com --role=roles/pubsub.publisher
   gcloud pubsub subscriptions create gmail-watch-worker --topic=gmail-watch --ack-deadline=60 --expiration-period=never
   ```
   Creare un service account per il worker con `roles/pubsub.subscriber` sulla sottoscrizione e salvarne il JSON in `GCP_SERVICE_ACCOUNT_JSON`. Il topic deve stare nello stesso progetto del client OAuth.

## 2. Supabase (regione UE)

1. Creare il progetto in `eu-central-1`, su un piano che non vada in pausa quando l'app è in uso quotidiano.
2. **Disattivare la Data API**, oppure rimuovere `public` dagli schemi esposti. Le tabelle hanno RLS attiva senza policy come difesa in profondità.
3. Scaricare il certificato CA del database (Database Settings → SSL) e salvarlo in `EC_DATABASE_CA`.
4. **Connessioni**:
   - webapp: *transaction pooler* (porta 6543);
   - worker: *session pooler* (porta 5432), oppure connessione diretta con IPv6 attivo su Railway;
   - migrazioni: connessione diretta o session pooler.
   - ogni processo apre al massimo 2 connessioni in più per le chiavi dati, oltre al proprio pool: tenerne conto nel limite di connessioni del piano Supabase.
5. **Backup**: annotare la ritenzione dei backup gestiti e riportarla nell'informativa: i dati cancellati possono restare nei backup fino alla loro scadenza.

## 3. Chiavi di cifratura

Generare tre chiavi da 32 byte in base64:
- `EC_CHIAVE_PRINCIPALE_V1`;
- `EC_CHIAVE_INDICI_GLOBALI`, distinta dalla precedente;
- `BETTER_AUTH_SECRET`.

Stesse chiavi per webapp e worker dello stesso ambiente, diverse tra ambienti.

**Rotazione**:
1. aggiungere `EC_CHIAVE_PRINCIPALE_V2`;
2. impostare `EC_CHIAVE_PRINCIPALE_ATTIVA=2`;
3. rilasciare webapp e worker.

Le chiavi dati esistenti restano cifrate con la V1 finché non vengono ricifrate con `CassaforteBusta.ruotaChiaveUtente`. Uno script di rotazione per tutti gli utenti non esiste ancora: va scritto prima della prima rotazione. La V1 va rimossa solo dopo la ricifratura di tutte le chiavi. Prima dell'apertura a utenti esterni la chiave principale passa a un KMS (ADR 0004).

## 4. Railway (worker)

- **Servizio** dal repository, con Node 24 fissato.
- **Comandi**:
  - pre-deploy: `pnpm --filter @ec/db db:migrate`, con `EC_DATABASE_URL_MIGRAZIONI` impostata;
  - avvio: `pnpm --filter worker start`.
- **Arresto**: `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` deve superare il job più lungo (l'invio ha un timeout rigido di 30 secondi), per esempio 120.
- **Variabili**: quelle di `.env.example`, tranne `BETTER_AUTH_*` che servono solo alla webapp.

Il worker non si avvia se lo schema non è migrato (codice di uscita 57).

## 5. Vercel (webapp)

- **Progetto**:
  - Root Directory `apps/web`;
  - regione `fra1` (Settings → Functions);
  - Node 24.
- **Variabili di Production**: quelle di `.env.example` (webapp).
- **Preview**:
  - non ricevono la chiave principale, il segreto OAuth né il database di produzione;
  - restano protette da Vercel Authentication;
  - mostrano solo l'interfaccia su un database sintetico.
- **Aggiornamento di sicurezza**: passare a `next@16.3.7` dopo il 30/09/2026.

## 6. OpenRouter (ogni utente)

Ogni utente crea la propria chiave, meglio se **dedicata e con limite di credito**, e la inserisce in `/onboarding` o `/settings`. L'app invia sempre `zdr: true` e `data_collection: "deny"`. Le impostazioni di registrazione dei prompt sull'account OpenRouter restano sotto il controllo dell'utente.

## 7. Sviluppo locale

```sh
pnpm install
pnpm test                         # Postgres incorporato, nessun servizio esterno
cp .env.example apps/web/.env.local
pnpm --filter @ec/db db:migrate   # verso un Postgres locale o di sviluppo
pnpm --filter worker dev
pnpm --filter web dev
```

La modalità `APP_MODE=fake` usa il connettore e i modelli simulati di `@ec/testing` con dati sintetici. Webapp e worker la rifiutano se rilevano un ambiente di produzione o segreti reali.

## 8. Ambiente demo in modalità finta

Un solo comando avvia l'app completa su dati sintetici, senza Google, OpenRouter né Railway:

```sh
pnpm install
pnpm demo              # http://localhost:3100, Ctrl+C per fermare tutto
```

Il codice è nel pacchetto privato `packages/demo` (`@ec/demo`). Tutto lo stato vive in `.demo/` alla radice, esclusa da git.

**Cosa fa `pnpm demo`:**
1. **Postgres incorporato** persistente in `.demo/postgres` (embedded-postgres, UTF8 e locale C come nei test), migrato con le migrazioni del repository: Drizzle, poi graphile-worker.
2. **Variabili** in `.demo/.env.local`:
   - chiavi casuali generate al primo avvio e poi riusate: chiave principale, chiave degli indici globali, `BETTER_AUTH_SECRET`, password del database;
   - `APP_MODE=fake`, URL del database e `BETTER_AUTH_URL`/`EC_URL_APP` su `http://localhost:3100`.

   I valori non vengono mai stampati. Il file non è `apps/web/.env.local`, che Next caricherebbe anche in un normale `next dev`: la demo passa le variabili a web e worker direttamente, e svuota quelle che non devono arrivare (segreto OAuth di Google, Pub/Sub, CA del database, altre versioni della chiave principale).
3. **Utente demo** `demo@esempio.example`, portato fino alla home piena con gli stessi casi d'uso dell'app:
   - informativa accettata;
   - chiave OpenRouter finta (nell'interfaccia se ne vedono solo le ultime cifre);
   - casella sintetica collegata con `registraConsensoGoogle`;
   - stima e conferma dell'Importazione iniziale;
   - analisi, riconciliazione e Riepilogo News ("Aggiorna").

   La pipeline gira **nello stesso processo**, con i gestori del worker e `runOnce` di graphile-worker. I job sono quelli veri, accodati nel database: quelli programmati nel futuro restano al worker. Il comando sa quando la pipeline è finita e controlla che la home abbia almeno una Situazione. Il risultato: una Situazione in ciascuna area (Urgente, Risposte arrivate, Da fare, In attesa) e due News con il riepilogo. Ogni passo controlla lo stato, quindi un avvio interrotto riprende da dove era arrivato.
4. **Sessione di Better Auth** per l'utente demo, salvata come storageState di Playwright in `.demo/sessione-playwright.json`. La crea un'istanza di Better Auth riservata alla demo, con il plugin di test. La webapp non ha alcuna route di accesso di prova e non carica mai quel plugin. A ogni avvio la sessione è nuova e le precedenti vengono eliminate.
5. **Worker e `next dev`** avviati in modalità finta contro quel database, con l'output prefissato `[worker]` e `[web]`. Se uno dei due termina, la demo ferma tutto.

**Sicurezza:**
- Prima di avviare qualunque cosa, la demo legge la configurazione con `leggiConfigurazione`, sullo stesso ambiente che passerà a web e worker. La stessa guardia è la prima istruzione della creazione dell'istanza con il plugin di test (test in `packages/demo/test`).
- Controlli che bloccano la demo, anche quando il valore arriva dalla shell:
  - un marcatore di produzione (`VERCEL_ENV=production`, `RAILWAY_ENVIRONMENT_NAME=production`, `EC_AMBIENTE=produzione`), rifiutato da `leggiConfigurazione`;
  - `NODE_ENV=production`, rifiutato dalla demo.
- La demo imposta sempre `APP_MODE=fake`. L'istanza con il plugin di test rifiuta comunque ogni altra modalità, anche se viene creata fuori da `pnpm demo`.
- Segreti reali presenti nella shell o in `apps/web/.env*`: non bloccano la demo, perché vengono svuotati prima di arrivare a web e worker.
  - Il segreto OAuth di Google, Pub/Sub e la CA del database sono svuotati sempre.
  - Le versioni della chiave principale diverse dalla V1 della demo sono svuotate tutte se arrivano dalla shell. Se arrivano dai file `.env` letti da Next, sono svuotate solo da V2 a V9: una V10 o successiva in `apps/web/.env.local` arriverebbe al web, senza essere usata per cifrare.
  - `EC_CHIAVE_PRINCIPALE_ATTIVA` è forzata a 1.
  - Il rifiuto di `leggiConfigurazione` per questi casi resta quindi valido per web e worker avviati a mano, non per la demo.
- La sessione di prova non vale fuori dalla demo: il database è sempre il Postgres incorporato su `127.0.0.1` con password casuale, e `BETTER_AUTH_SECRET` è generato localmente.
- Utente, posta e chiave sono sintetici (domini `esempio.example`, `*.example`).

**Opzioni:**
- `EC_DEMO_PORTA=3200 pnpm demo` (PowerShell: `$env:EC_DEMO_PORTA=3200; pnpm demo`): porta web diversa, solo per quell'avvio. Per `pnpm test:e2e` serve la stessa variabile. La porta di Postgres è scelta libera e salvata.
- `pnpm demo --prepara`: prepara database, utente e sessione, poi si ferma senza avviare web e worker.
- `pnpm demo:reset`: cancella `.demo/` e riparte da zero. Serve anche quando le News risultano vuote: la posta sintetica è datata al primo avvio e dopo 24 ore esce dalla finestra del riepilogo. Serve anche se il database demo è danneggiato.
- `pnpm demo:browser`: con la demo avviata, apre Chromium di Playwright già autenticato come utente demo. Senza Google non c'è altro modo di accedere. Per una porta diversa: `pnpm --filter web exec playwright open --load-storage=../../.demo/sessione-playwright.json http://localhost:<porta>`.

Su Windows embedded-postgres ferma il database con `taskkill /f`, quindi all'avvio successivo Postgres esegue un breve recupero: è normale.

### Test E2E (Playwright)

```sh
pnpm --filter web exec playwright install chromium   # una volta, scarica il browser
pnpm test:e2e
```

In CI il browser va installato con le dipendenze di sistema (`pnpm --filter web exec playwright install --with-deps chromium`). Con `CI` impostata, Playwright avvia sempre una demo propria, senza riusarne una già accesa.

La configurazione è in `apps/web/playwright.config.ts` e i test in `apps/web/e2e/`.
- Il `webServer` di Playwright è `pnpm demo`, che scrive la sessione prima di avviare `next dev`. Fuori dalla CI riusa una demo già avviata sulla stessa porta.
- I test autenticati caricano la sessione con `test.use({ storageState })`; gli altri partono senza cookie.
- Oggi i test verificano:
  - `/sign-in` e `/privacy` in inglese per impostazione predefinita, anche con `Accept-Language` italiano;
  - l'italiano con il cookie `ec_lingua`;
  - il reindirizzamento all'accesso senza sessione;
  - la validità della sessione della demo;
  - che nessuna risposta di `/onboarding` (documento, payload RSC, risorse) contenga la chiave OpenRouter o parti della sua sezione casuale.

## Verifiche possibili solo dal vivo

I test automatici usano connettore e modelli simulati. Vanno verificati su un account reale:
- flusso OAuth di Google e hook di cattura del consenso;
- assenza della scadenza settimanale dei token in stato "In produzione non verificato";
- instradamento ZDR verso Azure per `openai/gpt-6-luna`;
- consegna delle notifiche Pub/Sub;
- conservazione del `Message-ID` dopo l'invio.
