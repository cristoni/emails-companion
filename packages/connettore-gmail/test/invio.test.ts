import { describe, expect, it, vi } from "vitest";
import PostalMime from "postal-mime";
import { ErroreConnettore, type MessaggioInUscita } from "@ec/core";
import { ConnettoreGmail } from "../src/connettore";
import type { ClientGmail, MessaggioMetadati } from "../src/client";
import { clientFinto, erroreSenzaRisposta, indisponibile, nessunaAttesa } from "./supporto";

const messaggio: MessaggioInUscita = {
  messageId: "invio-42@app.esempio.it",
  da: { nome: "Io Stesso", indirizzo: "io@esempio.it" },
  a: [{ nome: "Marco Rossi", indirizzo: "marco@fornitore.example" }],
  cc: [{ indirizzo: "anna@esempio.it" }],
  bcc: [{ indirizzo: "archivio@esempio.it" }],
  oggetto: "Re: Report di settembre — è pronto?",
  corpo: "Ciao Marco,\nti ricordo il report.\n",
  inReplyTo: "richiesta-1@fornitore.example",
  references: ["radice@esempio.it", "richiesta-1@fornitore.example"],
  threadConnettore: "t-77",
};

function metadati(messageIdHeader: string): MessaggioMetadati {
  return { id: "inviato-1", threadId: "t-77", labelIds: ["SENT"], headers: [{ name: "Message-ID", value: messageIdHeader }] };
}

function connettore(metodi: Partial<ClientGmail>) {
  return new ConnettoreGmail({ client: clientFinto(metodi), indirizzo: "io@esempio.it", attesa: nessunaAttesa });
}

