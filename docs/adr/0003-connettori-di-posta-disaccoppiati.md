# Connettori di posta e provider di identità disaccoppiati dalle funzionalità

Google è solo il primo dei sistemi che l'app collegherà. Per questo le funzionalità (analisi, Situazioni, Attese, bozze, riepilogo) lavorano su un modello di posta normalizzato e non conoscono Gmail. Ogni **Casella collegata** appartiene a un utente, che può averne più di una già nella prima versione. Ogni casella usa un **Connettore di posta**, scelto e configurato per utente al primo accesso. L'accesso all'app passa da un **Provider di identità** separato. Per Google identità e prima casella arrivano con un unico consenso, ma restano due concetti distinti nel codice e nei dati.

## Conseguenze

- Il dominio conosce solo concetti normalizzati: messaggio con identificativo opaco del connettore, `Message-ID`/`In-Reply-To`/`References` RFC 5322, direzione, cartelle normalizzate (in arrivo, inviata, spam, cestino, bozza), identificativo di thread opzionale e cursore di sincronizzazione opaco. Nessun tipo Gmail entra nel dominio.
- Il connettore dichiara le proprie capacità: notifiche di cambiamento, thread nativi, invio, link all'originale. Le funzionalità degradano in modo esplicito quando una capacità manca; per esempio i thread vengono ricostruiti dalle intestazioni.
- Credenziali, cursori, sincronizzazione e limiti di frequenza sono per casella, non per utente. L'unicità di un messaggio è `(casella, identificativo del connettore)`.
- Le Situazioni appartengono all'utente e possono collegare email di caselle diverse. Le risposte e i solleciti partono dalla casella da cui proviene l'email a cui si risponde.
- Aggiungere un connettore (IMAP/SMTP, Microsoft 365) significa implementare la porta e registrarlo, senza toccare dominio, analisi AI o interfaccia delle funzionalità.
