# Accesso alla casella tramite API Gmail, non IMAP/SMTP

Per leggere e inviare posta usiamo l'API REST di Gmail con OAuth. Il progetto Google Cloud è di tipo "Esterno", in stato **In produzione ma non verificato**, e usa un unico consenso in registrazione: identità (`openid`, `email`, `profile`), lettura (`gmail.readonly`) e invio (`gmail.send`), con accesso offline. L'account Google con cui l'utente entra è la casella collegata.

## Opzioni considerate

- **IMAP/SMTP con password per le app**: evita la verifica Google, l'audit CASA, la scadenza settimanale dei token e il tetto di 100 utenti. È stata scartata per quattro motivi: dà accesso totale alla casella (lettura, cancellazione, invio) senza poterlo limitare; Google la sconsiglia e la revoca a ogni cambio password; non è disponibile con Protezione avanzata; la sincronizzazione è più complessa (manca QRESYNC, IDLE vale per una sola cartella, c'è il limite di dimensione cartella).
- **IMAP via OAuth (XOAUTH2)**: richiede lo scope `https://mail.google.com/`, il più ampio e anch'esso "restricted". Non riduce gli obblighi di verifica.
- **Progetto in stato "Testing"**: i refresh token con scope Gmail scadono dopo 7 giorni e la sincronizzazione in background si interromperebbe ogni settimana.

## Conseguenze

- Gli utenti vedono la schermata "app non verificata". Il progetto accetta al massimo 100 utenti in tutta la sua vita, quindi sviluppo e produzione usano progetti Google Cloud separati. Un lancio pubblico richiede la verifica degli scope "restricted" e un audit CASA annuale. Le scelte di sicurezza vanno fatte fin da ora in vista di quell'audit.
- Con il consenso granulare l'utente può deselezionare lettura o invio. L'app confronta gli scope concessi con quelli richiesti e mostra lo stato del collegamento. Un `invalid_grant` porta allo stato "da ricollegare", non a un errore fatale.
- Gli identificativi di messaggio e thread di IMAP (`X-GM-MSGID`, `X-GM-THRID`) sono la forma decimale di quelli dell'API. Un eventuale adattatore IMAP futuro, dietro la stessa porta, non richiederebbe di migrare i dati.
