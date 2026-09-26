import { createHash } from "node:crypto";
import {
  determinaDirezione,
  daEscludereDallAnalisi,
  normalizzaIndirizzo,
  scegliLingua,
  testoPerRilevamento,
  type Cartella,
  type CasellaCollegata,
  type FunzioneAI,
} from "@ec/core/dominio";
import type { CopiaNormalizzata } from "@ec/core/porte";
import { impostazioni, indirizzi, posta, type ContestoUtente } from "@ec/db";
import type { Dipendenze } from "../dipendenze";

export interface EsitoAcquisizione {
  emailId: string;
  nuovaEmail: boolean;
  nuovaCopia: boolean;
}

function hashContenuto(c: CopiaNormalizzata): string {
  return createHash("sha256").update(`${c.oggetto}\u0000${c.testo}`).digest("hex");
}

const ATTESA_COPIA_INVIATA_MS = 15 * 60 * 1000;

/**
 * Direzione con verifica del mittente (§5.3): un mittente uguale a un indirizzo dell'utente conta come
 * invio solo se esiste una copia nella cartella inviata; altrimenti l'email resta in entrata (il mittente
 * può essere contraffatto) e l'analisi attende la copia inviata per un tempo limitato.
 */
export function direzioneVerificata(input: {
  cartelleCopie: Cartella[][];
  mittente: string;
  destinatari: string[];
  indirizziUtente: ReadonlySet<string>;
}): { direzione: "entrata" | "uscita" | "interna"; provvisoria: boolean } {
  const direzione = determinaDirezione(input);
  const haCopiaInviata = input.cartelleCopie.some((c) => c.includes("inviata"));
  if (direzione !== "entrata" && !haCopiaInviata && input.indirizziUtente.has(input.mittente)) return { direzione: "entrata", provvisoria: true };
  return { direzione, provvisoria: false };
}

/** Funzioni da eseguire per un'email appena acquisita, in base alla direzione. */
export function funzioniIniziali(direzione: "entrata" | "uscita" | "interna"): FunzioneAI[] {
  return direzione === "entrata" ? ["classificazione_priorita"] : ["estrazione_attivita"];
}

/**
 * Salva una copia e la raggruppa nell'Email logica dell'utente. Una nuova Email da analizzare
 * riceve lo stato delle funzioni e un job di analisi nella stessa transazione.
 */
