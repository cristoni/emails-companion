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

## Verifiche possibili solo dal vivo

I test automatici usano connettore e modelli simulati. Vanno verificati su un account reale:
- flusso OAuth di Google e hook di cattura del consenso;
- assenza della scadenza settimanale dei token in stato "In produzione non verificato";
- instradamento ZDR verso Azure per `openai/gpt-6-luna`;
- consegna delle notifiche Pub/Sub;
- conservazione del `Message-ID` dopo l'invio.
