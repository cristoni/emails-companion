# Cifratura applicativa dei contenuti e isolamento tra utenti nello schema

Cifriamo nell'applicazione, prima che arrivino al database, tutti i contenuti personali:
- credenziali dei connettori e chiavi OpenRouter;
- testo, oggetto e indirizzi delle email;
- anteprime e citazioni;
- output delle analisi e testi prodotti dall'AI;
- riepiloghi e bozze;
- valori testuali delle correzioni e dettagli degli eventi.

Lo schema è a busta: AES-256-GCM con una chiave dati per utente, cifrata da una chiave principale versionata. I dati associati sono `utente:tabella:colonna:id`, così un cifrato non può essere spostato tra utenti, colonne o righe.

Le ricerche per uguaglianza usano **indici ciechi**: HMAC con una chiave per utente derivata con HKDF, su indirizzi, `Message-ID`, riferimenti, dominio e hash. La somiglianza tra oggetti si calcola nel worker dopo la decifratura, su insiemi piccoli. In chiaro restano solo identificativi, stati, date, codici e metadati strutturali.

L'isolamento tra utenti è garantito dallo schema, non solo dalle query:
- ogni tabella ha `UNIQUE (utente_id, id)` e chiavi esterne composte con `utente_id`;
- i soggetti polimorfi usano colonne tipizzate con vincolo "esattamente una";
- i repository sono costruiti per un utente e non hanno metodi senza utente.

Per il pilota la chiave principale è una variabile d'ambiente condivisa da webapp e worker, diversa per ogni ambiente, e le preview non la ricevono. Prima di aprire a utenti esterni, o in vista dell'audit CASA, la chiave passerà a un KMS dietro la stessa porta `Cassaforte`, e le policy RLS verranno applicate con un ruolo di database non proprietario.

## Opzioni considerate

- **Intestazioni in chiaro**: rendono più semplici le query di correlazione, ma un dump del database esporrebbe oggetti, interlocutori e sintesi.
- **Supabase Vault**: chiunque legga `vault.decrypted_secrets` legge tutto, e le credenziali restano legate al fornitore.
- **pgsodium**: in dismissione.
- **Solo cifratura del disco del database**: non protegge da un dump o da un accesso applicativo improprio.
- **Busta asimmetrica** (la webapp cifra, solo il worker decifra): la webapp deve comunque leggere originali e testi. È stata rimandata al passaggio al KMS.

## Conseguenze

- Aggiungere la cifratura dopo avrebbe richiesto una migrazione dei dati, per questo è presente fin dall'inizio.
- Il database non è consultabile a mano per il contenuto, quindi il debug passa da strumenti applicativi.
- Una rotazione della chiave principale ricifra solo le chiavi dati.
- Nessun segreto o contenuto in chiaro entra in log, errori, payload o righe dei job, o risposte al browser; un test con valori "canarino" lo verifica.
