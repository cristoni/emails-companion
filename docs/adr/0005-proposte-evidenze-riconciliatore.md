# Output dell'AI come proposte con evidenze, applicate da un riconciliatore convergente

I modelli non modificano mai lo stato. Ogni invocazione produce un output strutturato e validato, salvato in `analisi_ai` con modello, versioni del prompt e del Contesto AI, lingua e hash dell'input. Prima della chiamata una riga `in_corso` impedisce invocazioni concorrenti con lo stesso input. Un riconciliatore deterministico, in una coda seriale per utente, applica poi gli output al dominio (Situazioni, Attività, Attese, Collegamenti, Risposte arrivate).

Il risultato non dipende dall'ordine di arrivo delle email. Quando un'email tardiva crea o modifica un elemento, il riconciliatore rielabora le email successive collegate, riusando gli output salvati, e fonde le Situazioni nate da risposte arrivate prima della loro richiesta. Se una di queste Situazioni è stata toccata dall'utente, la fusione diventa una proposta.

Ogni affermazione porta con sé le evidenze (email + citazione verificata con intervallo) e la base: rilevato o dedotto.
- Gli effetti rilevanti, cioè la chiusura automatica di un'Attesa e il completamento automatico di un'Attività, richiedono evidenze verificate; senza, restano proposte.
- I collegamenti stabiliti dall'AI restano proposte finché l'utente non li conferma.
- Le correzioni dell'utente sono dati a sé stanti: il valore effettivo è l'ultima correzione attiva, altrimenti il valore dell'AI.
- Gli elementi toccati dall'utente non vengono mai sostituiti né riscritti dall'AI.
- I collegamenti rifiutati e gli elementi scartati restano come vincoli negativi.

## Opzioni considerate

- **Sovrascrivere l'analisi precedente**: è semplice, ma cancella la tracciabilità e le intenzioni dell'utente.
- **Event sourcing completo**: permette di rigiocare tutto, ma costa molto in implementazione e migrazioni per un team di una persona.
- **L'AI scrive direttamente il dominio**, per esempio con chiamate a strumenti: è più flessibile, ma impossibile da verificare, esposto alla prompt injection e incompatibile con l'idempotenza.
- **Garantire l'ordine cronologico di elaborazione**: con importazione dalle più recenti, più caselle e pause non è ottenibile; la convergenza lo rende superfluo.

## Conseguenze

- Un job ripetuto non richiama il modello: riusa l'output salvato con lo stesso hash dell'input. "Rianalizza" è una nuova invocazione intenzionale.
- Una rianalisi aggiorna gli elementi esistenti invece di crearne di nuovi: gli elementi le vengono passati con alias e il modello risponde aggiorna / non trovato / nuovo.
- **Stato delle Attese.** È derivato dai requisiti e dalle valutazioni delle Risposte arrivate. Riaprire un'Attesa chiusa dall'AI significa correggere la valutazione della risposta che l'aveva chiusa: la rianalisi di quella risposta non la richiude, mentre una nuova risposta completa può chiuderla.
