# Cifratura applicativa di credenziali e testo delle email

Cifriamo nell'applicazione, prima che arrivino al database, tre tipi di dati: i refresh token dei connettori, le chiavi OpenRouter e il testo normalizzato delle email. Lo schema è a busta: AES-256-GCM con una chiave dati per utente, cifrata a sua volta da una chiave principale versionata. Il cifrato è legato a `utente:scopo:id` tramite i dati associati (AAD), così non può essere spostato tra utenti o scopi.

Per il pilota la chiave principale è una variabile d'ambiente condivisa da webapp e worker, diversa per ogni ambiente, e le preview non la ricevono. Prima di aprire a utenti esterni, o in vista dell'audit CASA, passerà a un KMS dietro la stessa porta `Cassaforte`.

Oggetto, indirizzi e metadati restano in chiaro: servono alle query di correlazione e agli elenchi, e sono protetti dalla cifratura a riposo del database, da RLS senza policy e dalla Data API disattivata.

## Opzioni considerate

- **Supabase Vault**: gestisce bene i segreti, ma chiunque legga `vault.decrypted_secrets` legge tutto, e lega le credenziali al fornitore.
- **pgsodium**: in dismissione.
- **Solo cifratura del disco del database**: non protegge da un dump o da un accesso applicativo improprio.
- **Busta asimmetrica** (la webapp cifra, solo il worker decifra): più forte, ma la webapp deve leggere gli originali dal connettore e mostrare il testo. È stata rimandata al passaggio al KMS.

## Conseguenze

Aggiungere la cifratura dopo avrebbe richiesto una migrazione dei dati, per questo è presente fin dall'inizio. Una rotazione della chiave principale ricifra solo le chiavi dati. Nessun segreto in chiaro entra in log, errori, payload dei job o risposte al browser; un test con valori "canarino" lo verifica.
