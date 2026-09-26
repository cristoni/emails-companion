import { verificaEvidenze, type OutputAtteseRisposte, type OutputEstrazione, type TabellaAlias } from "@ec/ai";
import {
  derivaStatoAttesa,
  intervalliSovrapposti,
  normalizzaIndirizzo,
  selezionaCandidati,
  toccatoDallUtente,
  validaScadenza,
  valoreEffettivo,
  type Attesa,
  type Attivita,
  type Correzione,
  type Email,
  type Evidenza,
  type Priorita,
  type Requisito,
} from "@ec/core/dominio";
import {
  analisi,
  impostazioni,
  indirizzi,
  operativo,
  posta,
  riconciliazione,
  sincronizzazione,
  type ContestoUtente,
} from "@ec/db";
import { GIORNO_MS, type Dipendenze } from "../dipendenze";
import { categoriaEffettiva, opzioniRiconciliazione } from "../analisi/analizza-email";
import { invocaFunzione } from "../analisi/invocazione";
import { emailPerModello } from "../analisi/per-modello";

const EMAIL_PER_GIRO = 25;
const ORIZZONTE_GIORNI = 60;
const MASSIMO_CANDIDATI = 10;

/** Riconcilia le email pronte dell'utente, in ordine cronologico, a blocchi. */
export async function riconciliaUtente(dip: Dipendenze, utenteId: string): Promise<number> {
  let fatte = 0;
  for (; fatte < EMAIL_PER_GIRO; fatte++) {
    const [prossima] = await dip.unita.perUtente(utenteId, (ctx) => riconciliazione.pronte(ctx, 1));
    if (!prossima) return fatte;
    await riconciliaEmail(dip, utenteId, prossima.id);
  }
  await dip.unita.perUtente(utenteId, (ctx) =>
    ctx.coda.accoda("riconcilia_utente", { utenteId }, { ...opzioniRiconciliazione(utenteId), modalitaChiave: "replace" }),
  );
  return fatte;
}

interface Contesto {
  email: Email;
  categoria: string | null;
  urgente: boolean;
  titoloProposto: string | null;
  descrizioneProposta: string | null;
  estrazione: { analisiId: string; output: OutputEstrazione } | null;
  deterministiche: Map<string, "thread" | "intestazioni">;
  rifiutate: Set<string>;
  candidate: string[];
  indirizziUtente: Set<string>;
  fuso: string;
}

async function caricaContesto(dip: Dipendenze, ctx: ContestoUtente, emailId: string): Promise<Contesto | null> {
  const email = await posta.leggi(ctx, emailId);
  if (!email) return null;
  const [stati, classificazione, rifiutate, indirizziUtente, preferenze] = await Promise.all([
    posta.statiFunzione(ctx, emailId),
    posta.leggiClassificazione(ctx, emailId),
    operativo.collegamentiRifiutati(ctx, emailId),
    indirizzi.dellUtente(ctx),
    impostazioni.preferenze(ctx),
  ]);
  const correzioniEmail = await operativo.correzioniPer(ctx, [{ tipo: "email", id: emailId }]);
  const categoria = classificazione ? await categoriaEffettiva(ctx, emailId, classificazione.categoria) : null;
  const urgente = classificazione
    ? valoreEffettivo(classificazione.urgente, correzioniEmail, { tipo: "email", id: emailId }, "urgente").valore
    : false;

  const idEstrazione = stati.estrazione_attivita?.stato === "eseguita" ? stati.estrazione_attivita.analisiId : null;
  const salvato = idEstrazione ? await analisi.leggiOutput<{ risolto: OutputEstrazione }>(ctx, idEstrazione) : null;

  const deterministiche = new Map<string, "thread" | "intestazioni">();
  const aggiungi = async (altre: string[], origine: "thread" | "intestazioni") => {
    for (const altra of altre) {
      if (altra === emailId) continue;
      const origineSit = await operativo.situazionePerOrigine(ctx, altra);
      const collegate = (await operativo.collegamentiDellEmail(ctx, altra)).filter((c) => c.stato !== "rifiutato").map((c) => c.situazioneId);
      for (const s of [...(origineSit ? [origineSit] : []), ...collegate]) {
        if (!rifiutate.has(s) && !deterministiche.has(s)) deterministiche.set(s, origine);
      }
    }
  };
  await aggiungi(await posta.idPerMessageId(ctx, [...(email.inReplyTo ? [email.inReplyTo] : []), ...email.references]), "intestazioni");
  for (const copia of await posta.copieDellEmail(ctx, emailId)) {
    if (copia.threadConnettore) await aggiungi(await posta.emailDelThread(ctx, copia.casellaId, copia.threadConnettore), "thread");
  }

  return {
    email,
    categoria,
    urgente,
    titoloProposto: classificazione?.titoloSituazione ?? salvato?.risolto.titolo_situazione ?? null,
    descrizioneProposta: classificazione?.descrizioneSituazione ?? salvato?.risolto.descrizione_situazione ?? null,
    estrazione: salvato && idEstrazione ? { analisiId: idEstrazione, output: salvato.risolto } : null,
    deterministiche,
    rifiutate,
    candidate: [],
    indirizziUtente,
    fuso: preferenze.fusoOrario,
  };
}

