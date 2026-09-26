import { describe, expect, it, vi } from "vitest";
import { ConnettoreGmail } from "../src/connettore";
import type { MessaggioRaw } from "../src/client";
import { clientFinto, indisponibile, nessunaAttesa, nonTrovato, rfc822 } from "./supporto";

const RICEVUTA_MS = Date.UTC(2026, 8, 20, 8, 31, 5);

async function messaggio(raw: Promise<string>, labelIds = ["INBOX", "UNREAD"]): Promise<MessaggioRaw> {
  return { id: "m1", threadId: "t1", labelIds, internalDate: String(RICEVUTA_MS), raw: await raw };
}

function connettoreCon(m: MessaggioRaw) {
  const messagesGetRaw = vi.fn(async (_id: string) => m);
  return { connettore: new ConnettoreGmail({ client: clientFinto({ messagesGetRaw }), indirizzo: "io@esempio.it" }), messagesGetRaw };
}

describe("ConnettoreGmail.leggi", () => {
  it("normalizza un messaggio multipart/alternative", async () => {
    const { connettore, messagesGetRaw } = connettoreCon(
      await messaggio(
        rfc822({
          from: { name: "Marco Rossi", address: "Marco.Rossi@Fornitore.example" },
          to: [{ name: "Io", address: "IO@esempio.it" }, "altro@esempio.it"],
          cc: "Anna <anna@esempio.it>",
          replyTo: "ufficio@fornitore.example",
          subject: "Report mensile",
          messageId: "<abc.123@fornitore.example>",
          inReplyTo: "<prima@esempio.it>",
          references: ["<radice@esempio.it>", "<prima@esempio.it>"],
          text: "Ciao,\nmi mandi il report entro venerdì?\n",
          html: "<p>Ciao,</p><p>mi mandi il <b>report</b> entro venerdì?</p>",
        }),
      ),
    );

    const copia = await connettore.leggi("m1");

    expect(messagesGetRaw).toHaveBeenCalledWith("m1");
    expect(copia).toMatchObject({
      idConnettore: "m1",
      threadConnettore: "t1",
      cartelle: ["in_arrivo"],
      etichette: ["INBOX", "UNREAD"],
      ricevutaIl: new Date(RICEVUTA_MS),
      messageId: "abc.123@fornitore.example",
      inReplyTo: "prima@esempio.it",
      references: ["radice@esempio.it", "prima@esempio.it"],
      dataIntestazione: new Date("2026-09-20T08:30:00Z"),
      mittente: { nome: "Marco Rossi", indirizzo: "marco.rossi@fornitore.example" },
      a: [{ nome: "Io", indirizzo: "io@esempio.it" }, { indirizzo: "altro@esempio.it" }],
      cc: [{ nome: "Anna", indirizzo: "anna@esempio.it" }],
      replyTo: [{ indirizzo: "ufficio@fornitore.example" }],
      oggetto: "Report mensile",
      nomiAllegati: [],
    });
    expect(copia?.testo).toBe("Ciao,\nmi mandi il report entro venerdì?");
    expect(copia?.a[1]).not.toHaveProperty("nome");
  });

  it("ricava il testo dall'HTML quando manca la parte testuale, senza il preheader nascosto", async () => {
    const { connettore } = connettoreCon(
      await messaggio(
        rfc822({
          from: "newsletter@notizie.example",
          to: "io@esempio.it",
          subject: "Novità della settimana",
          html:
            '<div style="display:none;max-height:0">Anteprima nascosta da non analizzare</div>' +
            "<h1>Le notizie</h1><p>Il nuovo listino è online.</p>",
        }),
      ),
    );

    const copia = await connettore.leggi("m1");

    expect(copia?.testo).toContain("Il nuovo listino è online.");
    expect(copia?.testo).not.toContain("Anteprima nascosta");
  });

  it("decodifica un oggetto italiano codificato RFC 2047", async () => {
    const oggetto = "Riunione di venerdì: è confermata? Perché sì — ok";
    const raw = await rfc822({ from: "a@esempio.it", to: "io@esempio.it", subject: oggetto, text: "x" });
    expect(Buffer.from(raw, "base64url").toString("latin1")).toMatch(/Subject: =\?UTF-8\?/);
    const { connettore } = connettoreCon(await messaggio(Promise.resolve(raw)));

    expect((await connettore.leggi("m1"))?.oggetto).toBe(oggetto);
  });

  it("elenca i nomi degli allegati, escluse le immagini incorporate nell'HTML", async () => {
    const { connettore } = connettoreCon(
      await messaggio(
        rfc822({
          from: "a@esempio.it",
          to: "io@esempio.it",
          subject: "Documenti",
          text: "In allegato.",
          html: '<p>In allegato.</p><img src="cid:logo@esempio.it">',
          attachments: [
            { filename: "preventivo 2026.pdf", content: "%PDF-finto" },
            { filename: "città.csv", content: "a;b" },
            { filename: "logo.png", content: Buffer.from([0x89, 0x50]), cid: "logo@esempio.it" },
          ],
        }),
      ),
    );

    expect((await connettore.leggi("m1"))?.nomiAllegati).toEqual(["preventivo 2026.pdf", "città.csv"]);
  });

  it("classifica le copie senza cartelle di sistema come archiviate", async () => {
    const { connettore } = connettoreCon(
      await messaggio(rfc822({ from: "a@esempio.it", to: "io@esempio.it", subject: "x", text: "x" }), ["Label_3"]),
    );
    expect(await connettore.leggi("m1")).toMatchObject({ cartelle: ["archiviata"], etichette: ["Label_3"] });
  });

  it("tollera intestazioni mancanti o non valide", async () => {
    const raw = Buffer.from("From: a@esempio.it\r\nDate: non una data\r\n\r\nsolo testo\r\n").toString("base64url");
    const { connettore } = connettoreCon(await messaggio(Promise.resolve(raw)));

    expect(await connettore.leggi("m1")).toMatchObject({
      messageId: null,
      inReplyTo: null,
      references: [],
      dataIntestazione: null,
      a: [],
      cc: [],
      replyTo: [],
      oggetto: "",
      testo: "solo testo",
    });
  });

  it("restituisce null se il messaggio non esiste più", async () => {
    const connettore = new ConnettoreGmail({
      client: clientFinto({ messagesGetRaw: async () => Promise.reject(nonTrovato()) }),
      indirizzo: "io@esempio.it",
    });
    expect(await connettore.leggi("m1")).toBeNull();
  });

  describe("messaggi che il parser rifiuta", () => {
    const intestazioniPrincipali = [
      "From: Mario Bianchi <Mario@Esempio.it>",
      "To: io@esempio.it",
      "Subject: =?UTF-8?Q?Perch=C3=A9_non_si_legge?=",
      "Message-ID: <illeggibile@esempio.it>",
      "In-Reply-To: <prima@esempio.it>",
      "Date: Sun, 20 Sep 2026 08:30:00 +0000",
      "MIME-Version: 1.0",
    ];
    const grezzo = (righe: string[]) => Buffer.from(righe.join("\r\n")).toString("base64url");
    const riempitivo = `X-Riempitivo: ${"a".repeat(2.1 * 1024 * 1024)}`;

    function annidato(livelli: number): string {
      const corpo: string[] = [];
      for (let i = 1; i <= livelli; i++) corpo.push(`--b${i - 1}`, `Content-Type: multipart/mixed; boundary="b${i}"`, "");
      corpo.push(`--b${livelli}`, "Content-Type: text/plain", "", "profondo");
      for (let i = livelli; i >= 0; i--) corpo.push(`--b${i}--`);
      return grezzo([...intestazioniPrincipali, 'Content-Type: multipart/mixed; boundary="b0"', "", ...corpo, ""]);
    }

    const soloIntestazioni = {
      idConnettore: "m1",
      threadConnettore: "t1",
      cartelle: ["in_arrivo"],
      etichette: ["INBOX", "UNREAD"],
      ricevutaIl: new Date(RICEVUTA_MS),
      messageId: "illeggibile@esempio.it",
      inReplyTo: "prima@esempio.it",
      dataIntestazione: new Date("2026-09-20T08:30:00Z"),
      mittente: { nome: "Mario Bianchi", indirizzo: "mario@esempio.it" },
      a: [{ indirizzo: "io@esempio.it" }],
      oggetto: "Perché non si legge",
      testo: "",
      nomiAllegati: [],
    };

    it("un annidamento MIME eccessivo non blocca la lettura: restano le intestazioni principali", async () => {
      expect(await connettoreCon(await messaggio(Promise.resolve(annidato(3)))).connettore.leggi("m1")).toMatchObject({
        testo: "profondo",
      });

      const { connettore } = connettoreCon(await messaggio(Promise.resolve(annidato(300))));

      expect(await connettore.leggi("m1")).toMatchObject(soloIntestazioni);
      expect(await connettore.leggiHtml("m1")).toBeNull();
    });

    it("intestazioni enormi in una parte interna non bloccano la lettura", async () => {
      const raw = grezzo([
        ...intestazioniPrincipali,
        'Content-Type: multipart/mixed; boundary="b"',
        "",
        "--b",
        "Content-Type: text/html",
        riempitivo,
        "",
        "<p>ciao</p>",
        "--b--",
        "",
      ]);
      const { connettore } = connettoreCon(await messaggio(Promise.resolve(raw)));

      expect(await connettore.leggi("m1")).toMatchObject(soloIntestazioni);
      expect(await connettore.leggiHtml("m1")).toBeNull();
    });

    it("con intestazioni principali illeggibili restano i dati del provider", async () => {
      const raw = grezzo([...intestazioniPrincipali, riempitivo, "Content-Type: text/plain", "", "corpo", ""]);
      const { connettore } = connettoreCon(await messaggio(Promise.resolve(raw)));

      expect(await connettore.leggi("m1")).toEqual({
        idConnettore: "m1",
        threadConnettore: "t1",
        cartelle: ["in_arrivo"],
        etichette: ["INBOX", "UNREAD"],
        ricevutaIl: new Date(RICEVUTA_MS),
        messageId: null,
        inReplyTo: null,
        references: [],
        dataIntestazione: null,
        mittente: { indirizzo: "" },
        a: [],
        cc: [],
        replyTo: [],
        oggetto: "",
        testo: "",
        nomiAllegati: [],
      });
    });
  });

  it("riprova la lettura dopo un errore temporaneo", async () => {
    const m = await messaggio(rfc822({ from: "a@esempio.it", to: "io@esempio.it", subject: "x", text: "x" }));
    const messagesGetRaw = vi.fn().mockRejectedValueOnce(indisponibile()).mockResolvedValueOnce(m);
    const connettore = new ConnettoreGmail({
      client: clientFinto({ messagesGetRaw }),
      indirizzo: "io@esempio.it",
      attesa: nessunaAttesa,
    });

    expect((await connettore.leggi("m1"))?.idConnettore).toBe("m1");
    expect(messagesGetRaw).toHaveBeenCalledTimes(2);
  });
});

