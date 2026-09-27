import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBBLICHE = ["/sign-in", "/privacy"];

/**
 * CSP con nonce e controllo ottimistico del cookie di sessione. Non autorizza nulla:
 * l'autorizzazione vera è in ogni pagina, Server Action e route (§13.3).
 */
export function proxy(richiesta: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const sviluppo = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${sviluppo ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' ${sviluppo ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
    "frame-ancestors 'none'",
    "frame-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");

  const percorso = richiesta.nextUrl.pathname;
  const pubblica = PUBBLICHE.some((p) => percorso === p || percorso.startsWith(`${p}/`));
  if (!pubblica && !getSessionCookie(richiesta)) {
    return NextResponse.redirect(new URL("/sign-in", richiesta.url));
  }

  const intestazioni = new Headers(richiesta.headers);
  intestazioni.set("x-nonce", nonce);
  intestazioni.set("Content-Security-Policy", csp);
  const risposta = NextResponse.next({ request: { headers: intestazioni } });
  risposta.headers.set("Content-Security-Policy", csp);
  return risposta;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|original).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