describe("ConnettoreGmail.invia", () => {
  it("compone il messaggio con Message-ID proprio, riferimenti e Bcc, e lo invia nel thread", async () => {
    const messagesSend = vi.fn(async (_raw: string, threadId: string | null) => ({ id: "inviato-1", threadId }));
    const messagesGetMetadata = vi.fn(async () => metadati("<invio-42@app.esempio.it>"));

    const esito = await connettore({ messagesSend, messagesGetMetadata }).invia(messaggio);

    expect(esito).toEqual({ idConnettore: "inviato-1", threadConnettore: "t-77", messageId: "invio-42@app.esempio.it" });
    expect(messagesSend).toHaveBeenCalledOnce();
    expect(messagesGetMetadata).toHaveBeenCalledWith("inviato-1", ["Message-ID"]);

    const [raw, threadId] = messagesSend.mock.calls[0]!;
    expect(threadId).toBe("t-77");
    const mime = Buffer.from(raw, "base64url").toString("utf8");
    expect(mime).toMatch(/^Message-ID: <invio-42@app\.esempio\.it>\r$/m);
    expect(mime).toMatch(/^In-Reply-To: <richiesta-1@fornitore\.example>\r$/m);
    expect(mime).toMatch(/^References: <radice@esempio\.it> <richiesta-1@fornitore\.example>\r$/m);
    expect(mime).toMatch(/^Bcc: archivio@esempio\.it\r$/m);

    const email = await PostalMime.parse(Buffer.from(raw, "base64url"));
    expect(email.from).toEqual({ name: "Io Stesso", address: "io@esempio.it" });
    expect(email.to).toEqual([{ name: "Marco Rossi", address: "marco@fornitore.example" }]);
    expect(email.cc).toEqual([{ name: "", address: "anna@esempio.it" }]);
    expect(email.bcc).toEqual([{ name: "", address: "archivio@esempio.it" }]);
    expect(email.subject).toBe(messaggio.oggetto);
    expect(email.text?.trim()).toBe("Ciao Marco,\nti ricordo il report.");
  });

  it("senza thread invia un messaggio nuovo e restituisce il Message-ID effettivo", async () => {
    const messagesSend = vi.fn(async (_raw: string, _threadId: string | null) => ({ id: "inviato-1", threadId: "t-nuovo" }));
    const nuovo = { ...messaggio, threadConnettore: null, inReplyTo: null, references: [] };

    const esito = await connettore({ messagesSend, messagesGetMetadata: async () => metadati("<riscritto@google>") }).invia(nuovo);

    expect(messagesSend.mock.calls[0]?.[1]).toBeNull();
    const mime = Buffer.from(messagesSend.mock.calls[0]![0], "base64url").toString("utf8");
    expect(mime).not.toMatch(/^(In-Reply-To|References):/im);
    expect(esito).toEqual({ idConnettore: "inviato-1", threadConnettore: "t-nuovo", messageId: "riscritto@google" });
  });

  it("a capo in oggetto e nomi non creano intestazioni", async () => {
    const messagesSend = vi.fn(async (_raw: string, _threadId: string | null) => ({ id: "inviato-1", threadId: "t-77" }));
    const iniettato = {
      ...messaggio,
      da: { nome: "Io\r\nX-Iniettata: 1", indirizzo: "io@esempio.it" },
      a: [{ nome: "Marco\r\nBcc: spia@altro.example", indirizzo: "marco@fornitore.example" }],
      bcc: [],
      oggetto: "Ciao\r\nBcc: spia@altro.example\r\n\r\ncorpo iniettato",
    };

    await connettore({ messagesSend, messagesGetMetadata: async () => metadati("<x@y>") }).invia(iniettato);

    const mime = Buffer.from(messagesSend.mock.calls[0]![0], "base64url").toString("utf8");
    const [intestazioni = "", corpo] = mime.split("\r\n\r\n");
    expect(intestazioni).not.toMatch(/^(Bcc|X-Iniettata):/im);
    expect(corpo?.trim()).toBe(messaggio.corpo.trim().replace(/\n/g, "\r\n"));
    const email = await PostalMime.parse(Buffer.from(messagesSend.mock.calls[0]![0], "base64url"));
    expect(email.bcc).toBeUndefined();
  });

  it("se la rilettura del Message-ID fallisce, l'invio resta riuscito", async () => {
    const esito = await connettore({
      messagesSend: async () => ({ id: "inviato-1", threadId: "t-77" }),
      messagesGetMetadata: async () => Promise.reject(indisponibile()),
    }).invia(messaggio);
    expect(esito).toEqual({ idConnettore: "inviato-1", threadConnettore: "t-77", messageId: null });
  });

  it.each([
    ["timeout", erroreSenzaRisposta()],
    ["interruzione", erroreSenzaRisposta(new DOMException("interrotto", "AbortError"))],
    ["connessione interrotta", erroreSenzaRisposta(Object.assign(new Error("x"), { code: "ECONNRESET" }))],
    ["errore del server", indisponibile()],
  ])("%s durante l'invio → timeout_invio, senza ritentare", async (_, errore) => {
    const messagesSend = vi.fn(async () => Promise.reject(errore));
    await expect(connettore({ messagesSend }).invia(messaggio)).rejects.toMatchObject({ codice: "timeout_invio" });
    expect(messagesSend).toHaveBeenCalledOnce();
  });

  it.each([
    ["limite_frequenza", { response: { status: 429, data: {}, headers: new Headers() } }],
    [
      "permessi_insufficienti",
      { response: { status: 403, data: { error: { errors: [{ reason: "insufficientPermissions" }] } }, headers: new Headers() } },
    ],
    ["autorizzazione_revocata", new ErroreConnettore("autorizzazione_revocata")],
    ["temporaneo", new Error("il deposito delle credenziali non risponde")],
  ])("un rifiuto certo (%s) non viene ritentato", async (codice, errore) => {
    const messagesSend = vi.fn(async () => Promise.reject(errore));
    await expect(connettore({ messagesSend }).invia(messaggio)).rejects.toMatchObject({ codice });
    expect(messagesSend).toHaveBeenCalledOnce();
  });
});

describe("ConnettoreGmail.cercaInviati", () => {
  it("cerca tra le inviate per Message-ID dopo un istante", async () => {
    const messagesList = vi
      .fn()
      .mockResolvedValueOnce({ ids: ["x"], nextPageToken: "p" })
      .mockResolvedValueOnce({ ids: ["y"], nextPageToken: null });
    const dopo = new Date("2026-09-27T10:00:00Z");

    const trovati = await connettore({ messagesList }).cercaInviati({ messageId: "<invio-42@app.esempio.it>", dopo });

    expect(trovati).toEqual(["x", "y"]);
    const q = `in:sent rfc822msgid:invio-42@app.esempio.it after:${dopo.getTime() / 1000}`;
    expect(messagesList.mock.calls.map(([p]) => p)).toEqual([
      { q, maxResults: 500 },
      { q, maxResults: 500, pageToken: "p" },
    ]);
  });

  it("non cerca un Message-ID che altererebbe la ricerca", async () => {
    const messagesList = vi.fn();
    const dopo = new Date("2026-09-27T10:00:00Z");
    for (const messageId of ['<x" OR in:anywhere@y>', "<>", "<a(b)@c>"]) {
      expect(await connettore({ messagesList }).cercaInviati({ messageId, dopo })).toEqual([]);
    }
    expect(messagesList).not.toHaveBeenCalled();
  });
});