describe("ConnettoreGmail.leggiHtml", () => {
  it("restituisce l'HTML originale", async () => {
    const { connettore } = connettoreCon(
      await messaggio(rfc822({ from: "a@esempio.it", to: "io@esempio.it", subject: "x", html: "<p>Ciao <b>Anna</b></p>" })),
    );
    expect(await connettore.leggiHtml("m1")).toContain("<p>Ciao <b>Anna</b></p>");
  });

  it("restituisce null per un messaggio solo testo o eliminato", async () => {
    const { connettore } = connettoreCon(
      await messaggio(rfc822({ from: "a@esempio.it", to: "io@esempio.it", subject: "x", text: "solo testo" })),
    );
    expect(await connettore.leggiHtml("m1")).toBeNull();

    const eliminato = new ConnettoreGmail({
      client: clientFinto({ messagesGetRaw: async () => Promise.reject(nonTrovato()) }),
      indirizzo: "io@esempio.it",
    });
    expect(await eliminato.leggiHtml("m1")).toBeNull();
  });
});

describe("ConnettoreGmail.cartelle", () => {
  it("rilegge le etichette con il formato minimo", async () => {
    const messagesGetMinimal = vi.fn(async (id: string) => ({ id, threadId: "t1", labelIds: ["TRASH", "IMPORTANT"] }));
    const connettore = new ConnettoreGmail({ client: clientFinto({ messagesGetMinimal }), indirizzo: "io@esempio.it" });

    expect(await connettore.cartelle("m1")).toEqual({
      idConnettore: "m1",
      cartelle: ["cestino"],
      etichette: ["TRASH", "IMPORTANT"],
    });
  });

  it("restituisce null se il messaggio non esiste più", async () => {
    const connettore = new ConnettoreGmail({
      client: clientFinto({ messagesGetMinimal: async () => Promise.reject(nonTrovato()) }),
      indirizzo: "io@esempio.it",
    });
    expect(await connettore.cartelle("m1")).toBeNull();
  });
});
