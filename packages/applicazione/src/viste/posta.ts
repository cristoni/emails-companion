import { valoreEffettivo, type Categoria, type Correzione, type FunzioneAI, type Priorita, type StatoFunzioneEmail } from "@ec/core/dominio";
import { operativo, posta, type ContestoUtente } from "@ec/db";
import type { Dipendenze } from "../dipendenze";
import { correzioniDto, evidenzeDto, iso, perche, statoCollegamentoEffettivo, UUID } from "./calcolo";
import { viste } from "./repository";
import { copiaDto, indirizziCaselle } from "./situazione";
import type { ElencoPostaDto, StatoAnalisiEmail, VistaEmailDto, VoceEmailDto } from "./tipi";

type DipendenzeViste = Dipendenze;

const LIMITE_MASSIMO = 100;

function codificaCursore(ricevutaIl: Date, id: string): string {
  return `${ricevutaIl.getTime()}_${id}`;
}

function decodificaCursore(cursore: string): { ricevutaIl: Date; id: string } | null {
  const m = /^(\d{1,15})_([0-9a-f-]{36})$/i.exec(cursore);
  if (!m || !UUID.test(m[2]!)) return null;
  return { ricevutaIl: new Date(Number(m[1])), id: m[2]! };
}

function statoAnalisi(stati: readonly { stato: StatoFunzioneEmail }[] | undefined): StatoAnalisiEmail {
  if (!stati || stati.length === 0) return "non_prevista";
  if (stati.some((s) => s.stato === "in_pausa")) return "in_pausa";
  if (stati.some((s) => s.stato === "da_eseguire")) return "da_analizzare";
  if (stati.some((s) => s.stato === "errore")) return "errore";
  return "analizzata";
}

function effettivi(emailId: string, ai: { categoria: Categoria; urgente: boolean; priorita: Priorita } | undefined, correzioni: readonly Correzione[]) {
  const soggetto = { tipo: "email", id: emailId } as const;
  return {
    categoria: valoreEffettivo<Categoria | null>(ai?.categoria ?? null, correzioni, soggetto, "categoria").valore,
    urgente: valoreEffettivo<boolean>(ai?.urgente ?? false, correzioni, soggetto, "urgente").valore === true,
    priorita: valoreEffettivo<Priorita | null>(ai?.priorita ?? null, correzioni, soggetto, "priorita").valore,
  };
}

/**
 * Elenco in sola lettura della posta sincronizzata (§13 `/mail`), dalla più recente, con filtro per casella.
 * `prima` è il cursore restituito dalla pagina precedente.
 */
export async function elencoPosta(
  _dip: DipendenzeViste,
  ctx: ContestoUtente,
  opzioni: { casellaId?: string; prima?: string; limite: number },
): Promise<ElencoPostaDto> {
  const limite = Math.max(1, Math.min(LIMITE_MASSIMO, Math.floor(opzioni.limite) || 1));
  if (opzioni.casellaId !== undefined && !UUID.test(opzioni.casellaId)) return { email: [], cursore: null };
  const prima = opzioni.prima === undefined ? undefined : decodificaCursore(opzioni.prima);
  if (prima === null) return { email: [], cursore: null };

  const ids = await viste.paginaEmail(ctx, { ...(opzioni.casellaId ? { casellaId: opzioni.casellaId } : {}), ...(prima ? { prima } : {}), limite: limite + 1 });
  const pagina = ids.slice(0, limite);
  const [email, classificazioni, correzioni, copie, caselle, stati] = await Promise.all([
    posta.leggiMolte(ctx, pagina, false),
    viste.classificazioni(ctx, pagina),
    operativo.correzioniPer(ctx, pagina.map((id) => ({ tipo: "email" as const, id }))),
    viste.copie(ctx, pagina),
    viste.caselle(ctx),
    viste.statiFunzioni(ctx, pagina),
  ]);
  const perId = indirizziCaselle(caselle);
  const perEmail = new Map(email.map((e) => [e.id, e]));
  const voci = pagina.flatMap((id): VoceEmailDto[] => {
    const e = perEmail.get(id);
    if (!e) return [];
    const valori = effettivi(id, classificazioni.get(id), correzioni);
    const proprie = copie.filter((c) => c.emailId === id);
    return [
      {
        id,
        direzione: e.direzione,
        mittente: e.mittente,
        destinatari: [...e.a, ...e.cc],
        oggetto: e.oggetto,
        anteprima: e.anteprima,
        ricevutaIl: iso(e.ricevutaIl),
        lingua: e.lingua,
        categoria: valori.categoria,
        urgente: valori.urgente,
        allegati: e.nomiAllegati,
        caselle: [...new Map(proprie.map((c) => [c.casellaId, { casellaId: c.casellaId, indirizzo: perId.get(c.casellaId) ?? "" }])).values()],
        analisi: statoAnalisi(stati.get(id)),
      },
    ];
  });
  const ultima = pagina.length ? perEmail.get(pagina[pagina.length - 1]!) : undefined;
  return { email: voci, cursore: ids.length > limite && ultima ? codificaCursore(ultima.ricevutaIl, ultima.id) : null };
}

