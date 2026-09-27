import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { testUtils } from "better-auth/plugins";
import type { Connessione } from "@ec/db";
import { authAccount, authSessione, authUtente, authVerifica } from "@ec/db/schema";
import { configurazioneFinta } from "./guardia";
import { EMAIL_DEMO, FILE_SESSIONE, NOME_DEMO } from "./percorsi";

/**
 * Istanza di Better Auth riservata alla demo, con il plugin di test (consigliato dalla documentazione di
 * Better Auth come istanza separata). Il plugin non registra route HTTP e qui non esiste alcun server:
 * la webapp non lo carica mai. Deve coincidere con `apps/web/lib/server/auth.ts` in ciò che decide la
 * validità del cookie: stesso database e tabelle, stesso `secret`, stesso `baseURL` (da cui dipendono
 * nome, prefisso e attributo Secure del cookie).
 */
export function creaAuthDiProva(env: Record<string, string | undefined>, connessione: Connessione) {
  configurazioneFinta(env);
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(connessione.db, {
      provider: "pg",
      schema: { user: authUtente, session: authSessione, account: authAccount, verification: authVerifica },
      transaction: false,
    }),
    session: { cookieCache: { enabled: false } },
    plugins: [testUtils()],
  });
}

type AuthDiProva = ReturnType<typeof creaAuthDiProva>;

/** Utente demo sintetico: lo stesso a ogni avvio, creato con gli aiuti del plugin di test. */
export async function trovaOCreaUtenteDemo(auth: AuthDiProva): Promise<{ id: string; nuovo: boolean }> {
  const ctx = await auth.$context;
  const esistente = await ctx.internalAdapter.findUserByEmail(EMAIL_DEMO);
  if (esistente) return { id: esistente.user.id, nuovo: false };
  const utente = await ctx.test.saveUser(ctx.test.createUser({ email: EMAIL_DEMO, name: NOME_DEMO, emailVerified: true }));
  return { id: utente.id, nuovo: true };
}

/**
 * Crea una sessione nuova per l'utente demo (le precedenti sono eliminate) e la salva come storageState
 * di Playwright in `.demo/`. Nessuna route di accesso di prova: la sessione nasce qui, sul database.
 */
export async function scriviSessioneDemo(auth: AuthDiProva, utenteId: string): Promise<{ scadenza: Date; nomeCookie: string }> {
  const ctx = await auth.$context;
  await ctx.internalAdapter.deleteUserSessions(utenteId);
  const { cookies, session } = await ctx.test.login({ userId: utenteId });
  const storageState = {
    cookies: cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires ?? -1,
      httpOnly: c.httpOnly ?? true,
      secure: c.secure ?? false,
      sameSite: c.sameSite ?? "Lax",
    })),
    origins: [],
  };
  mkdirSync(dirname(FILE_SESSIONE), { recursive: true });
  writeFileSync(FILE_SESSIONE, `${JSON.stringify(storageState, null, 2)}\n`, { mode: 0o600 });
  return { scadenza: session.expiresAt, nomeCookie: cookies[0]?.name ?? "" };
}
