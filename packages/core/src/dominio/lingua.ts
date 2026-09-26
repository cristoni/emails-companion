import { togliPrefissiOggetto } from "./correlazione";
import type { FonteLingua } from "./entita";

export const MASSIMO_TESTO_RILEVAMENTO = 2000;

const INTESTAZIONI_RISPOSTA = [
  /^On .+ wrote:$/,
  /^Il giorno .+ ha scritto:$/,
  /^Le .+ a écrit\s*:$/,
  /^Am .+ schrieb .+:$/,
  /^El .+ escribió:$/,
];
const INOLTRO = /^-*\s*(?:forwarded message|messaggio inoltrato|original message|messaggio originale)\s*-*$/i;
const INOLTRO_APPLE = /^(?:begin forwarded message|inizio messaggio inoltrato):$/i;
const FIRMA = /^--$/;
const OUTLOOK_DA = /^(?:From|Da|De|Von):\s/;
const OUTLOOK_INVIATO = /^(?:Sent|Inviato|Date|Data|Envoyé|Gesendet|Enviado):\s/;

const intestazioneRisposta = (riga: string) => INTESTAZIONI_RISPOSTA.some((r) => r.test(riga));

function iniziaCitazione(righe: readonly string[], i: number): boolean {
  const riga = righe[i] ?? "";
  const successiva = righe[i + 1] ?? "";
  return (
    intestazioneRisposta(riga) ||
    (!intestazioneRisposta(successiva) && intestazioneRisposta(`${riga} ${successiva}`)) ||
    INOLTRO.test(riga) ||
    INOLTRO_APPLE.test(riga) ||
    FIRMA.test(riga) ||
    (OUTLOOK_DA.test(riga) && righe.slice(i + 1, i + 3).some((r) => OUTLOOK_INVIATO.test(r)))
  );
}

function tronca(testo: string, massimo: number): string {
  if (testo.length <= massimo) return testo;
  const fine = /[\uD800-\uDBFF]/.test(testo.charAt(massimo - 1)) ? massimo - 1 : massimo;
  return testo.slice(0, fine).trimEnd();
}

/** Oggetto e testo proprio dell'email, senza citazioni, inoltri e firma, per il rilevatore di lingua. */
export function testoPerRilevamento(oggetto: string, testo: string, massimo = MASSIMO_TESTO_RILEVAMENTO): string {
  const righe = testo.split(/\r?\n/).map((r) => r.trimEnd());
  const proprie: string[] = [];
  for (let i = 0; i < righe.length && !iniziaCitazione(righe, i); i++) {
    const riga = righe[i] ?? "";
    if (!riga.trimStart().startsWith(">")) proprie.push(riga.trim());
  }
  return tronca(`${togliPrefissiOggetto(oggetto)}\n${proprie.join("\n").trim()}`.trim(), massimo);
}

const valore = (s: string | null | undefined) => (s === null || s === undefined || s.trim() === "" ? null : s.trim());

export function scegliLingua(input: {
  correzione: string | null;
  /** Strutturalmente `RilevamentoLingua` della porta RilevatoreLingua. */
  rilevamento: { lingua: string | null; affidabile: boolean } | null;
  linguaThread: string | null;
  linguaRisposta: string | null;
  linguaInterfaccia: string;
}): { lingua: string; fonte: FonteLingua } {
  const correzione = valore(input.correzione);
  if (correzione) return { lingua: correzione, fonte: "utente" };
  const rilevata = input.rilevamento?.affidabile ? valore(input.rilevamento.lingua) : null;
  if (rilevata) return { lingua: rilevata, fonte: "rilevata" };
  const thread = valore(input.linguaThread);
  if (thread) return { lingua: thread, fonte: "thread" };
  const risposta = valore(input.linguaRisposta);
  if (risposta) return { lingua: risposta, fonte: "risposta" };
  return { lingua: input.linguaInterfaccia, fonte: "interfaccia" };
}

/** Lingua delle fonti se è unica, altrimenti quella dell'interfaccia. */
export function linguaVoceRiepilogo(lingueFonti: readonly string[], linguaInterfaccia: string): string {
  const lingue = new Set(lingueFonti.map(valore).filter((l) => l !== null));
  const [unica] = lingue;
  return lingue.size === 1 && unica !== undefined ? unica : linguaInterfaccia;
}
