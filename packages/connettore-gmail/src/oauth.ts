import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import { GaxiosError } from "gaxios";
import { ErroreConnettore } from "@ec/core";
import { erroreConnettore } from "./errori";

export const SCOPE_ACCESSO = ["openid", "email", "profile"] as const;
export const SCOPE_GMAIL_LETTURA = "https://www.googleapis.com/auth/gmail.readonly";
export const SCOPE_GMAIL_INVIO = "https://www.googleapis.com/auth/gmail.send";

export interface ConfigurazioneOAuth {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Sostituisce il fetch di rete (test a livello HTTP). */
  fetchImplementation?: typeof fetch;
}

export interface ConsensoGoogle {
  sub: string;
  email: string;
  accessToken: string;
  scadenzaAccesso: Date;
  refreshToken: string | null;
  scopeConcessi: string[];
}

export type EsitoScope = "completi" | "manca_lettura" | "manca_invio";

function client(cfg: Partial<ConfigurazioneOAuth>): OAuth2Client {
  return new OAuth2Client({
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    redirectUri: cfg.redirectUri,
    ...(cfg.fetchImplementation ? { transporterOptions: { fetchImplementation: cfg.fetchImplementation } } : {}),
  });
}

const scope = (valore: string | null | undefined) => valore?.split(/\s+/).filter(Boolean);

function scadenza(expiryDate: number | null | undefined): Date {
  if (!expiryDate) throw new ErroreConnettore("temporaneo");
  return new Date(expiryDate);
}

const codiceOAuth = (errore: unknown): unknown =>
  (errore as { response?: { data?: { error?: unknown } | null } } | null | undefined)?.response?.data?.error;

/**
 * Errori dell'endpoint dei token: solo `invalid_grant` significa consenso revocato.
 * Un 401 qui è `invalid_client`, cioè configurazione dell'app, non un problema della casella.
 */
export function erroreToken(errore: unknown): ErroreConnettore {
  if (errore instanceof ErroreConnettore) return errore;
  if (codiceOAuth(errore) === "invalid_grant" || (errore instanceof Error && errore.message === "invalid_grant")) {
    return new ErroreConnettore("autorizzazione_revocata");
  }
  const mappato = erroreConnettore(errore);
  return mappato.codice === "autorizzazione_revocata" ? new ErroreConnettore("temporaneo") : mappato;
}

export function creaUrlAutorizzazione(
  cfg: ConfigurazioneOAuth,
  p: { state: string; codeChallenge: string; loginHint?: string; prompt: "consent" | "consent select_account" },
): string {
  return client(cfg).generateAuthUrl({
    access_type: "offline",
    include_granted_scopes: true,
    scope: [...SCOPE_ACCESSO, SCOPE_GMAIL_LETTURA, SCOPE_GMAIL_INVIO],
    state: p.state,
    code_challenge: p.codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
    prompt: p.prompt,
    ...(p.loginHint ? { login_hint: p.loginHint } : {}),
  });
}

export async function generaPkce(): Promise<{ verifier: string; challenge: string }> {
  const { codeVerifier, codeChallenge } = await new OAuth2Client().generateCodeVerifierAsync();
  if (!codeChallenge) throw new ErroreConnettore("temporaneo");
  return { verifier: codeVerifier, challenge: codeChallenge };
}

export async function scambiaCodice(
  cfg: ConfigurazioneOAuth,
  p: { code: string; codeVerifier: string },
): Promise<ConsensoGoogle> {
  const oauth = client(cfg);
  const { tokens } = await oauth.getToken({ code: p.code, codeVerifier: p.codeVerifier }).catch((e: unknown) => {
    throw erroreToken(e);
  });
  if (!tokens.id_token || !tokens.access_token) throw new ErroreConnettore("autorizzazione_revocata");
  const idToken = tokens.id_token;
  const ticket = await oauth.verifyIdToken({ idToken, audience: cfg.clientId }).catch((e: unknown) => {
    // Gli errori di verifica riportano il token nel messaggio: non vanno mai propagati.
    throw e instanceof GaxiosError ? erroreConnettore(e) : new ErroreConnettore("autorizzazione_revocata");
  });
  const identita = ticket.getPayload();
  if (!identita?.sub || !identita.email) throw new ErroreConnettore("autorizzazione_revocata");
  return {
    sub: identita.sub,
    email: identita.email.toLowerCase(),
    accessToken: tokens.access_token,
    scadenzaAccesso: scadenza(tokens.expiry_date),
    refreshToken: tokens.refresh_token ?? null,
    scopeConcessi: scope(tokens.scope) ?? [],
  };
}

export function valutaScope(concessi: string[]): EsitoScope {
  if (!concessi.includes(SCOPE_GMAIL_LETTURA)) return "manca_lettura";
  if (!concessi.includes(SCOPE_GMAIL_INVIO)) return "manca_invio";
  return "completi";
}

export async function rinnovaAccesso(
  cfg: ConfigurazioneOAuth,
  refreshToken: string,
): Promise<{ accessToken: string; scadenza: Date; scopeConcessi: string[] | null }> {
  const oauth = client(cfg);
  oauth.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth.refreshAccessToken().catch((e: unknown) => {
    throw erroreToken(e);
  });
  if (!credentials.access_token) throw new ErroreConnettore("temporaneo");
  return {
    accessToken: credentials.access_token,
    scadenza: scadenza(credentials.expiry_date),
    scopeConcessi: scope(credentials.scope) ?? null,
  };
}

/** Revoca il consenso; un token già non valido conta come revocato. */
export async function revocaToken(token: string, opzioni: { fetchImplementation?: typeof fetch } = {}): Promise<void> {
  await client(opzioni)
    .revokeToken(token)
    .catch((e: unknown) => {
      if (codiceOAuth(e) !== "invalid_token") throw erroreConnettore(e);
    });
}
