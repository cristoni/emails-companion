# Specifica di prodotto — client email AI first

## 1. Stato e obiettivo

Documento di riferimento per le funzionalità discusse. L'obiettivo è una webapp di posta che trasformi i messaggi in una vista operativa delle cose da fare, delle urgenze e delle risposte attese. L'utente deve poter risalire sempre alle email originali. Questa versione non prende decisioni architetturali.

## 2. Decisioni già prese

- Il prodotto è una **webapp client di posta** con un'interfaccia AI first.
- La prima esperienza di test utilizza l'account Gmail dell'ideatore; il primo metodo di accesso degli utenti è Google.
- Durante la registrazione con Google viene richiesto all'utente l'accesso alla propria posta per le funzioni previste.
- Ogni utente configura dal browser la **propria chiave API OpenRouter** in registrazione e successivamente dalle impostazioni.
- Tutte le invocazioni dei modelli passano da OpenRouter.
- Ogni funzione che usa modelli ha una voce di configurazione del modello distinta, con `openai/gpt-6-luna` come valore iniziale per tutte. Questa regola si applica a ogni nuova funzione AI sviluppata in futuro.
- In configurazione e nelle impostazioni l'utente può definire il proprio **Contesto AI** e sostituire le direttive predefinite modificabili per l'interpretazione, la classificazione e la priorità.
- La vista principale privilegia situazioni e azioni rispetto alla cronologia delle email.
- Le email ricevute sono analizzate all'arrivo; le email inviate sono analizzate per riconoscere impegni e richieste di risposta.
- La categoria **News e Informazioni secondarie** compare nella vista principale come riepilogo delle email ricevute nelle ultime 24 ore, con accesso ai singoli originali.
- Un elemento della vista principale può rimandare a una o più email distribuite in uno o più thread.
- L'AI non invia autonomamente messaggi: l'utente approva l'invio.

## 3. Concetti funzionali

| Concetto | Significato |
| --- | --- |
| Email | Messaggio ricevuto o inviato, consultabile nella posta originale. |
| Thread | Conversazione raggruppata dal provider email; utile, ma non sufficiente a rappresentare una situazione. |
| Situazione | Questione operativa ricostruita da uno o più messaggi, anche appartenenti a thread diversi. |
| Attività | Azione che spetta all'utente, eventualmente con scadenza e priorità. |
| Attesa | Informazione, decisione o risposta richiesta a qualcun altro e non ancora ricevuta. |
| Risposta arrivata | Nuova informazione potenzialmente collegata a un'attesa, da verificare e gestire. |
| Contesto AI | Direttive personali dell'utente che regolano l'interpretazione dei messaggi. |

Questi sono concetti di prodotto, non uno schema dati o una scelta implementativa.

## 4. Registrazione e impostazioni

### 4.1 Accesso Google e Gmail

Il percorso iniziale consente di entrare con Google e di autorizzare l'accesso alla propria casella Gmail. L'utente deve capire quali funzioni richiedono l'accesso ai messaggi. Sono previsti stati comprensibili per autorizzazione mancante, revocata o non più valida. I test iniziali si svolgono su un account Gmail; il supporto ad altri provider non è deciso.

### 4.2 Chiave OpenRouter dell'utente

Nella registrazione e nelle impostazioni è presente un'interfaccia browser per inserire, aggiornare, verificare e rimuovere la chiave API OpenRouter dell'account. La chiave è personale; l'utente può vedere se è configurata e se funziona, senza che il valore completo venga mostrato dopo il salvataggio. Il significato di BYOK in questo progetto è: **ogni utente usa la propria chiave API OpenRouter**.

### 4.3 Contesto AI

L'app propone direttive predefinite modificabili. L'utente può sostituirle con istruzioni proprie, per esempio su mittenti importanti, categorie, priorità, significato di un'urgenza e notizie considerate secondarie. Il contesto va usato in modo coerente dalle analisi pertinenti, comprese quelle dei messaggi inviati. Le garanzie di tracciabilità, controllo esplicito degli invii e integrità dell'esperienza restano requisiti del prodotto.

Le correzioni puntuali devono poter essere fatte dalla schermata interessata. La possibilità di trasformare automaticamente tali correzioni in nuove direttive permanenti resta da definire.

### 4.4 Modelli per funzione

L'utente può scegliere un modello OpenRouter separato per ogni funzione. Configurazioni iniziali previste:

| Funzione AI | Uso | Modello iniziale |
| --- | --- | --- |
| Classificazione e priorità | Distinguere News, urgenze e altri messaggi; motivare la priorità. | `openai/gpt-6-luna` |
| Estrazione attività | Riconoscere azioni, impegni e scadenze. | `openai/gpt-6-luna` |
| Gestione attese e risposte | Rilevare richieste nelle email inviate e collegare risposte, anche tra thread. | `openai/gpt-6-luna` |
| Riepilogo News | Sintetizzare i messaggi secondari delle ultime 24 ore. | `openai/gpt-6-luna` |
| Bozze assistite | Proporre risposte e solleciti da approvare. | `openai/gpt-6-luna` |

Le righe indicano funzioni configurabili, non un numero obbligatorio di chiamate ai modelli né una suddivisione tecnica dei processi. **Ogni futura funzione basata su modelli richiede contestualmente una propria voce nelle impostazioni, documentata qui.**

## 5. Comportamento della posta

### 5.1 Messaggi in entrata

