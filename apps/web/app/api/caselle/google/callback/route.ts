import { NextResponse, type NextRequest } from "next/server";
import { registraConsensoGoogle } from "@ec/applicazione";
import { scambiaCodice } from "@ec/connettore-gmail";
import { composizione } from "@/lib/server/composizione";
import { utenteCorrente } from "@/lib/server/sessione";
import { apriStato, COOKIE_STATO_OAUTH } from "@/lib/server/stato-oauth";

function verso(richiesta: NextRequest, esito: string) {
  const risposta = NextResponse.redirect(new URL(`/settings?esito=${esito}`, richiesta.url));
  risposta.cookies.delete({ name: COOKIE_STATO_OAUTH, path: "/api/caselle/google" });
  return risposta;
}

/** Callback del flusso proprio: verifica `state`, utente e account, poi registra il consenso. */
export async function GET(richiesta: NextRequest) {
  const utente = await utenteCorrente();
  const stato = apriStato(richiesta.cookies.get(COOKIE_STATO_OAUTH)?.value);
  const parametri = richiesta.nextUrl.searchParams;
  if (!utente || !stato || stato.utenteId !== utente.id || parametri.get("state") !== stato.state) return verso(richiesta, "richiesta_non_valida");
  if (parametri.get("error")) return verso(richiesta, "consenso_negato");
  const codice = parametri.get("code");
  if (!codice) return verso(richiesta, "richiesta_non_valida");

  const { dip } = await composizione();
  try {
    const consenso = await scambiaCodice(
      { clientId: process.env.GOOGLE_CLIENT_ID ?? "", clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "", redirectUri: process.env.GOOGLE_REDIRECT_URI_CASELLE ?? "" },
      { code: codice, codeVerifier: stato.verifier },
    );
    const esito = await registraConsensoGoogle(
      dip,
      dip.unita,
      utente.id,
      { ...consenso, origine: stato.origine, ...(stato.casellaAttesaId ? { casellaAttesaId: stato.casellaAttesaId } : {}) },
      async (casellaId) => (await dip.connettori.per(casellaId)).cursoreAttuale(),
    );
    if (esito.tipo !== "collegata") return verso(richiesta, esito.tipo);
    return verso(richiesta, esito.stato === "collegata" ? "casella_collegata" : esito.stato);
  } catch {
    return verso(richiesta, "errore_google");
  }
}
