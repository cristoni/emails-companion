export function normalizzaIndirizzo(indirizzo: string): string {
  return indirizzo.trim().toLowerCase();
}

export function dominioDi(indirizzo: string): string | null {
  const normalizzato = normalizzaIndirizzo(indirizzo);
  const chiocciola = normalizzato.lastIndexOf("@");
  if (chiocciola < 0) return null;
  const dominio = normalizzato.slice(chiocciola + 1);
  return dominio === "" ? null : dominio;
}

/** Domini condivisi da utenti non collegati tra loro: non indicano un'organizzazione comune. */
export const DOMINI_POSTA_PUBBLICA: ReadonlySet<string> = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "hotmail.it",
  "live.com",
  "live.it",
  "msn.com",
  "yahoo.com",
  "yahoo.it",
  "icloud.com",
  "me.com",
  "mac.com",
  "libero.it",
  "virgilio.it",
  "tiscali.it",
  "alice.it",
  "tim.it",
  "fastwebnet.it",
  "email.it",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "gmx.net",
  "aol.com",
  "zoho.com",
  "yandex.com",
  "mail.com",
]);

const PREFISSO_OGGETTO = /^\s*(?:re|r|fwd|fw|i|inoltro|aw|wg|rif|tr|rv)\s*(?:\[\d+\]|\(\d+\))?\s*:\s*/i;

/** Toglie i prefissi di risposta e inoltro ripetuti (Re:, R:, Fwd:, I:, AW:, WG:, Rif:…), conservando il resto. */
export function togliPrefissiOggetto(oggetto: string): string {
  let resto = oggetto;
  for (let m = PREFISSO_OGGETTO.exec(resto); m; m = PREFISSO_OGGETTO.exec(resto)) resto = resto.slice(m[0].length);
  return resto.trim();
}

/** Forma di confronto dell'oggetto: senza prefissi, minuscola, spazi compressi. */
export function normalizzaOggetto(oggetto: string): string {
  return togliPrefissiOggetto(oggetto).normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function trigrammi(testo: string): Set<string> {
  const caratteri = Array.from(` ${testo} `);
  const risultato = new Set<string>();
  for (let i = 0; i + 3 <= caratteri.length; i++) risultato.add(caratteri.slice(i, i + 3).join(""));
  return risultato;
}

/** Indice di Jaccard sui trigrammi di carattere degli oggetti normalizzati. */
export function somiglianzaTrigrammi(a: string, b: string): number {
  const na = normalizzaOggetto(a);
  const nb = normalizzaOggetto(b);
  if (na === "" || nb === "") return 0;
  const ta = trigrammi(na);
  const tb = trigrammi(nb);
  let comuni = 0;
  for (const t of ta) if (tb.has(t)) comuni++;
  return comuni / (ta.size + tb.size - comuni);
}

export interface EmailDaCorrelare {
  mittente: string;
  destinatari: readonly string[];
  oggetto: string;
  references: readonly string[];
  inReplyTo: string | null;
  /** Blocchi citati o inoltrati dell'email. */
  testoCitato?: string;
}

export interface CandidatoCorrelazione {
  situazioneId: string;
  partecipanti: readonly string[];
  messageIds: readonly string[];
  oggetti: readonly string[];
  ultimaAttivita: Date;
}

/** Pesi indipendenti combinati come unione probabilistica: ogni segnale da solo basta. */
const PESI = {
  riferimenti: 0.9,
  partecipante: 0.6,
  citazione: 0.4,
  dominio: 0.3,
  oggetto: 0.3,
} as const;
const SOGLIA_OGGETTO = 0.5;
const LUNGHEZZA_MINIMA_OGGETTO_CITATO = 8;

const normalizzaMessageId = (id: string) => id.trim().replace(/^<(.*)>$/, "$1").trim();

function intersecano(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

export function punteggioCandidato(
  email: EmailDaCorrelare,
  candidato: CandidatoCorrelazione,
  contesto: { indirizziUtente: ReadonlySet<string> },
): number {
  const utente = new Set([...contesto.indirizziUtente].map(normalizzaIndirizzo));
  const dominiUtente = new Set([...utente].map(dominioDi));
  const esterni = (indirizzi: readonly string[]) =>
    new Set(indirizzi.map(normalizzaIndirizzo).filter((i) => i !== "" && !utente.has(i)));
  const organizzazioni = (indirizzi: ReadonlySet<string>) =>
    new Set(
      [...indirizzi]
        .map(dominioDi)
        .filter((d): d is string => d !== null && !DOMINI_POSTA_PUBBLICA.has(d) && !dominiUtente.has(d)),
    );

  const partecipantiEmail = esterni([email.mittente, ...email.destinatari]);
  const partecipantiCandidato = esterni(candidato.partecipanti);
  const idCandidato = new Set(candidato.messageIds.map(normalizzaMessageId));
  const riferimenti = [...email.references, ...(email.inReplyTo === null ? [] : [email.inReplyTo])]
    .map(normalizzaMessageId)
    .filter((id) => id !== "");
  const citato = (email.testoCitato ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
  const oggettiCandidato = candidato.oggetti.map(normalizzaOggetto);

  const segnali = [
    riferimenti.some((id) => idCandidato.has(id)) ? PESI.riferimenti : 0,
    intersecano(partecipantiEmail, partecipantiCandidato) ? PESI.partecipante : 0,
    intersecano(organizzazioni(partecipantiEmail), organizzazioni(partecipantiCandidato)) ? PESI.dominio : 0,
    candidato.oggetti.some((o) => somiglianzaTrigrammi(email.oggetto, o) >= SOGLIA_OGGETTO) ? PESI.oggetto : 0,
    citato !== "" &&
    ([...partecipantiCandidato].some((i) => citato.includes(i)) ||
      oggettiCandidato.some((o) => o.length >= LUNGHEZZA_MINIMA_OGGETTO_CITATO && citato.includes(o)))
      ? PESI.citazione
      : 0,
  ];
  return 1 - segnali.reduce((resto, peso) => resto * (1 - peso), 1);
}

export const ORIZZONTE_CANDIDATI_GIORNI = 60;
export const MASSIMO_CANDIDATI = 10;

export function selezionaCandidati(
  email: EmailDaCorrelare,
  candidati: readonly CandidatoCorrelazione[],
  opzioni: {
    ora: Date;
    orizzonteGiorni?: number;
    massimo?: number;
    esclusi?: ReadonlySet<string>;
    indirizziUtente: ReadonlySet<string>;
  },
): { situazioneId: string; punteggio: number }[] {
  const limite = opzioni.ora.getTime() - (opzioni.orizzonteGiorni ?? ORIZZONTE_CANDIDATI_GIORNI) * 86_400_000;
  const contesto = { indirizziUtente: opzioni.indirizziUtente };
  return candidati
    .filter((c) => !opzioni.esclusi?.has(c.situazioneId) && c.ultimaAttivita.getTime() >= limite)
    .map((c) => ({ situazioneId: c.situazioneId, punteggio: punteggioCandidato(email, c, contesto) }))
    .filter((c) => c.punteggio > 0)
    .sort((a, b) => b.punteggio - a.punteggio || (a.situazioneId < b.situazioneId ? -1 : a.situazioneId > b.situazioneId ? 1 : 0))
    .slice(0, opzioni.massimo ?? MASSIMO_CANDIDATI);
}