export async function acquisisciCopia(
  dip: Dipendenze,
  ctx: ContestoUtente,
  casella: CasellaCollegata,
  copia: CopiaNormalizzata,
  opzioni: { soloPerRisposte?: boolean } = {},
): Promise<EsitoAcquisizione> {
  const ora = dip.orologio.ora();
  const esistente = await posta.trovaCopia(ctx, casella.id, copia.idConnettore);
  if (esistente) {
    await posta.aggiornaCartelle(ctx, casella.id, copia.idConnettore, copia.cartelle, copia.etichette);
    return { emailId: esistente.emailId, nuovaEmail: false, nuovaCopia: false };
  }

  const indirizziUtente = await indirizzi.dellUtente(ctx);
  const hash = hashContenuto(copia);
  const chiavi = await posta.chiaviLogiche(ctx, { messageId: copia.messageId, mittente: copia.mittente.indirizzo, hashContenuto: hash });
  let emailId = await posta.trovaEmailLogica(ctx, chiavi);
  let nuovaEmail = false;
  let provvisoria = false;

  if (!emailId) {
    const destinatari = [...copia.a, ...copia.cc].map((d) => normalizzaIndirizzo(d.indirizzo));
    const verificata = direzioneVerificata({
      cartelleCopie: [copia.cartelle],
      mittente: normalizzaIndirizzo(copia.mittente.indirizzo),
      destinatari,
      indirizziUtente,
    });
    provvisoria = verificata.provvisoria;
    const direzione = verificata.direzione;
    const preferenze = await impostazioni.preferenze(ctx);
    const lingua = scegliLingua({
      correzione: null,
      rilevamento: dip.lingua.rileva(testoPerRilevamento(copia.oggetto, copia.testo)),
      linguaThread: null,
      linguaRisposta: null,
      linguaInterfaccia: preferenze.lingua,
    });
    const inserita = await posta.inserisciEmail(
      ctx,
      {
        id: dip.ids.nuovo(),
        messageId: copia.messageId,
        direzione,
        mittente: copia.mittente,
        a: copia.a,
        cc: copia.cc,
        replyTo: copia.replyTo,
        oggetto: copia.oggetto,
        testo: copia.testo,
        anteprima: anteprimaDi(copia.testo),
        ricevutaIl: copia.ricevutaIl,
        inReplyTo: copia.inReplyTo,
        references: copia.references,
        lingua: lingua.lingua,
        fonteLingua: lingua.fonte,
        nomiAllegati: copia.nomiAllegati,
        soloPerRisposte: opzioni.soloPerRisposte ?? false,
        hashContenuto: hash,
      },
      chiavi,
    );
    emailId = inserita.id;
    nuovaEmail = inserita.nuova;
  } else {
    await posta.aggiornaRicevuta(ctx, emailId, copia.ricevutaIl);
  }

  await posta.inserisciCopia(ctx, {
    id: dip.ids.nuovo(),
    casellaId: casella.id,
    emailId,
    idConnettore: copia.idConnettore,
    threadConnettore: copia.threadConnettore,
    cartelle: copia.cartelle,
    etichette: copia.etichette,
    origineInvio: copia.cartelle.includes("inviata") ? "esterna" : null,
    eliminataNelProvider: false,
  });

  const copie = await posta.copieDellEmail(ctx, emailId);
  if (!nuovaEmail) {
    await aggiornaDirezioneDaCopie(dip, ctx, emailId, copie.map((c) => c.cartelle), copia, indirizziUtente);
    return { emailId, nuovaEmail: false, nuovaCopia: true };
  }

  if (daEscludereDallAnalisi(copie.map((c) => c.cartelle))) return { emailId, nuovaEmail: true, nuovaCopia: true };
  const email = await posta.leggi(ctx, emailId, false);
  if (!email) return { emailId, nuovaEmail, nuovaCopia: true };
  if (opzioni.soloPerRisposte) {
    await posta.segnaPronta(ctx, emailId);
    await ctx.coda.accoda("riconcilia_utente", { utenteId: ctx.utenteId }, { chiave: `riconcilia:${ctx.utenteId}`, coda: `utente:${ctx.utenteId}`, modalitaChiave: "preserve_run_at" });
    return { emailId, nuovaEmail, nuovaCopia: true };
  }
  for (const funzione of funzioniIniziali(email.direzione)) {
    await posta.impostaStatoFunzione(ctx, emailId, funzione, "da_eseguire", ora);
  }
  await ctx.coda.accoda(
    "analizza_email",
    { utenteId: ctx.utenteId, emailId },
    { chiave: `analisi:${emailId}`, ...(provvisoria ? { esegui: new Date(ora.getTime() + ATTESA_COPIA_INVIATA_MS) } : {}) },
  );
  return { emailId, nuovaEmail, nuovaCopia: true };
}

/**
 * Una nuova copia può cambiare la direzione (es. arriva la copia inviata di un'email vista prima in entrata):
 * se l'analisi non è ancora partita si reimpostano le funzioni per la nuova direzione.
 */
async function aggiornaDirezioneDaCopie(
  dip: Dipendenze,
  ctx: ContestoUtente,
  emailId: string,
  cartelleCopie: Cartella[][],
  copia: CopiaNormalizzata,
  indirizziUtente: ReadonlySet<string>,
) {
  const attuale = await posta.leggi(ctx, emailId, false);
  if (!attuale) return;
  const { direzione } = direzioneVerificata({
    cartelleCopie,
    mittente: normalizzaIndirizzo(copia.mittente.indirizzo),
    destinatari: [...copia.a, ...copia.cc].map((d) => normalizzaIndirizzo(d.indirizzo)),
    indirizziUtente,
  });
  if (direzione === attuale.direzione) return;
  await posta.aggiornaDirezione(ctx, emailId, direzione);
  const stati = await posta.statiFunzione(ctx, emailId);
  if (Object.values(stati).some((s) => s && s.stato !== "da_eseguire")) return;
  const ora = dip.orologio.ora();
  for (const f of ["classificazione_priorita", "estrazione_attivita"] as const) {
    await posta.impostaStatoFunzione(ctx, emailId, f, funzioniIniziali(direzione).includes(f) ? "da_eseguire" : "non_necessaria", ora);
  }
  await ctx.coda.accoda("analizza_email", { utenteId: ctx.utenteId, emailId }, { chiave: `analisi:${emailId}`, modalitaChiave: "replace" });
}

function anteprimaDi(testo: string): string {
  const riga = testo.replace(/\s+/g, " ").trim();
  return riga.length > 200 ? `${riga.slice(0, 199)}…` : riga;
}