/** Candidati di correlazione tra le Situazioni recenti, esclusi rifiuti e collegamenti deterministici. */
async function candidatiCorrelazione(ctx: ContestoUtente, c: Contesto): Promise<string[]> {
  const dal = new Date(c.email.ricevutaIl.getTime() - ORIZZONTE_GIORNI * GIORNO_MS);
  const recenti = await riconciliazione.situazioniRecenti(ctx, dal, 200);
  const aggregati = await operativo.aggregati(ctx, recenti.filter((id) => !c.deterministiche.has(id) && !c.rifiutate.has(id)));
  const ultime = await operativo.ultimaAttivitaSituazioni(ctx, aggregati.map((a) => a.situazione.id));
  const candidati = [];
  for (const a of aggregati) {
    const emailIds = [...new Set([a.situazione.emailOrigineId, ...a.collegamenti.filter((l) => l.stato !== "rifiutato").map((l) => l.emailId)])];
    const emails = (await posta.leggiMolte(ctx, emailIds, false)).filter((e) => e.id !== c.email.id);
    candidati.push({
      situazioneId: a.situazione.id,
      partecipanti: emails.flatMap((e) => [e.mittente.indirizzo, ...e.a.map((d) => d.indirizzo), ...e.cc.map((d) => d.indirizzo)]).map(normalizzaIndirizzo),
      messageIds: emails.map((e) => e.messageId).filter((m): m is string => Boolean(m)),
      oggetti: [a.situazione.titolo, ...emails.map((e) => e.oggetto)],
      ultimaAttivita: ultime.get(a.situazione.id) ?? a.situazione.creataIl,
    });
  }
  return selezionaCandidati(
    {
      mittente: normalizzaIndirizzo(c.email.mittente.indirizzo),
      destinatari: [...c.email.a, ...c.email.cc].map((d) => normalizzaIndirizzo(d.indirizzo)),
      oggetto: c.email.oggetto,
      references: c.email.references,
      inReplyTo: c.email.inReplyTo,
      testoCitato: c.email.testo,
    },
    candidati,
    { ora: c.email.ricevutaIl, orizzonteGiorni: ORIZZONTE_GIORNI, massimo: MASSIMO_CANDIDATI, esclusi: c.rifiutate, indirizziUtente: c.indirizziUtente },
  ).map((s) => s.situazioneId);
}

interface Input {
  dati: Parameters<typeof invocaFunzione<"attese_risposte">>[2]["dati"];
  tabella: TabellaAlias;
  testi: Record<string, string>;
}

