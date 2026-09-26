# Output dell'AI come proposte con evidenze, applicate da un riconciliatore deterministico

I modelli non modificano mai lo stato. Ogni invocazione produce un output strutturato e validato, salvato in `analisi_ai` insieme a modello, versioni del prompt e del Contesto AI e hash dell'input. Un riconciliatore deterministico lo applica poi al dominio (Situazioni, Attività, Attese, Collegamenti, Risposte arrivate):

- in una coda seriale per utente;
- in ordine di arrivo delle email;
- con chiavi di derivazione stabili.

Ogni affermazione porta con sé le evidenze (email + citazione verificata) e la base: rilevato o dedotto. Le correzioni dell'utente sono dati a sé stanti. Il valore effettivo è l'ultima correzione attiva, altrimenti il valore dell'AI. I collegamenti rifiutati restano come vincoli negativi.

## Opzioni considerate

- **Sovrascrivere l'analisi precedente**: è semplice, ma cancella la tracciabilità e le intenzioni dell'utente.
- **Event sourcing completo**: permette di rigiocare tutto, ma costa molto in implementazione e migrazioni per un team di una persona.
- **L'AI scrive direttamente il dominio**, per esempio con chiamate a strumenti: è più flessibile, ma impossibile da verificare, esposto alla prompt injection e incompatibile con l'idempotenza.

## Conseguenze

- Un job ripetuto non richiama il modello: riusa l'output salvato con lo stesso hash dell'input.
- Una rianalisi aggiorna gli elementi esistenti invece di crearne di nuovi.
- Più email analizzate in parallelo non generano Situazioni doppie.
- Un'analisi superata non sovrascrive una correzione più recente.
- La chiusura automatica di un'Attesa valutata completa è un'Inferenza annullabile. Se l'utente riapre l'Attesa, la riapertura diventa una correzione che le analisi successive rispettano.
