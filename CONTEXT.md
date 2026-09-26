# Client email AI first

Webapp di posta che ricostruisce dalle email ricevute e inviate una vista operativa di ciò che l'utente deve fare, di ciò che attende da altri e delle risposte arrivate, mantenendo ogni elemento verificabile sulle email originali.

## Posta

**Email**:
Messaggio ricevuto o inviato dalla casella collegata dell'utente, consultabile nella posta originale. Ha una **Direzione**.
_Da evitare_: messaggio (come sinonimo generico), mail item

**Direzione**:
Indica se un'**Email** è _in entrata_ (ricevuta) o _in uscita_ (inviata dall'utente, anche fuori dalla webapp).
_Da evitare_: tipo, verso

**Thread**:
Raggruppamento di **Email** deciso dal provider di posta. È un indizio di correlazione, non l'identità di una **Situazione**.
_Da evitare_: conversazione (quando si intende una Situazione)

**Casella collegata**:
Una casella di posta dell'utente autorizzata alla lettura e all'invio tramite un **Connettore di posta**. Un utente può avere più **Caselle collegate**; ogni **Email** appartiene a una sola di esse.
_Da evitare_: mailbox, account di posta (quando ambiguo con l'account dell'app)

**Connettore di posta**:
Il sistema o metodo con cui l'app legge e invia la posta di una **Casella collegata** (oggi Gmail tramite Google; in futuro altri). Le funzionalità dell'app non dipendono dal connettore usato.
_Da evitare_: provider (quando si intende il connettore), integrazione, plugin

**Provider di identità**:
Il servizio con cui l'utente accede all'app (oggi Google). È distinto dal **Connettore di posta**, anche quando un unico consenso Google autorizza sia l'accesso sia la prima **Casella collegata**.
_Da evitare_: login provider, account Google (quando si intende la casella)