/** Costruisce il livello dati per `attese_risposte` con alias distinti per ruolo. */
async function preparaAtteseRisposte(ctx: ContestoUtente, c: Contesto, situazioni: string[]): Promise<Input> {
  const aggregati = await operativo.aggregati(ctx, situazioni);
  const tabella = {
    email: { e1: c.email.id } as Record<string, string>,
    situazioni: {} as Record<string, string>,
    atteseEsistenti: {} as Record<string, string>,
    atteseCandidate: {} as Record<string, string>,
    requisiti: {} as Record<string, { id: string; attesa: string }>,
    attivitaCandidate: {} as Record<string, string>,
  } satisfies TabellaAlias;
  const testi: Record<string, string> = { [c.email.id]: c.email.testo };

  const esistenti = (await operativo.atteseDellEmail(ctx, c.email.id)).filter((a) => a.attesa.ciclo !== "superata");
  let w = 0;
  const atteseEsistenti = esistenti.map(({ attesa, requisiti }) => {
    const alias = `w${++w}`;
    tabella.atteseEsistenti[alias] = attesa.id;
    return {
      alias,
      destinatari: attesa.destinatari.map((d) => d.indirizzo),
      oggetto: attesa.oggetto,
      data_attesa_iso: attesa.dataAttesa?.toISOString().slice(0, 10) ?? null,
      requisiti: requisiti.map((r, i) => ({ alias: `${alias}r${i + 1}`, descrizione: r.descrizione, soddisfatto: false })),
    };
  });

  const situazioniPerModello = [];
  const atteseCandidate = [];
  const attivitaCandidate = [];
  let s = 0;
  let t = 0;
  for (const a of aggregati) {
    const aliasS = `s${++s}`;
    tabella.situazioni[aliasS] = a.situazione.id;
    situazioniPerModello.push({ alias: aliasS, titolo: a.situazione.titolo, descrizione: a.situazione.descrizione, email: [] as string[] });
    for (const { attesa, requisiti } of a.attese) {
      if (attesa.emailRichiestaId === c.email.id) continue;
      const risposte = a.risposte.filter((r) => r.attesaId === attesa.id);
      const derivato = derivaStatoAttesa({ attesa, requisiti, risposte, correzioni: a.correzioni });
      if (derivato.stato !== "aperta" && derivato.stato !== "parziale") continue;
      const alias = `w${++w}`;
      tabella.atteseCandidate[alias] = attesa.id;
      requisiti.forEach((r, i) => (tabella.requisiti[`${alias}r${i + 1}`] = { id: r.id, attesa: alias }));
      atteseCandidate.push({
        alias,
        situazione: aliasS,
        email_richiesta: attesa.emailRichiestaId,
        destinatari: attesa.destinatari.map((d) => d.indirizzo),
        oggetto: attesa.oggetto,
        data_attesa_iso: attesa.dataAttesa?.toISOString().slice(0, 10) ?? null,
        requisiti: requisiti.map((r, i) => ({ alias: `${alias}r${i + 1}`, descrizione: r.descrizione, soddisfatto: derivato.requisitiSoddisfatti.includes(r.id) })),
      });
    }
    if (c.email.direzione === "uscita") {
      for (const att of a.attivita) {
        const stato = valoreEffettivo(att.stato, a.correzioni, { tipo: "attivita", id: att.id }, "stato").valore;
        if (stato !== "proposta" && stato !== "confermata") continue;
        const alias = `t${++t}`;
        tabella.attivitaCandidate[alias] = att.id;
        attivitaCandidate.push({ alias, email_sorgente: att.emailSorgenteId, descrizione: att.descrizione, scadenza_iso: att.scadenza?.toISOString().slice(0, 10) ?? null });
      }
    }
  }
  const dati = {
    email: emailPerModello(c.email, "e1", c.fuso),
    contesto: [],
    attese_esistenti: atteseEsistenti,
    situazioni_candidate: situazioniPerModello,
    attese_candidate: atteseCandidate.map((a) => ({ ...a, email_richiesta: "" })),
    attivita_candidate: attivitaCandidate.map((a) => ({ ...a, email_sorgente: "" })),
  };
  return { dati, tabella, testi };
}

