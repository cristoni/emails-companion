# Web su Vercel, Postgres su Supabase, worker sempre acceso su Railway

L'analisi deve avvenire a browser chiuso: polling di Gmail, chiamate ai modelli anche lunghe, backfill iniziale e riconciliazione delle attese. Abbiamo scelto tre componenti. La webapp Next.js gira su Vercel (regione `fra1`). Il database è Postgres su Supabase, in regione UE, usato come Postgres standard. Tutto il lavoro in background gira in un worker Node sempre acceso su Railway (regione UE), con coda persistente in Postgres (graphile-worker). La webapp non esegue mai lavoro lungo: scrive righe e accoda job nella stessa transazione.

## Opzioni considerate

- **Solo Vercel + Supabase**: un cron ogni minuto chiama un endpoint che lavora a tempo. È più economico e ha meno fornitori, ma dipende dai limiti di durata delle funzioni ed è più fragile per backfill e retry.
- **Tutto su Google Cloud** (Cloud Run, Cloud SQL, Cloud Tasks, KMS): un solo dominio di fiducia, più vicino ai requisiti CASA. Richiede più configurazione infrastrutturale e ha un costo fisso del database. Era la proposta di Codex.
- **Un solo host container**: una sola fattura, ma senza preview Vercel.

## Conseguenze

- Il dominio usa solo Postgres standard. Supabase Auth, Data API ed Edge Functions non sono usati, così il database resta portabile. Le tabelle applicative non sono esposte tramite la Data API.
- Worker e webapp condividono il codice di dominio; le dipendenze esterne (Gmail, OpenRouter, cifratura, orologio, coda) stanno dietro porte sostituibili. Spostare il worker su Cloud Run in vista della verifica Google/CASA cambia la composizione, non il dominio.
- Ci sono due target di deploy e due configurazioni di segreti. Le preview Vercel non ricevono mai la chiave di cifratura né il database di produzione.