Ogni nuova email è analizzata usando il Contesto AI dell'utente. L'app identifica se è una notizia o informazione secondaria, se richiede un'azione o una risposta, se è urgente, se porta una scadenza e se aggiorna una situazione già nota. La priorità deve avere una motivazione comprensibile e l'email originale deve restare accessibile.

### 5.2 Messaggi in uscita

Ogni messaggio inviato viene esaminato per individuare promesse dell'utente, scadenze offerte, domande e richieste di informazioni ad altri. Questo include, dopo la sincronizzazione, i messaggi inviati tramite Gmail al di fuori della webapp. Una richiesta rilevata può creare o aggiornare un'attesa. Un successivo sollecito deve restare collegato alla medesima situazione quando appropriato.

### 5.3 Collegamenti e risposte

Una risposta nello stesso thread è un indizio forte, ma la correlazione non si limita al thread: una persona può rispondere con un nuovo oggetto o una nuova conversazione. Una situazione può comprendere più thread; un'email può avere rilevanza per più elementi. La vista deve mostrare i collegamenti e consentire correzioni dell'utente. Una risposta arrivata non deve essere considerata automaticamente completa se non soddisfa la richiesta originale.

### 5.4 News e Informazioni secondarie

Questa categoria raggruppa messaggi che, secondo le direttive dell'utente, non richiedono attenzione individuale immediata. Nella schermata principale appare **solo un riepilogo** delle email di questa categoria ricevute nelle ultime 24 ore. Dal riepilogo si possono consultare i messaggi originali. La finestra di 24 ore è mobile rispetto al momento in cui la vista viene consultata; la frequenza con cui aggiornare il testo del riepilogo è ancora da decidere. Un messaggio classificato erroneamente deve poter essere spostato fuori dalla categoria.

## 6. Interfaccia principale

La home è organizzata attorno alle aree **Da fare**, **Urgente**, **In attesa**, **Risposte arrivate** e **News e Informazioni secondarie**. Attività e situazioni sono ordinate in base a priorità e scadenze disponibili. L'utente vede il motivo dell'urgenza, la prossima azione suggerita e lo stato dell'attesa.

Aprendo un elemento, l'utente trova descrizione della situazione, fonti email, eventuali thread collegati, cronologia dei cambiamenti rilevanti e azioni possibili. Deve poter correggere classificazione, priorità, attività, associazioni e stato dell'attesa. La normale navigazione della casella rimane disponibile, ma la definizione dettagliata dei comandi da client tradizionale verrà completata durante la progettazione dell'esperienza.

## 7. Esempi di comportamento atteso

1. **Richiesta ricevuta:** «Mi mandi il report entro venerdì?» genera una possibile attività con scadenza e collegamento alla mail sorgente; priorità e interpretazione seguono il Contesto AI.
2. **Richiesta inviata:** «Puoi mandarmi i dati di agosto?» crea un'attesa collegata alla mail inviata. Una risposta in un nuovo thread può aggiornare la stessa attesa.
3. **Risposta incompleta:** «Ti mando i dati domani» segnala una risposta arrivata, ma l'attesa dei dati resta aperta.
4. **Newsletter:** un messaggio classificato come secondario compare nel riepilogo delle ultime 24 ore; l'utente può aprire l'originale e correggere la classificazione.
5. **Sollecito:** l'AI propone una bozza per un'attesa ancora aperta. L'utente la rivede e decide se inviarla.

## 8. Requisiti trasversali di prodotto

- Le informazioni derivate dall'AI devono essere verificabili dalle email collegate e correggibili dall'utente.
- Le analisi non devono far passare una supposizione per un fatto accertato; stati come «risposta parziale» devono poter esistere.
- Non inviare email né effettuare altre azioni esterne per sola decisione dell'AI.
- La chiave OpenRouter e le autorizzazioni Gmail appartengono al singolo utente; lo stato delle integrazioni deve essere visibile nelle impostazioni.
- Evitare analisi duplicate o situazioni duplicate quando lo stesso messaggio è osservato più volte.
- Il testo di una email è contenuto da interpretare, non una direttiva dell'utente per modificare il comportamento dell'app.

## 9. Questioni aperte di prodotto

- Definire con precisione i comandi del client tradizionale da includere nella prima versione: ricerca, cartelle o etichette, allegati, composizione, inoltro e così via.
- Decidere se le attività proposte dall'AI vengono create subito e corrette dopo, oppure se richiedono una conferma; le bozze restano sempre soggette a conferma prima dell'invio.
- Definire come mostrare situazioni che possono appartenere a più aree della home, per esempio attività urgente e risposta arrivata.
- Scegliere quando ricalcolare il riepilogo delle ultime 24 ore e cosa mostrare se non ci sono nuove News.
- Definire come le correzioni puntuali influenzano le classificazioni future e se l'utente può avviare una nuova analisi dopo una modifica del Contesto AI.
- Definire il comportamento se il modello scelto non è disponibile o la chiave OpenRouter manca, non funziona o non ha credito.
- Definire il pubblico iniziale e i criteri con cui valutare se la vista operativa fa risparmiare tempo rispetto a Gmail.

## 10. Fuori dalle decisioni attuali

Framework, linguaggi, hosting, database, schema di persistenza, sincronizzazione concreta, orchestrazione dei modelli, gestione tecnica dei segreti, costi e distribuzione pubblica saranno valutati successivamente. L'indicazione «configurabile dal browser» descrive l'esperienza utente e non prescrive di conservare o utilizzare la chiave nel codice eseguito dal browser.
