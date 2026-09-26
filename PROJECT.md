# Specifica di prodotto — client email AI first

## 1. Stato e obiettivo

Documento di riferimento per le funzionalità discusse. L'obiettivo è una webapp di posta che trasformi i messaggi in una vista operativa delle cose da fare, delle urgenze e delle risposte attese. L'utente deve poter risalire sempre alle email originali. Questo documento descrive il prodotto; le scelte architetturali sono in `docs/architettura.md` e nelle decisioni registrate in `docs/adr/`, il glossario del dominio è in `CONTEXT.md`.

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

### 2.1 Decisioni di prodotto del 26 settembre 2026

Prese durante la definizione dell'architettura; sostituiscono le corrispondenti questioni aperte del §9.

**Accesso, caselle e connettori**

- Google è il primo di più sistemi collegabili. L'accesso all'app avviene tramite un **provider di identità** (oggi Google); la posta viene letta e inviata tramite **connettori di posta** disaccoppiati dalle funzionalità. Il connettore viene scelto e configurato per utente al primo accesso.
- Con Google un **unico consenso** in registrazione concede identità, lettura (`gmail.readonly`) e invio (`gmail.send`) con accesso offline; la casella dell'account di accesso diventa la prima casella collegata.
- Un utente può collegare **più caselle** già nella prima versione. La home è unificata e ogni elemento indica la casella di provenienza; le risposte partono dalla casella corretta.
- Una casella esterna (per esempio un account Gmail) può essere collegata da **un solo utente** dell'app alla volta; chi prova a collegarla riceve una spiegazione.
- La stessa email presente in più caselle dell'utente **conta una sola volta**. Le **email interne**, scambiate solo tra indirizzi dell'utente (per esempio promemoria a sé stessi), possono generare Attività ma mai Attese.
- Pubblico iniziale: pilota dell'ideatore e di poche persone conosciute. Il progetto Google è "Esterno", in stato **In produzione non verificato**: gli utenti vedono l'avviso "app non verificata" e il progetto accetta al massimo 100 utenti nell'intera vita. Un lancio pubblico richiede la verifica Google degli scope "restricted" e un audit di sicurezza CASA annuale.

**Privacy e conservazione**

- Ogni chiamata ai modelli che contiene testo delle email richiede fornitori che non raccolgono dati (`data_collection: deny`) e **Zero Data Retention obbligatoria**. Se il modello scelto per una funzione non ha endpoint compatibili, l'impostazione lo segnala e chiede un altro modello.
- Il testo normalizzato, le intestazioni delle email e i testi derivati dall'AI sono conservati, cifrati, **finché la casella resta collegata**; tutto ciò che deriva da una casella viene eliminato quando l'utente la scollega o cancella l'account (i backup del database seguono la loro ritenzione, indicata nell'informativa). Gli allegati non vengono salvati; l'originale HTML viene caricato dal provider quando l'utente lo apre.
- Prima che il testo di un'email venga inviato ai modelli, l'utente accetta un'informativa che spiega trattamento, conservazione, invio tramite OpenRouter con la sua chiave e dichiarazione Limited Use di Google. Senza consenso l'analisi resta in pausa.

**Analisi e vista operativa**

