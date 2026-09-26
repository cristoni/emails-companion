import "server-only";
import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { registraConsensoGoogle, SCOPE_INVIO, SCOPE_LETTURA } from "@ec/applicazione";
import { authAccount, authSessione, authUtente, authVerifica } from "@ec/db/schema";
import { composizione } from "./composizione";

/**
 * Accesso con Google (§6.1). I token non arrivano mai in auth_account: l'hook `create.before`
 * li cifra nelle credenziali della casella e restituisce i campi token nulli. Gli accessi
 * successivi non scrivono token (`updateAccountOnSignIn: false`); le nuove autorizzazioni passano
 * dal flusso OAuth proprio della webapp.
 */
function creaAuth(dip: Awaited<ReturnType<typeof composizione>>["dip"], connessione: Awaited<ReturnType<typeof composizione>>["connessione"]) {
  return betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(connessione.db, {
    provider: "pg",
    schema: { user: authUtente, session: authSessione, account: authAccount, verification: authVerifica },
    transaction: false,
  }),
  account: {
    encryptOAuthTokens: false,
    storeAccountCookie: false,
    updateAccountOnSignIn: false,
    accountLinking: { enabled: true },
  },
  session: { cookieCache: { enabled: false } },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      scope: [SCOPE_LETTURA, SCOPE_INVIO],
      accessType: "offline",
      prompt: "select_account",
    },
  },
  databaseHooks: {
    account: {
      create: {
        before: async (account) => {
          if (account.providerId !== "google") return;
          const tokenNulli = {
            accessToken: null,
            refreshToken: null,
            idToken: null,
            accessTokenExpiresAt: null,
            refreshTokenExpiresAt: null,
          };
          if (!account.accessToken) return { data: { ...account, ...tokenNulli } };
          const [utente] = await connessione.db.select({ email: authUtente.email }).from(authUtente).where(eq(authUtente.id, account.userId));
          if (!utente) throw new Error("utente_non_trovato");
          await registraConsensoGoogle(
            dip,
            dip.unita,
            account.userId,
            {
              sub: account.accountId,
              email: utente.email,
              scopeConcessi: (account.scope ?? "").split(/[\s,]+/).filter(Boolean),
              accessToken: account.accessToken,
              scadenzaAccesso: account.accessTokenExpiresAt ?? new Date(Date.now() + 50 * 60 * 1000),
              refreshToken: account.refreshToken ?? null,
              origine: "accesso",
            },
            async (casellaId) => (await dip.connettori.per(casellaId)).cursoreAttuale(),
          );
          return { data: { ...account, ...tokenNulli } };
        },
      },
    },
  },
  plugins: [nextCookies()],
  });
}

let istanza: Promise<ReturnType<typeof creaAuth>> | null = null;

/** Istanza pigra: costruita alla prima richiesta, così la build non richiede segreti né database. */
export function ottieniAuth() {
  istanza ??= composizione()
    .then(({ dip, connessione }) => creaAuth(dip, connessione))
    .catch((errore: unknown) => {
      istanza = null;
      throw errore;
    });
  return istanza;
}
