import { stimaCosto } from "@ec/ai";
import type { FunzioneAI } from "@ec/core/dominio";
import { caselle, impostazioni, operativo, posta, sincronizzazione, type ContestoUtente } from "@ec/db";
import { GIORNO_MS, type Dipendenze } from "../dipendenze";
import { acquisisciCopia } from "./acquisizione";

const DIMENSIONE_LOTTO = 50;
const VUOTO = { totale: 0, acquisite: 0, elenchiPendenti: 0, lottiPendenti: 0 };
const FUNZIONI_IMPORTAZIONE: FunzioneAI[] = ["classificazione_priorita", "estrazione_attivita", "attese_risposte"];

function opzioniCasella(casellaId: string) {
  return { coda: `casella:${casellaId}`, priorita: 10 };
}

/** Finestre fissate al collegamento: la posta successiva segue sempre la sincronizzazione normale. */
export function finestreImportazione(dip: Dipendenze, riferimento: Date) {
  return {
    finestraRicevuteDa: new Date(riferimento.getTime() - dip.configurazione.giorniImportazioneRicevute * GIORNO_MS),
    finestraInviateDa: new Date(riferimento.getTime() - dip.configurazione.giorniImportazioneInviate * GIORNO_MS),
  };
}

/** Conta le email della finestra e stima il costo con i prezzi pubblici dei modelli configurati. */
export async function stimaImportazione(dip: Dipendenze, utenteId: string, casellaId: string): Promise<void> {
  const dati = await dip.unita.perUtente(utenteId, async (ctx) => ({
    stato: await sincronizzazione.leggi(ctx, casellaId),
    modelli: await impostazioni.modelli(ctx),
  }));
  if (!dati.stato || !["da_stimare", "stimata", "rifiutata"].includes(dati.stato.faseImportazione)) return;
  const connettore = await dip.connettori.per(casellaId);
  const riferimento = dati.stato.riferimentoImportazione;
  let numeroEmail = 0;
  for (const [tipo, dopo] of [
    ["ricevute", dati.stato.finestraRicevuteDa],
    ["inviate", dati.stato.finestraInviateDa],
  ] as const) {
    for await (const ids of connettore.elenca({ dopo, prima: riferimento, tipo })) numeroEmail += ids.length;
  }
  const prezzi: Partial<Record<FunzioneAI, NonNullable<Awaited<ReturnType<typeof dip.modelli.prezzi>>>>> = {};
  for (const f of FUNZIONI_IMPORTAZIONE) {
    const p = await dip.modelli.prezzi(dati.modelli[f].modello);
    if (p) prezzi[f] = p;
  }
  const stima = stimaCosto({ numeroEmail, funzioni: FUNZIONI_IMPORTAZIONE, prezzi });
  await dip.unita.perUtente(utenteId, async (ctx) => {
    await sincronizzazione.aggiorna(ctx, casellaId, {
      stima: {
        numeroEmail,
        costoStimato: stima.costoStimato,
        calcolataIl: dip.orologio.ora().toISOString(),
        modelli: Object.fromEntries(FUNZIONI_IMPORTAZIONE.map((f) => [f, dati.modelli[f].modello])),
      },
    });
    await sincronizzazione.cambiaFase(ctx, casellaId, "stimata", ["da_stimare", "stimata"], dip.orologio.ora());
  });
}

/** Conferma dell'utente (dalla webapp): avvia l'elenco e l'acquisizione a lotti. */
export async function confermaImportazione(dip: Dipendenze, ctx: ContestoUtente, casellaId: string): Promise<boolean> {
  const ora = dip.orologio.ora();
  const ok = await sincronizzazione.cambiaFase(ctx, casellaId, "in_corso", ["stimata", "rifiutata"], ora);
  if (!ok) return false;
  await sincronizzazione.aggiorna(ctx, casellaId, {
    importazioneConfermataIl: ora,
    avanzamento: { totale: 0, acquisite: 0, elenchiPendenti: 2, lottiPendenti: 0 },
  });
  for (const tipo of ["ricevute", "inviate"] as const) {
    await ctx.coda.accoda("importa_pagina", { utenteId: ctx.utenteId, casellaId, tipo, ids: [] }, opzioniCasella(casellaId));
  }
  return true;
}

export async function rifiutaImportazione(dip: Dipendenze, ctx: ContestoUtente, casellaId: string): Promise<boolean> {
  return sincronizzazione.cambiaFase(ctx, casellaId, "rifiutata", ["stimata", "da_stimare"], dip.orologio.ora());
}

/**
 * Con `ids` vuoto elenca la finestra e accoda i lotti; altrimenti acquisisce il lotto.
 * L'elenco parte dalle email più recenti (ordine del connettore).
 */
