import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export interface StatoOAuth {
  state: string;
  verifier: string;
  utenteId: string;
  casellaAttesaId: string | null;
  origine: "collega" | "ricollega";
  scadenza: number;
}

export const COOKIE_STATO_OAUTH = "ec_oauth_casella";
const DURATA_MS = 10 * 60 * 1000;

function chiave(): Buffer {
  const segreto = process.env.BETTER_AUTH_SECRET;
  if (!segreto) throw new Error("configurazione_mancante:BETTER_AUTH_SECRET");
  return createHash("sha256").update(`ec-oauth-casella:${segreto}`).digest();
}

/** Cookie cifrato e autenticato: `state` e verificatore PKCE legati all'utente della sessione. */
export function sigillaStato(dati: Omit<StatoOAuth, "scadenza">, ora = Date.now()): string {
  const iv = randomBytes(12);
  const cifrario = createCipheriv("aes-256-gcm", chiave(), iv);
  const testo = Buffer.concat([cifrario.update(JSON.stringify({ ...dati, scadenza: ora + DURATA_MS }), "utf8"), cifrario.final()]);
  return Buffer.concat([iv, testo, cifrario.getAuthTag()]).toString("base64url");
}

export function apriStato(valore: string | undefined, ora = Date.now()): StatoOAuth | null {
  if (!valore) return null;
  try {
    const dati = Buffer.from(valore, "base64url");
    const decifrario = createDecipheriv("aes-256-gcm", chiave(), dati.subarray(0, 12));
    decifrario.setAuthTag(dati.subarray(dati.length - 16));
    const testo = Buffer.concat([decifrario.update(dati.subarray(12, dati.length - 16)), decifrario.final()]).toString("utf8");
    const stato = JSON.parse(testo) as StatoOAuth;
    return stato.scadenza > ora ? stato : null;
  } catch {
    return null;
  }
}