/** Riconciliazione di una singola email (§10): idempotente, può essere ripetuta dalla convergenza. */
export async function riconciliaEmail(dip: Dipendenze, utenteId: string, emailId: string): Promise<void> {
  const preparazione = await dip.unita.perUtente(utenteId, async (ctx) => {
    const c = await caricaContesto(dip, ctx, emailId);
    if (!c) return null;
    const serveAi = c.email.direzione === "uscita" || (c.email.direzione === "entrata" && c.categoria !== "news");
    if (!serveAi) return { c, input: null };
    c.candidate = await candidatiCorrelazione(ctx, c);
    const situazioni = [...new Set([...c.deterministiche.keys(), ...c.candidate])];
    if (c.email.direzione === "entrata" && situazioni.length === 0) return { c, input: null };
    return { c, input: await preparaAtteseRisposte(ctx, c, situazioni) };
  });
  if (!preparazione) return;
  const { c, input } = preparazione;

  let output: OutputAtteseRisposte | null = null;
  let analisiAtteseId: string | null = null;
  let statoAttese: "eseguita" | "non_necessaria" | "in_pausa" | "errore" = "non_necessaria";
  let motivo: string | null = null;
  if (input) {
    const esito = await invocaFunzione(dip, utenteId, {
      funzione: "attese_risposte",
      emailId,
      dati: input.dati,
      tabella: input.tabella,
      linguaOutput: c.email.lingua,
    });
    if (esito.tipo === "ok") {
      output = esito.output;
      analisiAtteseId = esito.analisiId;
      statoAttese = "eseguita";
    } else if (esito.tipo === "riprova") {
      await dip.unita.perUtente(utenteId, (ctx) =>
        ctx.coda.accoda("riconcilia_utente", { utenteId }, { ...opzioniRiconciliazione(utenteId), modalitaChiave: "replace", esegui: new Date(dip.orologio.ora().getTime() + esito.dopoMs) }),
      );
      return;
    } else {
      statoAttese = esito.tipo === "in_pausa" ? "in_pausa" : "errore";
      motivo = esito.tipo === "in_pausa" ? esito.motivo : esito.codice;
    }
  }

  await dip.unita.perUtente(utenteId, (ctx) => applica(dip, ctx, c, output, analisiAtteseId, input?.testi ?? { [c.email.id]: c.email.testo }));
  await dip.unita.perUtente(utenteId, async (ctx) => {
    await posta.impostaStatoFunzione(ctx, emailId, "attese_risposte", statoAttese, dip.orologio.ora(), motivo, analisiAtteseId);
    await posta.segnaRiconciliata(ctx, emailId, dip.orologio.ora());
  });
}