- **Importazione iniziale**: al collegamento di una casella si analizzano le email ricevute negli ultimi 14 giorni e quelle inviate negli ultimi 30, a partire dalle più recenti, dopo aver mostrato numero di email e stima del costo e ottenuto la conferma dell'utente. Durante l'importazione la home mostra l'avanzamento; le Situazioni vengono ricostruite in ordine cronologico quando l'analisi della finestra è terminata. Le risposte alle richieste inviate nella finestra vengono recuperate anche se più vecchie di 14 giorni, solo per valutare le Attese.
- Le Attività, le Attese e i collegamenti proposti dall'AI **compaiono subito come proposte**: riconoscibili, con le evidenze, e con i comandi conferma, modifica e scarta. Un collegamento stabilito dall'AI resta una proposta finché l'utente non lo conferma, qualunque sia la confidenza.
- Una Situazione che rientra in più aree compare **una sola volta**, nell'area con precedenza più alta (Urgente, poi Risposte arrivate, poi Da fare, poi In attesa), con indicatori per gli altri stati.
- Una Situazione nasce da un'email che genera un'Attività, un'Attesa o un'urgenza. Titolo e descrizione sono prodotti dall'analisi di quell'email, nella sua lingua; la **prossima azione suggerita** è calcolata dagli elementi aperti. Una Situazione urgente senza azioni si toglie da Urgente con "Segna come gestita". Una Situazione senza elementi aperti è conclusa; l'utente può archiviarla o riaprirla.
- La correlazione tra thread riguarda tutte le Situazioni aperte, non solo le Attese.
- Una tua email in uscita (anche inviata da Gmail fuori dall'app) che soddisfa un'Attività la **completa automaticamente**, in modo annullabile e mostrato come inferenza. Come per la chiusura automatica delle Attese, serve un'evidenza verificata nell'email; senza, il completamento resta solo una proposta.
- La lingua rilevata di un'email è correggibile dall'utente, che può poi rianalizzarla.
- Soglie iniziali, modificabili in seguito senza cambiare il comportamento:
  - una Situazione è Urgente anche quando ha un'Attività in scadenza entro 48 ore;
  - un'Attività completata dall'AI resta segnalata sulla card per 7 giorni;
  - la correlazione tra thread considera le Situazioni con attività negli ultimi 60 giorni;
  - dopo un'interruzione della sincronizzazione il recupero copre al massimo 90 giorni, e l'utente viene avvisato se l'interruzione è più lunga.
- Se la chiave OpenRouter manca, non è valida o non ha credito, oppure se il modello scelto non è disponibile, **la sincronizzazione continua e l'analisi va in pausa**: tutta per problemi di chiave o credito, solo la funzione interessata per problemi di modello. Le email restano leggibili come "da analizzare", un avviso in home e nelle impostazioni indica il motivo, l'analisi riprende da sola quando il problema è risolto. Non si passa mai in silenzio a un altro modello.
- Una Risposta arrivata valutata **completa chiude automaticamente l'Attesa**, in modo annullabile, se per ogni elemento richiesto c'è un'evidenza verificata nella risposta. La chiusura è mostrata come inferenza, resta visibile in Risposte arrivate e l'utente può riaprire l'Attesa: la riapertura vale per quella risposta, mentre una nuova risposta completa può chiuderla di nuovo. Una risposta parziale o non pertinente lascia l'Attesa aperta.
- Le **correzioni sono locali e permanenti**: valgono per l'elemento corretto, nessuna rianalisi le sovrascrive e un collegamento rifiutato non viene riproposto. Non c'è apprendimento automatico dalle correzioni. Un Contesto AI modificato vale per le email nuove; l'utente può avviare "Rianalizza" su una singola email, sugli elementi aperti o sugli ultimi N giorni, vedendo prima la stima del costo.
- L'app non impone un tetto di spesa proprio: in registrazione consiglia di creare una chiave OpenRouter dedicata con limite di credito, mostra il consumo per funzione e offre l'interruttore "Pausa analisi AI".

**Lingue e stile**

- L'interfaccia è **multilingua fin dal progetto**, con **inglese come lingua predefinita** e italiano come seconda lingua iniziale. L'utente può cambiare lingua nelle impostazioni.
- I testi prodotti dall'AI (motivazioni, descrizioni, titoli, riepiloghi, bozze) sono **nella lingua dell'email esaminata**, indipendentemente dalla lingua dell'interfaccia. Una bozza è nella lingua dell'email a cui risponde. Una voce del riepilogo che raccoglie email in lingue diverse usa la lingua dell'interfaccia.
- Lo stile grafico, realizzato con Tailwind CSS, si ispira a Mintlify (www.mintlify.com): pulito, con molto spazio bianco, tipografia curata, un solo colore d'accento verde, temi chiaro e scuro.

**Client, riepilogo e bozze**

- I comandi da client tradizionale della prima versione sono in **sola lettura**: elenco delle email sincronizzate, lettura dell'originale in una vista sicura (script e immagini remote bloccati, comando "mostra immagini"), apertura nel provider, allegati indicati solo per nome. Risposte e solleciti passano dalle bozze confermate.
- Il **Riepilogo News** viene rigenerato quando cambiano le email incluse, attendendo 10 minuti per raggrupparle e al massimo ogni 30 minuti, oltre che con il comando "Aggiorna". Mostra l'ora dell'ultimo aggiornamento e quante email nuove non vi sono ancora incluse. Senza News compare "Nessuna News nelle ultime 24 ore", senza chiamare il modello.
- Le **bozze** vengono generate solo su richiesta ("Proponi risposta", "Proponi sollecito"). Per le Attese scadute l'app segnala un "sollecito consigliato" senza generare testo. Le bozze restano nell'app; l'invio richiede la conferma esplicita della versione esatta della bozza e un esito incerto viene mostrato all'utente, mai ritentato alla cieca.

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

Il percorso iniziale consente di entrare con Google e di autorizzare, con lo stesso consenso, la lettura e l'invio della propria casella Gmail. L'utente deve capire quali funzioni richiedono l'accesso ai messaggi. Sono previsti stati comprensibili per ogni casella: non collegata, collegata, permessi incompleti (l'utente ha deselezionato lettura o invio nel consenso), da ricollegare (autorizzazione revocata o non più valida) e scollegata. Dalle impostazioni l'utente può collegare altre caselle e scollegarle; lo scollegamento revoca l'autorizzazione ed elimina i dati di quella casella. I test iniziali si svolgono su un account Gmail; altri connettori di posta e provider di identità saranno aggiunti senza modificare le funzionalità.

