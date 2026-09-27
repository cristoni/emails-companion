import { NextResponse, type NextRequest } from "next/server";
import { creaUrlAutorizzazione, generaPkce } from "@ec/connettore-gmail";
import { caselle } from "@ec/db";
import { composizione } from "@/lib/server/composizione";
import { utenteCorrente } from "@/lib/server/sessione";
import { COOKIE_STATO_OAUTH, sigillaStato } from "@/lib/server/stato-oauth";

/**
 * Avvia Collega (nuova casella) o Ricollega/Autorizza (casella esistente, `?casella=<id>`).
 * Il consenso è sempre esplicito (`prompt=consent`), così Google restituisce un refresh token.
 */
export async function GET(richiesta: NextRequest) {
  const utente = await utenteCorrente();
  if (!utente) return NextResponse.redirect(new URL("/sign-in", richiesta.url));
  const casellaId = richiesta.nextUrl.searchParams.get("casella");
  if (casellaId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(casellaId)) {
    return NextResponse.redirect(new URL("/settings?esito=casella_non_trovata", richiesta.url));
  }
  const { dip } = await composizione();
  const esistente = casellaId ? await dip.unita.perUtente(utente.id, (ctx) => caselle.leggi(ctx, casellaId)) : null;
  if (casellaId && (!esistente || esistente.stato === "scollegata" || esistente.stato === "scollegamento_in_corso")) {
    return NextResponse.redirect(new URL("/settings?esito=casella_non_trovata", richiesta.url));
  }
  const { verifier, challenge } = await generaPkce();
  const state = crypto.randomUUID();
  const url = creaUrlAutorizzazione(
    { clientId: process.env.GOOGLE_CLIENT_ID ?? "", clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "", redirectUri: process.env.GOOGLE_REDIRECT_URI_CASELLE ?? "" },
    { state, codeChallenge: challenge, prompt: "consent select_account", ...(esistente ? { loginHint: esistente.indirizzo } : {}) },
  );
  const risposta = NextResponse.redirect(url);
  risposta.cookies.set(COOKIE_STATO_OAUTH, sigillaStato({ state, verifier, utenteId: utente.id, casellaAttesaId: esistente?.id ?? null, origine: esistente ? "ricollega" : "collega" }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/caselle/google",
    maxAge: 600,
  });
  return risposta;
}