async function applica(
  dip: Dipendenze,
  ctx: ContestoUtente,
  c: Contesto,
  output: OutputAtteseRisposte | null,
  analisiAtteseId: string | null,
  testi: Record<string, string>,
): Promise<void> {
  const ora = dip.orologio.ora();
  const e = c.email;
  const evid = (lista: { email: string; citazione: string }[]): Evidenza[] => verificaEvidenze(lista, testi);
  const toccate = new Set<string>();

  // 1. Situazione di destinazione: deterministica, poi proposta dall'AI, poi nuova se servono elementi.
  const collegamentiAi = (output?.collegamenti ?? []).filter((l) => l.pertinente && !c.rifiutate.has(l.candidato)).sort((a, b) => b.confidenza - a.confidenza);
  for (const [sit, origine] of c.deterministiche) {
    await operativo.collega(ctx, { emailId: e.id, situazioneId: sit, origine, ruolo: "risposta", stato: "confermato", confidenza: null, analisiId: null }, ora);
    toccate.add(sit);
  }
  for (const l of collegamentiAi) {
    if (c.deterministiche.has(l.candidato)) continue;
    await operativo.collega(ctx, { emailId: e.id, situazioneId: l.candidato, origine: "ai", ruolo: "risposta", stato: "proposto", confidenza: l.confidenza, analisiId: analisiAtteseId }, ora);
    toccate.add(l.candidato);
  }
  let destinazione: string | null = [...c.deterministiche.keys()][0] ?? collegamentiAi[0]?.candidato ?? null;

  const richiesteNuove = (output?.richieste ?? []).filter((r) => r.esito === "nuovo" && !r.sollecito_di);
  const elementiNuovi = (c.estrazione?.output.elementi ?? []).filter((x) => x.esito === "nuovo");
  const urgenteOperativa = e.direzione === "entrata" && c.urgente && c.categoria !== "news";
  const origineEsistente = await operativo.situazionePerOrigine(ctx, e.id);

  if (!destinazione && (origineEsistente || richiesteNuove.length || elementiNuovi.length || urgenteOperativa) && !e.soloPerRisposte) {
    const titolo = c.titoloProposto?.trim() || e.oggetto || "—";
    destinazione = await operativo.creaSituazione(ctx, {
      id: dip.ids.nuovo(),
      emailOrigineId: e.id,
      titolo,
      descrizione: c.descrizioneProposta?.trim() || "",
      lingua: e.lingua,
      creataIl: e.ricevutaIl,
    });
    await operativo.collega(ctx, { emailId: e.id, situazioneId: destinazione, origine: "thread", ruolo: "origine", stato: "confermato", confidenza: null, analisiId: null }, ora);
    if (!origineEsistente) {
      await operativo.evento(ctx, { situazioneId: destinazione, attore: "ai", tipo: "situazione_creata", riferimenti: { email: e.id }, dettagli: null, creatoIl: ora });
    }
  } else if (destinazione && origineEsistente && origineEsistente !== destinazione) {
    // Una risposta arrivata prima della richiesta aveva aperto una propria Situazione: la si assorbe se l'utente non l'ha toccata.
    const [agg] = await operativo.aggregati(ctx, [origineEsistente]);
    const toccata =
      agg && (agg.correzioni.length > 0 || agg.attivita.some((a) => a.stato === "confermata") || agg.collegamenti.some((l) => l.origine === "utente"));
    if (agg && !toccata && agg.collegamenti.filter((l) => l.stato !== "rifiutato" && l.emailId !== e.id).length === 0) {
      await operativo.assorbi(ctx, origineEsistente, destinazione, ora);
      await operativo.evento(ctx, { situazioneId: destinazione, attore: "sistema", tipo: "situazione_unita", riferimenti: { da: origineEsistente }, dettagli: null, creatoIl: ora });
    }
  }
  if (destinazione) toccate.add(destinazione);

  // 2. Attività dall'estrazione.
  if (c.estrazione && destinazione) {
    const esistenti = await operativo.attivitaDellEmail(ctx, e.id);
    const correzioni = await operativo.correzioniPer(ctx, esistenti.map((a) => ({ tipo: "attivita" as const, id: a.id })));
    const giaApplicata = esistenti.some((a) => a.analisiId === c.estrazione?.analisiId);
    let slot = Math.max(0, ...esistenti.map((a) => a.slot));
    for (const el of c.estrazione.output.elementi) {
      const evidenze = evid(el.evidenze);
      if (el.esito !== "nuovo") {
        const esistente = esistenti.find((a) => a.id === el.riferimento);
        if (!esistente || toccatoDallUtente(correzioni, { tipo: "attivita", id: esistente.id })) continue;
        if (el.esito === "non_trovato") await operativo.aggiornaAttivita(ctx, esistente.id, { stato: "superata", analisiId: c.estrazione.analisiId }, ora);
        else await operativo.aggiornaAttivita(ctx, esistente.id, datiAttivita(el, evidenze, e, c.estrazione.analisiId), ora);
        continue;
      }
      if (giaApplicata) continue;
      const simile = esistenti.find((a) => a.evidenze.some((x) => evidenze.some((y) => intervalliSovrapposti(x, y))));
      if (simile) {
        if (simile.stato === "scartata" || toccatoDallUtente(correzioni, { tipo: "attivita", id: simile.id })) continue;
        await operativo.aggiornaAttivita(ctx, simile.id, datiAttivita(el, evidenze, e, c.estrazione.analisiId), ora);
        continue;
      }
      const d = datiAttivita(el, evidenze, e, c.estrazione.analisiId);
      const id = dip.ids.nuovo();
      await operativo.inserisciAttivita(
        ctx,
        {
          id,
          situazioneId: destinazione,
          emailSorgenteId: e.id,
          slot: ++slot,
          descrizione: d.descrizione ?? "",
          scadenza: d.scadenza ?? null,
          scadenzaCitazione: d.scadenzaCitazione ?? null,
          priorita: d.priorita ?? "media",
          urgente: d.urgente ?? false,
          base: d.base ?? "dedotto",
          stato: "proposta",
          completataDa: null,
          emailCompletamentoId: null,
          completataIl: null,
          evidenze,
          analisiId: c.estrazione.analisiId,
          creataIl: e.ricevutaIl,
        },
        evidenze,
      );
      await operativo.evento(ctx, { situazioneId: destinazione, attore: "ai", tipo: "attivita_proposta", riferimenti: { attivita: id, email: e.id }, dettagli: null, creatoIl: ora });
      if (e.direzione === "entrata") await convergiDopoAttivita(ctx, e);
    }
  }

  // 3. Attese e solleciti dalle email inviate (mai verso sé stessi).
  if (output && e.direzione === "uscita") {
    const esistenti = await operativo.atteseDellEmail(ctx, e.id);
    const correzioni = await operativo.correzioniPer(ctx, esistenti.map((a) => ({ tipo: "attesa" as const, id: a.attesa.id })));
    let slot = Math.max(0, ...esistenti.map((a) => a.attesa.slot));
    for (const r of output.richieste) {
      const evidenze = evid(r.evidenze);
      if (r.sollecito_di) {
        const atteseAttive = await operativo.atteseAttive(ctx);
        const sollecitata = atteseAttive.find((a) => a.attesa.id === r.sollecito_di);
        if (sollecitata) {
          await operativo.collega(ctx, { emailId: e.id, situazioneId: sollecitata.attesa.situazioneId, origine: "ai", ruolo: "sollecito", stato: c.deterministiche.has(sollecitata.attesa.situazioneId) ? "confermato" : "proposto", confidenza: null, analisiId: analisiAtteseId }, ora);
          toccate.add(sollecitata.attesa.situazioneId);
        }
        continue;
      }
      if (r.esito !== "nuovo") {
        const esistente = esistenti.find((a) => a.attesa.id === r.riferimento);
        if (!esistente || toccatoDallUtente(correzioni, { tipo: "attesa", id: esistente.attesa.id })) continue;
        if (r.esito === "non_trovato") await operativo.aggiornaAttesa(ctx, esistente.attesa.id, { ciclo: "superata", analisiId: analisiAtteseId }, ora);
        else if (r.oggetto) await operativo.aggiornaAttesa(ctx, esistente.attesa.id, { oggetto: r.oggetto, analisiId: analisiAtteseId }, ora);
        continue;
      }
      const destinatari = destinatariAttesa(r.destinatari, e, c.indirizziUtente);
      if (destinatari.length === 0 || !destinazione) continue;
      if (esistenti.some((a) => a.attesa.evidenze.some((x) => evidenze.some((y) => intervalliSovrapposti(x, y))))) continue;
      const scadenza = validaScadenza({ iso: r.data_attesa_iso, citazione: r.data_attesa_citazione, testo: e.testo, ricevutaIl: e.ricevutaIl });
      const verificate = evidenze.some((x) => x.verificata);
      const attesaId = dip.ids.nuovo();
      const oggetto = r.oggetto?.trim() || e.oggetto;
      const requisiti = (r.requisiti.length ? r.requisiti : [oggetto]).map((descrizione) => ({ id: dip.ids.nuovo(), descrizione }));
      await operativo.inserisciAttesa(
        ctx,
        {
          id: attesaId,
          situazioneId: destinazione,
          emailRichiestaId: e.id,
          slot: ++slot,
          destinatari,
          oggetto,
          dataAttesa: scadenza.scadenza,
          ciclo: "proposta",
          base: r.base === "rilevato" && verificate ? "rilevato" : "dedotto",
          evidenze,
          analisiId: analisiAtteseId,
          creataIl: e.ricevutaIl,
        },
        requisiti,
        await Promise.all(destinatari.map((d) => ctx.codec.indice("indirizzo", normalizzaIndirizzo(d.indirizzo)))),
      );
      await operativo.evento(ctx, { situazioneId: destinazione, attore: "ai", tipo: "attesa_proposta", riferimenti: { attesa: attesaId, email: e.id }, dettagli: null, creatoIl: ora });
      await convergiDopoAttesa(ctx, e, destinatari.map((d) => d.indirizzo));
      await forseRecuperaRisposte(ctx, e, attesaId);
    }
  }

  // 4. Valutazioni delle risposte alle Attese candidate.
  for (const v of output?.valutazioni ?? []) {
    if (v.valutazione === "non_pertinente") continue;
    const attese = await operativo.atteseAttive(ctx);
    const voce = attese.find((a) => a.attesa.id === v.attesa);
    if (!voce) continue;
    const deterministica = c.deterministiche.get(voce.attesa.situazioneId);
    const requisiti = v.requisiti
      .filter((q) => q.soddisfatto)
      .map((q) => ({ requisitoId: q.requisito, evidenze: evid(q.evidenze) }));
    await operativo.registraRisposta(
      ctx,
      {
        attesaId: voce.attesa.id,
        emailId: e.id,
        origine: deterministica ?? "ai",
        statoCollegamento: deterministica ? "confermato" : "proposto",
        confidenza: null,
        valutazione: v.valutazione,
        motivazione: v.motivazione,
        arrivataIl: e.ricevutaIl,
        analisiId: analisiAtteseId,
        requisiti,
      },
      ora,
    );
    await operativo.collega(ctx, { emailId: e.id, situazioneId: voce.attesa.situazioneId, origine: deterministica ?? "ai", ruolo: "risposta", stato: deterministica ? "confermato" : "proposto", confidenza: null, analisiId: analisiAtteseId }, ora);
    toccate.add(voce.attesa.situazioneId);
    await operativo.evento(ctx, { situazioneId: voce.attesa.situazioneId, attore: "ai", tipo: `risposta_${v.valutazione}`, riferimenti: { attesa: voce.attesa.id, email: e.id }, dettagli: null, creatoIl: ora });
  }

  // 5. Completamento delle Attività da email inviate: automatico solo con evidenza verificata.
  if (e.direzione === "uscita") {
    for (const comp of output?.completamenti ?? []) {
      if (comp.esito === "non_pertinente") continue;
      const aperte = await operativo.attivitaAperteDellUtente(ctx);
      const att = aperte.find((a) => a.id === comp.attivita);
      if (!att) continue;
      const correzioni = await operativo.correzioniPer(ctx, [{ tipo: "attivita", id: att.id }]);
      if (toccatoDallUtente(correzioni, { tipo: "attivita", id: att.id })) continue;
      const evidenze = evid(comp.evidenze);
      if (comp.esito === "completata" && evidenze.some((x) => x.verificata && x.emailId === e.id)) {
        await operativo.aggiornaAttivita(ctx, att.id, { stato: "completata", completataDa: "ai", emailCompletamentoId: e.id, completataIl: e.ricevutaIl }, ora);
        await operativo.evento(ctx, { situazioneId: att.situazioneId, attore: "ai", tipo: "attivita_completata", riferimenti: { attivita: att.id, email: e.id }, dettagli: null, creatoIl: ora });
      } else if (comp.esito === "completata") {
        await operativo.evento(ctx, { situazioneId: att.situazioneId, attore: "ai", tipo: "completamento_da_verificare", riferimenti: { attivita: att.id, email: e.id }, dettagli: null, creatoIl: ora });
      } else if (comp.esito === "aggiornata" && comp.nuova_scadenza_iso) {
        const s = validaScadenza({ iso: comp.nuova_scadenza_iso, citazione: comp.evidenze[0]?.citazione ?? null, testo: e.testo, ricevutaIl: e.ricevutaIl });
        if (s.scadenza) await operativo.aggiornaAttivita(ctx, att.id, { scadenza: s.scadenza }, ora);
      }
      toccate.add(att.situazioneId);
    }
  }

  for (const s of toccate) await operativo.toccaSituazione(ctx, s, e.ricevutaIl);
}