### 4.2 Chiave OpenRouter dell'utente

Nella registrazione e nelle impostazioni è presente un'interfaccia browser per inserire, aggiornare, verificare e rimuovere la chiave API OpenRouter dell'account. La chiave è personale; l'utente può vedere se è configurata e se funziona, senza che il valore completo venga mostrato dopo il salvataggio. Il significato di BYOK in questo progetto è: **ogni utente usa la propria chiave API OpenRouter**. La verifica mostra lo stato della chiave (valida, non valida, credito esaurito) e l'eventuale limite residuo; l'interfaccia consiglia una chiave dedicata con limite di credito e ricorda che le impostazioni di registrazione dei prompt sull'account OpenRouter sono sotto il controllo dell'utente.

### 4.3 Contesto AI

L'app propone direttive predefinite modificabili. L'utente può sostituirle con istruzioni proprie, per esempio su mittenti importanti, categorie, priorità, significato di un'urgenza e notizie considerate secondarie. Il contesto va usato in modo coerente dalle analisi pertinenti, comprese quelle dei messaggi inviati. Le garanzie di tracciabilità, controllo esplicito degli invii e integrità dell'esperienza restano requisiti del prodotto.

Le correzioni puntuali devono poter essere fatte dalla schermata interessata. La possibilità di trasformare automaticamente tali correzioni in nuove direttive permanenti resta da definire.

### 4.4 Modelli per funzione

L'utente può scegliere un modello OpenRouter separato per ogni funzione. Configurazioni iniziali previste:

| Funzione AI | Uso | Modello iniziale |
| --- | --- | --- |
| Classificazione e priorità | Distinguere News, urgenze e altri messaggi; motivare la priorità; proporre titolo e descrizione di una nuova Situazione. | `openai/gpt-6-luna` |
| Estrazione attività | Riconoscere azioni, impegni, promemoria e scadenze; aggiornare gli elementi già estratti in caso di rianalisi. | `openai/gpt-6-luna` |
| Gestione attese e risposte | Rilevare richieste nelle email inviate; collegare email a Situazioni e Attese aperte, anche tra thread; valutare risposte e completamento delle Attività. | `openai/gpt-6-luna` |
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

Questa categoria raggruppa messaggi che, secondo le direttive dell'utente, non richiedono attenzione individuale immediata. Nella schermata principale appare **solo un riepilogo** delle email di questa categoria ricevute nelle ultime 24 ore. Dal riepilogo si possono consultare i messaggi originali. La finestra di 24 ore è mobile rispetto al momento in cui la vista viene consultata: l'elenco delle email incluse è sempre esatto, mentre il testo del riepilogo viene rigenerato secondo la regola del §2.1. Un messaggio classificato erroneamente deve poter essere spostato fuori dalla categoria.

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

Le questioni su comandi del client nella prima versione, creazione delle proposte AI, situazioni in più aree, aggiornamento del riepilogo, effetto delle correzioni, errori di chiave o modello e pubblico iniziale sono state decise (§2.1). Restano aperte:

- Quali comandi da client tradizionale aggiungere dopo la sola lettura (ricerca, etichette, archiviazione, inoltro, composizione libera, allegati); alcuni richiedono permessi Google più ampi.
- Se e come trasformare correzioni ripetute in proposte di nuove direttive del Contesto AI, sempre confermate dall'utente.
- I criteri con cui valutare se la vista operativa fa risparmiare tempo rispetto a Gmail (per esempio quota di elementi corretti, attese scoperte in ritardo, tempo dedicato allo smistamento).
- Quali connettori di posta e provider di identità aggiungere dopo Google, e in che ordine.
- Quando avviare la verifica Google e l'audit CASA necessari a un lancio pubblico.

## 10. Fuori dalle decisioni attuali

Framework, linguaggi, hosting, database, sincronizzazione, orchestrazione dei modelli e gestione tecnica dei segreti sono stati definiti il 26 settembre 2026 in `docs/architettura.md`, con le decisioni principali in `docs/adr/`. Costi di esercizio e distribuzione pubblica restano da valutare. L'indicazione «configurabile dal browser» descrive l'esperienza utente e non prescrive di conservare o utilizzare la chiave nel codice eseguito dal browser: la chiave viene inserita nel browser, conservata cifrata sul server e usata solo lato server.
