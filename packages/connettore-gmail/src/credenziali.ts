import { OAuth2Client } from "google-auth-library";
import { ErroreConnettore } from "@ec/core";
import { erroreToken } from "./oauth";

/** Un token salvato si riusa solo se scade tra più di questo margine. */
const MARGINE_MS = 2 * 60_000;

export interface CredenzialiSalvate {
  refreshToken: string | null;
  accessToken: string | null;
  scadenzaAccesso: Date | null;
  /** Aumenta solo quando si salva un nuovo refresh token (nuovo consenso). */
  generazione: number;
}

export interface DepositoCredenziali {
  leggi(casellaId: string): Promise<CredenzialiSalvate | null>;
  /** Scrive solo se la generazione è invariata e la nuova scadenza è successiva a quella salvata. */
  salvaAccessoSeValido(casellaId: string, generazione: number, accessToken: string, scadenza: Date): Promise<boolean>;
  /** Porta la casella a `da_ricollegare` solo se la generazione è ancora quella usata. */
  segnaDaRicollegare(casellaId: string, generazione: number): Promise<void>;
}

export type RinnovaAccesso = (refreshToken: string) => Promise<{ accessToken: string; scadenza: Date }>;

async function accessoValido(
  casellaId: string,
  deposito: DepositoCredenziali,
  rinnova: RinnovaAccesso,
  ora: () => Date,
): Promise<{ accessToken: string; scadenza: Date }> {
  const salvate = await deposito.leggi(casellaId);
  if (salvate?.accessToken && salvate.scadenzaAccesso && salvate.scadenzaAccesso.getTime() - ora().getTime() > MARGINE_MS) {
    return { accessToken: salvate.accessToken, scadenza: salvate.scadenzaAccesso };
  }
  if (!salvate?.refreshToken) throw new ErroreConnettore("autorizzazione_revocata");
  const nuovo = await rinnova(salvate.refreshToken).catch(async (e: unknown) => {
    const errore = erroreToken(e);
    if (errore.codice === "autorizzazione_revocata") await deposito.segnaDaRicollegare(casellaId, salvate.generazione);
    throw errore;
  });
  await deposito.salvaAccessoSeValido(casellaId, salvate.generazione, nuovo.accessToken, nuovo.scadenza);
  return nuovo;
}

/** Token di accesso valido per la casella, condiviso tra webapp e worker (architettura §6.3). */
export async function accessTokenValido(
  casellaId: string,
  deposito: DepositoCredenziali,
  rinnova: RinnovaAccesso,
  ora: () => Date = () => new Date(),
): Promise<string> {
  return (await accessoValido(casellaId, deposito, rinnova, ora)).accessToken;
}

/**
 * OAuth2Client che ottiene il token solo da accessTokenValido, tramite `refreshHandler`.
 * La scadenza viene passata al client: senza, il client riproverebbe le richieste fallite con 401,
 * invio compreso. Il client non raggruppa le chiamate concorrenti a `refreshHandler`: lo fa questa funzione,
 * così le richieste parallele di una casella producono un solo rinnovo.
 */
export function creaAuthPerCasella(p: {
  casellaId: string;
  deposito: DepositoCredenziali;
  rinnova: RinnovaAccesso;
  ora?: () => Date;
  fetchImplementation?: typeof fetch;
}): OAuth2Client {
  const auth = new OAuth2Client({
    eagerRefreshThresholdMillis: MARGINE_MS,
    forceRefreshOnFailure: false,
    ...(p.fetchImplementation ? { transporterOptions: { fetchImplementation: p.fetchImplementation } } : {}),
  });
  let inCorso: Promise<{ access_token: string; expiry_date: number }> | null = null;
  auth.refreshHandler = () =>
    (inCorso ??= accessoValido(p.casellaId, p.deposito, p.rinnova, p.ora ?? (() => new Date()))
      .then(({ accessToken, scadenza }) => ({ access_token: accessToken, expiry_date: scadenza.getTime() }))
      .finally(() => {
        inCorso = null;
      }));
  return auth;
}
