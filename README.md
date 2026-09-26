# Client email AI first

Webapp per gestire la posta a partire da attività, urgenze, attese e risposte ricevute. Le email restano consultabili e costituiscono la fonte verificabile di ogni elemento mostrato.

> Stato: definizione funzionale. Nessuna architettura o stack applicativo è stato scelto. Il primo account usato per i test sarà un account Gmail personale.

## Esperienza principale

La schermata iniziale dà precedenza alle situazioni da gestire rispetto all'elenco cronologico dei messaggi:

| Area | Contenuto |
| --- | --- |
| Da fare | Attività estratte dalle conversazioni e ordinate per priorità e scadenza, quando presenti. |
| Urgente | Situazioni che richiedono attenzione rapida, con la motivazione della priorità. |
| In attesa | Richieste inviate ad altri e informazioni o risposte ancora attese. |
| Risposte arrivate | Attese per le quali è arrivata una risposta da esaminare. |
| News e Informazioni secondarie | Un riepilogo delle email classificate in questa categoria e ricevute nelle ultime 24 ore. |

Ogni elemento rimanda ai messaggi pertinenti: può collegare una o più email e uno o più thread. Le email restano navigabili, leggibili e utilizzabili come in un client di posta; la vista per situazioni è il punto di partenza dell'esperienza.

## Analisi dei messaggi

- Ogni email ricevuta viene analizzata per classificazione, priorità, eventuali attività, scadenze e collegamenti con situazioni già aperte.
- Le email in **News e Informazioni secondarie** confluiscono in un riepilogo delle ultime 24 ore. La schermata principale mostra il riepilogo, con accesso ai messaggi originali quando servono.
- Ogni email inviata viene analizzata per riconoscere impegni presi dall'utente e richieste rivolte ad altri. Questo vale anche per i messaggi spediti dall'account Gmail fuori dalla webapp, una volta sincronizzati.
- Le risposte aggiornano le attese e le attività pertinenti; un messaggio può essere collegato a una situazione anche quando si trova in un thread diverso.
- L'AI può proporre bozze di risposta o di sollecito. L'invio richiede sempre una decisione esplicita dell'utente.
- L'utente può correggere classificazioni, priorità e collegamenti e vedere perché l'app ha formulato una proposta.

## Registrazione e impostazioni

- Il primo metodo di accesso è **Google**. Durante la registrazione l'utente autorizza l'accesso alle proprie email Gmail con i permessi necessari alle funzioni attivate.
- Durante la registrazione l'utente può inserire **dal browser la propria chiave API OpenRouter**; può modificarla o rimuoverla dalle impostazioni. La chiave è individuale per ciascun utente.
- L'utente può definire un **Contesto AI** durante la configurazione e modificarlo in seguito. Il contesto sostituisce le direttive predefinite modificabili dell'app per interpretare, distinguere, classificare e prioritizzare i messaggi.
- L'utente può scegliere un **modello diverso per ogni funzione AI**. Il valore iniziale per tutte le funzioni è `openai/gpt-6-luna` su OpenRouter.
- Ogni nuova funzione applicativa che utilizza modelli AI deve avere una **corrispondente voce di configurazione del modello**, disponibile all'utente. Questa regola vale anche per le funzionalità aggiunte in futuro.

## Ambito attuale

Questi file descrivono comportamento e requisiti di prodotto. Scelte su framework, hosting, persistenza, code, provider infrastrutturali, struttura interna dei servizi e modalità di gestione delle credenziali saranno prese in una fase successiva.

La specifica dettagliata è in [project.md](project.md). Le istruzioni generali per gli agenti di sviluppo sono in [agents.md](agents.md).
