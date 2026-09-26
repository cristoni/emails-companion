# Connettori di posta e provider di identità disaccoppiati dalle funzionalità

Google è solo il primo dei sistemi che l'app collegherà. Per questo le funzionalità (analisi, Situazioni, Attese, bozze, riepilogo) lavorano su un modello di posta normalizzato e non conoscono Gmail. Ogni **Casella collegata** appartiene a un utente, che può averne più di una già nella prima versione. Ogni casella usa un **Connettore di posta**, scelto e configurato per utente al primo accesso. L'accesso all'app passa da un **Provider di identità** separato. Per Google identità e prima casella arrivano con un unico consenso, ma restano due concetti distinti nel codice e nei dati.

## Conseguenze

- Il dominio conosce solo concetti normalizzati: identificativo opaco del connettore, `Message-ID`/`In-Reply-To`/`References` RFC 5322, direzione (`entrata`, `uscita`, `interna`), cartelle normalizzate (in arrivo, inviata, spam, cestino, bozza, archiviata), identificativo di thread opzionale e cursore di sincronizzazione opaco. Nessun tipo Gmail entra nel dominio.
- Il connettore dichiara le proprie capacità: notifiche di cambiamento, thread nativi, invio, link all'originale, alias di invio. Le funzionalità degradano in modo esplicito quando una capacità manca; per esempio i thread vengono ricostruiti dalle intestazioni.
- Credenziali, cursori, sincronizzazione e limiti di frequenza sono per casella, non per utente.
- **Email logica e copie.** Una **Copia** è unica per `(casella, identificativo del connettore)`. L'**Email** è unica per utente: le copie dello stesso messaggio in più caselle (stesso `Message-ID`, mittente e contenuto) sono un'unica Email, analizzata una volta sola.
- **Casella esclusiva.** Un account esterno può essere collegato da un solo utente dell'app alla volta, con un vincolo unico. Così watch, revoca e scollegamento non interferiscono tra utenti.
- **Riferimenti tra caselle.** Le Situazioni appartengono all'utente e possono collegare email di caselle diverse. Le risposte e i solleciti partono dalla casella da cui proviene l'email a cui si risponde. Gli identificativi nativi (thread, id) valgono solo dentro la propria casella, mentre i riferimenti RFC valgono dentro l'utente.
- Aggiungere un connettore (IMAP/SMTP, Microsoft 365) significa implementare la porta e registrarlo, senza toccare dominio, analisi AI o interfaccia delle funzionalità.