function datiAttivita(
  el: OutputEstrazione["elementi"][number],
  evidenze: Evidenza[],
  e: Email,
  analisiId: string,
): Partial<Pick<Attivita, "descrizione" | "scadenza" | "scadenzaCitazione" | "priorita" | "urgente" | "base" | "analisiId">> {
  const scadenza = validaScadenza({ iso: el.scadenza_iso, citazione: el.scadenza_citazione, testo: e.testo, ricevutaIl: e.ricevutaIl });
  return {
    ...(el.descrizione ? { descrizione: el.descrizione } : {}),
    scadenza: scadenza.scadenza,
    scadenzaCitazione: el.scadenza_citazione,
    ...(el.priorita ? { priorita: el.priorita as Priorita } : {}),
    ...(el.urgente !== null ? { urgente: el.urgente } : {}),
    base: el.base === "rilevato" && evidenze.some((x) => x.verificata) ? "rilevato" : "dedotto",
    analisiId,
  };
}

/** Destinatari dell'Attesa: solo indirizzi presenti nell'email e non appartenenti all'utente. */
function destinatariAttesa(proposti: string[], e: Email, indirizziUtente: ReadonlySet<string>) {
  const presenti = [...e.a, ...e.cc];
  const scelti = proposti.map(normalizzaIndirizzo);
  const validi = presenti.filter((d) => scelti.includes(normalizzaIndirizzo(d.indirizzo)) && !indirizziUtente.has(normalizzaIndirizzo(d.indirizzo)));
  return validi.length ? validi : e.a.filter((d) => !indirizziUtente.has(normalizzaIndirizzo(d.indirizzo)));
}