export async function importaPagina(
  dip: Dipendenze,
  payload: { utenteId: string; casellaId: string; tipo: "ricevute" | "inviate"; ids: string[] },
): Promise<void> {
  const { utenteId, casellaId, tipo } = payload;
  const stato = await dip.unita.perUtente(utenteId, (ctx) => sincronizzazione.leggi(ctx, casellaId));
  if (!stato || stato.faseImportazione !== "in_corso") return;
  const connettore = await dip.connettori.per(casellaId);

  if (payload.ids.length === 0) {
    const dopo = tipo === "ricevute" ? stato.finestraRicevuteDa : stato.finestraInviateDa;
    let totale = 0;
    let lotti = 0;
    for await (const ids of connettore.elenca({ dopo, prima: stato.riferimentoImportazione, tipo })) {
      for (let i = 0; i < ids.length; i += DIMENSIONE_LOTTO) {
        const lotto = ids.slice(i, i + DIMENSIONE_LOTTO);
        totale += lotto.length;
        lotti += 1;
        await dip.unita.perUtente(utenteId, (ctx) =>
          ctx.coda.accoda("importa_pagina", { utenteId, casellaId, tipo, ids: lotto }, opzioniCasella(casellaId)),
        );
      }
    }
    await dip.unita.perUtente(utenteId, async (ctx) => {
      const attuale = await sincronizzazione.leggi(ctx, casellaId);
      const a = attuale?.avanzamento ?? VUOTO;
      await sincronizzazione.aggiorna(ctx, casellaId, {
        avanzamento: { ...a, totale: a.totale + totale, lottiPendenti: a.lottiPendenti + lotti, elenchiPendenti: Math.max(0, a.elenchiPendenti - 1) },
      });
      await verificaFineImportazione(dip, ctx, casellaId);
    });
    return;
  }

  let acquisite = 0;
  for (const id of payload.ids) {
    const copia = await connettore.leggi(id);
    if (!copia) continue;
    await dip.unita.perUtente(utenteId, async (ctx) => {
      if ((await caselle.bloccaStato(ctx, casellaId)) !== "collegata") return;
      const casella = await caselle.leggi(ctx, casellaId);
      if (casella) {
        await acquisisciCopia(dip, ctx, casella, copia);
        acquisite += 1;
      }
    });
  }
  await dip.unita.perUtente(utenteId, async (ctx) => {
    const attuale = await sincronizzazione.leggi(ctx, casellaId);
    const a = attuale?.avanzamento ?? VUOTO;
    await sincronizzazione.aggiorna(ctx, casellaId, {
      avanzamento: { ...a, acquisite: a.acquisite + acquisite, lottiPendenti: Math.max(0, a.lottiPendenti - 1) },
    });
    await verificaFineImportazione(dip, ctx, casellaId);
  });
}

/**
 * L'importazione termina quando tutte le email elencate sono acquisite e nessuna ha funzioni
 * ancora da eseguire. A quel punto la barriera cade e la riconciliazione procede in ordine cronologico.
 */
export async function verificaFineImportazione(dip: Dipendenze, ctx: ContestoUtente, casellaId: string): Promise<boolean> {
  const stato = await sincronizzazione.leggi(ctx, casellaId);
  if (!stato || stato.faseImportazione !== "in_corso" || !stato.avanzamento) return false;
  const a = stato.avanzamento;
  if (a.elenchiPendenti > 0 || a.lottiPendenti > 0) return false;
  const inAttesa = await posta.emailConFunzioniInStato(ctx, "da_eseguire");
  if (inAttesa.length > 0) return false;
  const chiusa = await sincronizzazione.cambiaFase(ctx, casellaId, "completata", ["in_corso"], dip.orologio.ora());
  if (chiusa) {
    await ctx.coda.accoda("riconcilia_utente", { utenteId: ctx.utenteId }, { chiave: `riconcilia:${ctx.utenteId}`, coda: `utente:${ctx.utenteId}`, modalitaChiave: "preserve_run_at" });
  }
  return chiusa;
}

/**
 * Risposte fuori finestra (§7.4): per un'Attesa nata da una richiesta più vecchia della finestra
 * delle ricevute, acquisisce le email dei destinatari successive alla richiesta solo per valutarle.
 */
export async function recuperaRisposte(dip: Dipendenze, payload: { utenteId: string; attesaId: string }): Promise<void> {
  const dati = await dip.unita.perUtente(payload.utenteId, async (ctx) => {
    const attese = await operativo.atteseAttive(ctx);
    const voce = attese.find((a) => a.attesa.id === payload.attesaId);
    if (!voce) return null;
    const richiesta = await posta.leggi(ctx, voce.attesa.emailRichiestaId, false);
    const copie = await posta.copieDellEmail(ctx, voce.attesa.emailRichiestaId);
    const copia = copie.find((c) => c.cartelle.includes("inviata")) ?? copie[0];
    if (!richiesta || !copia) return null;
    const stato = await sincronizzazione.leggi(ctx, copia.casellaId);
    return { voce, richiesta, copia, stato };
  });
  if (!dati?.stato) return;
  const limite = dati.stato.finestraRicevuteDa;
  if (dati.richiesta.ricevutaIl >= limite) return;
  const connettore = await dip.connettori.per(dati.copia.casellaId);
  const interlocutori = dati.voce.attesa.destinatari.map((d) => d.indirizzo);
  const filtri = [
    { dopo: dati.richiesta.ricevutaIl, prima: limite, tipo: "ricevute" as const, interlocutori },
    ...(dati.copia.threadConnettore ? [{ dopo: dati.richiesta.ricevutaIl, prima: limite, tipo: "ricevute" as const, thread: dati.copia.threadConnettore }] : []),
  ];
  for (const filtro of filtri) {
    for await (const ids of connettore.elenca(filtro)) {
      for (const id of ids) {
        const copia = await connettore.leggi(id);
        if (!copia) continue;
        await dip.unita.perUtente(payload.utenteId, async (ctx) => {
          if ((await caselle.bloccaStato(ctx, dati.copia.casellaId)) !== "collegata") return;
          const casella = await caselle.leggi(ctx, dati.copia.casellaId);
          if (casella) await acquisisciCopia(dip, ctx, casella, copia, { soloPerRisposte: true });
        });
      }
    }
  }
}
