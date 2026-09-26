import MailComposer, { type MailComposerOptions } from "nodemailer/lib/mail-composer";
import { GaxiosError, type GaxiosOptionsPrepared } from "gaxios";
import type { ClientGmail } from "../src/client";

/** Client finto: ogni metodo non fornito fallisce, così i test dichiarano le chiamate attese. */
export function clientFinto(metodi: Partial<ClientGmail>): ClientGmail {
  return new Proxy(metodi as ClientGmail, {
    get(bersaglio, nome: string) {
      return (
        (bersaglio as unknown as Record<string, unknown>)[nome] ??
        (() => Promise.reject(new Error(`chiamata non prevista: ${nome}`)))
      );
    },
  });
}

export const nonTrovato = () => ({ response: { status: 404, data: {}, headers: new Headers() } });
export const indisponibile = () => ({ response: { status: 503, data: {}, headers: new Headers() } });

export function erroreSenzaRisposta(causa: unknown = new DOMException("scaduto", "TimeoutError")) {
  const config = { url: new URL("https://gmail.googleapis.com/x"), headers: new Headers() } as GaxiosOptionsPrepared;
  return new GaxiosError("richiesta interrotta", config, undefined, causa);
}

export async function rfc822(opzioni: MailComposerOptions): Promise<string> {
  const nodo = new MailComposer({ date: new Date("2026-09-20T08:30:00Z"), ...opzioni }).compile();
  return (await nodo.build()).toString("base64url");
}

export const nessunaAttesa = async () => {};