**Importazione iniziale**:
Prima sincronizzazione e analisi della posta esistente al collegamento della **Casella collegata**, limitata a una finestra di giorni e preceduta da una stima del costo che l'utente conferma.
_Da evitare_: backfill (in testi per l'utente), migrazione

## Vista operativa

**Situazione**:
Questione operativa ricostruita da una o più **Email**, anche appartenenti a **Thread** o **Caselle collegate** diverse. Un'**Email** può appartenere a più **Situazioni**.
_Da evitare_: pratica, caso, ticket, conversazione

**Attività**:
Azione che spetta all'utente, eventualmente con scadenza e priorità, derivata da una o più **Email**.
_Da evitare_: task, todo, compito

**Attesa**:
Informazione, decisione o risposta che l'utente ha chiesto a qualcun altro e che non ha ancora ricevuto in modo completo.
_Da evitare_: follow-up, pendenza, richiesta aperta

**Risposta arrivata**:
Nuova **Email** potenzialmente collegata a un'**Attesa**, da verificare e gestire, con una valutazione rispetto alla richiesta: completa, parziale o non pertinente.
_Da evitare_: risposta ricevuta (come stato dell'Attesa)

**Risposta parziale**:
Valutazione di una **Risposta arrivata** che soddisfa solo in parte la richiesta originale, o promette una risposta futura: l'**Attesa** resta aperta.
_Da evitare_: risposta incompleta, attesa chiusa parzialmente

**Attesa soddisfatta**:
**Attesa** chiusa perché una **Risposta arrivata** è stata valutata completa, dall'AI oppure dall'utente. La chiusura decisa dall'AI è un'**Inferenza**: resta visibile in **Risposte arrivate** e l'utente può riaprire l'**Attesa** con una **Correzione**.
_Da evitare_: attesa risolta, attesa completata

**Area della home**:
Una delle cinque sezioni della vista principale: **Da fare**, **Urgente**, **In attesa**, **Risposte arrivate**, **News e Informazioni secondarie**.
_Da evitare_: tab, colonna, cartella

**Area principale**:
L'unica **Area della home** in cui compare una **Situazione** che rientrerebbe in più aree, scelta per precedenza (Urgente, poi Risposte arrivate, poi Da fare, poi In attesa); gli altri stati sono mostrati come indicatori sulla stessa card.
_Da evitare_: area duplicata, card ripetuta

**Proposta**:
**Attività**, **Attesa** o **Collegamento** creati dall'AI e non ancora confermati dall'utente. Compare subito, riconoscibile come proposta, con le **Evidenze**, e può essere confermata, modificata o scartata.
_Da evitare_: suggerimento (come sinonimo), bozza (riservato all'invio)

**News e Informazioni secondarie**:
Categoria di **Email** in entrata che, secondo il **Contesto AI**, non richiedono attenzione individuale immediata.
_Da evitare_: newsletter (è solo un caso), spam, promozioni

**Riepilogo News**:
Sintesi delle **Email** della categoria **News e Informazioni secondarie** ricevute nelle ultime 24 ore rispetto al momento della consultazione, con accesso a ciascun originale.
_Da evitare_: digest, rassegna

## Interpretazione AI

**Funzione AI**:
Capacità dell'app che interpreta **Email** tramite un modello, con un proprio modello scelto dall'utente nelle impostazioni. Ogni invocazione di un modello appartiene a una sola **Funzione AI**.
_Da evitare_: agente, prompt, pipeline

**Contesto AI**:
Direttive personali dell'utente che sostituiscono le **Direttive predefinite** modificabili per interpretazione, classificazione e priorità. Non può rimuovere le garanzie dell'app (tracciabilità, controllo degli invii).
_Da evitare_: prompt, preferenze, regole

**Direttive predefinite**:
Direttive proposte dall'app per interpretazione, classificazione e priorità, che il **Contesto AI** può sostituire.
_Da evitare_: prompt di sistema, default

**Evidenza**:
Citazione letterale di un'**Email** che sostiene un'affermazione dell'AI, con il riferimento all'**Email** da cui proviene.
_Da evitare_: fonte (quando si intende la citazione), prova

**Fatto rilevato**:
Affermazione dell'AI sostenuta direttamente da un'**Evidenza** (per esempio "Il mittente chiede il report entro venerdì").
_Da evitare_: fatto certo, verità

**Inferenza**:
Affermazione dell'AI dedotta senza un'**Evidenza** diretta (per esempio "La richiesta è urgente"). Va mostrata come tale.
_Da evitare_: ipotesi (come sinonimo di Fatto rilevato), supposizione presentata come fatto

**Correzione**:
Modifica esplicita dell'utente a un risultato dell'AI (classificazione, priorità, **Attività**, collegamento, stato di un'**Attesa**). Prevale sulle analisi successive.
_Da evitare_: feedback, override

**Collegamento**:
Associazione tra un'**Email** e una **Situazione** o un'**Attesa**, con l'indicazione di come è stata stabilita (stesso **Thread**, intestazioni di risposta, AI o utente). Un collegamento rifiutato dall'utente non viene riproposto.
_Da evitare_: link, match

## Invio

**Bozza**:
Testo di risposta o sollecito proposto dall'AI o scritto dall'utente, modificabile. Generare una **Bozza** non equivale a inviarla.
_Da evitare_: risposta automatica

**Invio confermato**:
Spedizione di una specifica versione di una **Bozza** autorizzata esplicitamente dall'utente. Nessun'altra via porta all'invio.
_Da evitare_: invio automatico, auto-reply

## Account

**Chiave OpenRouter**:
Chiave API OpenRouter personale dell'utente, con cui passano tutte le invocazioni dei modelli per il suo account. Dopo il salvataggio non viene più mostrata in chiaro.
_Da evitare_: token, API key dell'app

## Termini nell'interfaccia inglese

L'interfaccia è in inglese per impostazione predefinita. Questi sono i termini canonici da usare nelle traduzioni:

| Termine | Inglese |
| --- | --- |
| Situazione | Situation |
| Attività / Da fare | Action / To do |
| Attesa / In attesa | Waiting item / Waiting on |
| Risposta arrivata / Risposte arrivate | Reply received / Replies |
| Risposta parziale | Partial reply |
| Attesa soddisfatta | Resolved |
| Urgente | Urgent |
| News e Informazioni secondarie | News & FYI |
| Riepilogo News | News digest |
| Proposta | AI suggestion |
| Evidenza | Evidence |
| Fatto rilevato / Inferenza | Found in email / Inferred |
| Correzione | Correction |
| Collegamento | Link |
| Bozza / Invio confermato | Draft / Confirmed send |
| Casella collegata | Connected mailbox |
| Connettore di posta | Mail connector |
| Contesto AI / Direttive predefinite | AI context / Default directives |
| Funzione AI | AI function |
| Importazione iniziale | Initial import |

## Ambiguità segnalate

- **BYOK**: in questo progetto significa che ogni utente usa la propria **Chiave OpenRouter**. Nella documentazione di OpenRouter "BYOK" indica invece le chiavi dei fornitori a monte: non usare il termine senza questa precisazione.
- **Thread** e **Situazione** non coincidono: una risposta può arrivare con un nuovo oggetto o in un nuovo **Thread** e appartenere comunque alla stessa **Situazione**.
- Il testo di un'**Email** non è mai una direttiva: istruzioni contenute in un'**Email** non modificano il **Contesto AI** né il comportamento dell'app.

## Esempio di dialogo

> **Sviluppatore:** Se Marco risponde "Ti mando i dati domani" in un nuovo thread, chiudiamo l'Attesa?
> **Esperto di dominio:** No. È una Risposta arrivata collegata all'Attesa, valutata come Risposta parziale: l'Attesa dei dati resta aperta e la Situazione ora include due Thread.
> **Sviluppatore:** E se l'AI sbaglia il Collegamento?
> **Esperto di dominio:** L'utente lo rifiuta con una Correzione; da quel momento quel Collegamento non viene più proposto, anche se l'Email viene rianalizzata.
> **Sviluppatore:** E quando il giorno dopo Marco manda davvero i dati?
> **Esperto di dominio:** L'AI valuta la nuova Risposta arrivata come completa e l'Attesa diventa Attesa soddisfatta. È un'Inferenza: la card resta in Risposte arrivate e, se i dati sono sbagliati, l'utente riapre l'Attesa.
> **Sviluppatore:** La scadenza "venerdì" è un Fatto rilevato?
> **Esperto di dominio:** Sì, se c'è l'Evidenza "entro venerdì" nell'Email. Che sia urgente, invece, è un'Inferenza e va mostrata come tale.