/**
 * Lettura di un'email (§13 `/mail/[id]`): testo normalizzato, classificazione con valori effettivi,
 * motivazione ed evidenze, copie con cartelle, Situazioni collegate e lingua con la sua fonte.
 */
export async function vistaEmail(_dip: DipendenzeViste, ctx: ContestoUtente, emailId: string): Promise<VistaEmailDto | null> {
  if (!UUID.test(emailId)) return null;
  const e = await posta.leggi(ctx, emailId, true);
  if (!e) return null;
  const soggetto = { tipo: "email", id: emailId } as const;
  const [classificazione, aiInChiaro, correzioni, copie, caselle, stati, collegamenti, origine] = await Promise.all([
    posta.leggiClassificazione(ctx, emailId),
    viste.classificazioni(ctx, [emailId]),
    operativo.correzioniPer(ctx, [soggetto]),
    viste.copie(ctx, [emailId]),
    viste.caselle(ctx),
    viste.statiFunzioni(ctx, [emailId]),
    operativo.collegamentiDellEmail(ctx, emailId),
    operativo.situazionePerOrigine(ctx, emailId),
  ]);
  const correzioniCollegamenti = await operativo.correzioniPer(ctx, collegamenti.map((c) => ({ tipo: "collegamento" as const, id: c.id })));
  const titoli = await viste.titoliSituazioni(ctx, [...new Set([...collegamenti.map((c) => c.situazioneId), ...(origine ? [origine] : [])])]);
  const visibile = (id: string) => titoli.has(id) && titoli.get(id)!.assorbitaIn === null;

  const situazioni: VistaEmailDto["situazioni"] = [];
  for (const c of collegamenti) {
    if (!visibile(c.situazioneId)) continue;
    situazioni.push({
      situazioneId: c.situazioneId,
      titolo: titoli.get(c.situazioneId)!.titolo,
      collegamentoId: c.id,
      ruolo: c.ruolo,
      origine: c.origine,
      stato: statoCollegamentoEffettivo(c, correzioniCollegamenti),
      origineDellaSituazione: c.situazioneId === origine,
    });
  }
  if (origine && visibile(origine) && !situazioni.some((s) => s.situazioneId === origine)) {
    situazioni.push({ situazioneId: origine, titolo: titoli.get(origine)!.titolo, collegamentoId: null, ruolo: null, origine: null, stato: null, origineDellaSituazione: true });
  }

  const ai = aiInChiaro.get(emailId);
  const valori = effettivi(emailId, ai, correzioni);
  const lingua = valoreEffettivo<string>(e.lingua, correzioni, soggetto, "lingua");
  const perId = indirizziCaselle(caselle);
  return {
    id: e.id,
    direzione: e.direzione,
    mittente: e.mittente,
    a: e.a,
    cc: e.cc,
    replyTo: e.replyTo,
    oggetto: e.oggetto,
    testo: e.testo,
    ricevutaIl: iso(e.ricevutaIl),
    allegati: e.nomiAllegati,
    soloPerRisposte: e.soloPerRisposte,
    lingua: { valore: e.lingua, fonte: e.fonteLingua, corretta: lingua.corretto },
    classificazione:
      classificazione && ai
        ? {
            categoria: valori.categoria ?? classificazione.categoria,
            categoriaAi: classificazione.categoria,
            urgente: valori.urgente,
            urgenteAi: classificazione.urgente,
            priorita: valori.priorita ?? classificazione.priorita,
            prioritaAi: classificazione.priorita,
            baseUrgenza: ai.baseUrgenza,
            motivazione: classificazione.motivazione,
            evidenze: evidenzeDto(classificazione.evidenze),
            analisiId: classificazione.analisiId,
          }
        : null,
    correzioni: correzioniDto(correzioni, soggetto),
    copie: copie.map((c) => copiaDto(c, perId)),
    situazioni,
    analisi: (stati.get(emailId) ?? [])
      .map((s) => ({ funzione: s.funzione as FunzioneAI, stato: s.stato, motivo: s.motivo }))
      .sort((a, b) => (a.funzione < b.funzione ? -1 : 1)),
    perche: await perche(ctx, [{ soggetto: { tipo: "classificazione", id: emailId }, analisiId: classificazione?.analisiId ?? null }]),
  };
}