/** Convergenza: una nuova Attesa rielabora le email già arrivate dai suoi destinatari. */
async function convergiDopoAttesa(ctx: ContestoUtente, richiesta: Email, destinatari: string[]) {
  const indici = await Promise.all(destinatari.map((d) => ctx.codec.indice("indirizzo", normalizzaIndirizzo(d))));
  const successive = await riconciliazione.successiveDaMittenti(ctx, richiesta.ricevutaIl, indici);
  await riconciliazione.rimettiInCoda(ctx, successive);
}

/** Convergenza: una nuova Attività rielabora le risposte già inviate dall'utente al mittente. */
async function convergiDopoAttivita(ctx: ContestoUtente, sorgente: Email) {
  const indice = await ctx.codec.indice("indirizzo", normalizzaIndirizzo(sorgente.mittente.indirizzo));
  const successive = await riconciliazione.successiveVerso(ctx, sorgente.ricevutaIl, [indice]);
  await riconciliazione.rimettiInCoda(ctx, successive);
}

async function forseRecuperaRisposte(ctx: ContestoUtente, richiesta: Email, attesaId: string) {
  const copie = await posta.copieDellEmail(ctx, richiesta.id);
  for (const copia of copie) {
    const stato = await sincronizzazione.leggi(ctx, copia.casellaId);
    if (stato && richiesta.ricevutaIl < stato.finestraRicevuteDa) {
      await ctx.coda.accoda("recupera_risposte", { utenteId: ctx.utenteId, attesaId }, { coda: `casella:${copia.casellaId}`, priorita: 10 });
      return;
    }
  }
}

export type { Attesa, Requisito, Correzione };
