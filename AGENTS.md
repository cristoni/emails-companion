# Indicazioni per gli agenti di sviluppo

Questo progetto è un client email AI first. Leggere `readme.md` per la panoramica e `project.md` per i requisiti e le decisioni di prodotto prima di proporre o realizzare modifiche.

## Principi di lavoro

1. Mantenere la schermata principale centrata su attività, urgenze, attese e risposte arrivate. I messaggi originali devono restare raggiungibili da ogni elemento derivato.
2. Trattare ogni affermazione dell'AI come correggibile: mostrare le email da cui deriva, distinguere fatti rilevati da inferenze e permettere all'utente di correggere il risultato.
3. Considerare sia i messaggi in entrata sia quelli in uscita. Una situazione può collegare più messaggi e più thread; non ridurre l'associazione al solo thread Gmail.
4. Rispettare il Contesto AI configurato dall'utente per le direttive modificabili di interpretazione, classificazione e priorità. La personalizzazione non deve eliminare tracciabilità, controllo dell'utente o altre garanzie di funzionamento dell'app.
5. Mostrare nella vista principale soltanto il riepilogo delle ultime 24 ore della categoria **News e Informazioni secondarie**, mantenendo la possibilità di aprire le email sottostanti.
6. Richiedere una conferma esplicita prima di spedire email o compiere altre azioni esterne proposte dall'AI. La generazione di una bozza non equivale all'invio.

## Regola obbligatoria per ogni funzione AI

**Quando si aggiunge una funzione che invoca un modello, aggiungere nello stesso lavoro la corrispondente voce nelle impostazioni utente per scegliere il modello di quella funzione.** Non nascondere una nuova invocazione AI dietro la configurazione di un'altra funzione senza una decisione esplicita di prodotto.

Per ogni nuova funzione AI:

- descrivere lo scopo e i dati che interpreta;
- rendere selezionabile il modello tramite OpenRouter nella configurazione dell'utente;
- usare `openai/gpt-6-luna` come valore iniziale, salvo una successiva decisione esplicita documentata;
- documentare la nuova voce in `project.md` e aggiornare la panoramica in `readme.md` quando cambia il comportamento visibile;
- prevedere che l'utente possa capire e correggere gli effetti dell'analisi.

La chiave API OpenRouter è impostata dall'utente nel browser durante la registrazione o nelle impostazioni ed è specifica del suo account. Non mostrarla in chiaro dopo il salvataggio, non inserirla in log o documentazione e non includerla in contenuti condivisi. L'accesso Google e l'autorizzazione alla posta devono essere espliciti e comprensibili all'utente.

## Ambito delle decisioni

- I test iniziali usano Gmail, non Microsoft 365. Il primo metodo di accesso è Google.
- I requisiti descrivono il **cosa** e il comportamento atteso; non definiscono ancora architettura, framework, schema dati, provider di hosting o implementazione dei segreti.
- Non trasformare ipotesi o domande aperte in requisiti decisi. Registrare in `project.md` le decisioni di prodotto successive prima di implementarle.
- Quando una modifica tocca classificazione, attese o priorità, verificare i casi con più thread, email inviate fuori dalla webapp, correzioni dell'utente e finestre delle ultime 24 ore.

## Agent skills

### Issue tracker

Issues are tracked on GitHub Issues (cristoni/emails-companion) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
