import { describe, expect, it, vi } from "vitest";
import type { PaginaModifiche } from "@ec/core";
import { ConnettoreGmail } from "../src/connettore";
import type {
  ClientGmail,
  PaginaElenco,
  PaginaHistory,
  ParametriElenco,
  ParametriHistory,
  RecordHistory,
} from "../src/client";
import { clientFinto, indisponibile, nessunaAttesa, nonTrovato } from "./supporto";

const rif = (id: string, labelIds: string[] | null = null) => ({ id, threadId: `t-${id}`, labelIds });

function record(id: string, parti: Partial<Omit<RecordHistory, "id">>): RecordHistory {
  return { id, messagesAdded: [], messagesDeleted: [], labelsAdded: [], labelsRemoved: [], ...parti };
}

function connettoreConHistory(
  pagine: PaginaHistory[] | ((p: ParametriHistory) => Promise<PaginaHistory>),
  altri: Partial<ClientGmail> = {},
) {
  const historyList = vi.fn(
    typeof pagine === "function" ? pagine : async (p: ParametriHistory) => pagine[p.pageToken ? Number(p.pageToken) : 0]!,
  );
  const connettore = new ConnettoreGmail({
    client: clientFinto({ historyList, ...altri }),
    indirizzo: "io@esempio.it",
    attesa: nessunaAttesa,
  });
  return { connettore, historyList };
}

async function tutte<T>(iterabile: AsyncIterable<T>): Promise<T[]> {
  const risultato: T[] = [];
  for await (const v of iterabile) risultato.push(v);
  return risultato;
}

describe("ConnettoreGmail.modifiche", () => {
  it("scorre le pagine della cronologia senza filtro di etichette, con un cursore per pagina", async () => {
    const { connettore, historyList } = connettoreConHistory([
      {
        history: [
          record("105", { messagesAdded: [rif("a", ["INBOX"]), rif("b", ["SENT"])] }),
          record("110", { messagesAdded: [rif("a", ["INBOX"])], messagesDeleted: [rif("c")] }),
        ],
        historyId: "900",
        nextPageToken: "1",
      },
      {
        history: [
          record("120", { labelsAdded: [{ ...rif("d", ["TRASH"]) }] }),
          record("125", { labelsRemoved: [{ ...rif("e", ["IMPORTANT"]) }] }),
        ],
        historyId: "130",
        nextPageToken: null,
      },
    ]);

    const pagine = await tutte(connettore.modifiche("100"));

    const tipi = ["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"];
    expect(historyList.mock.calls.map(([p]) => p)).toEqual([
      { startHistoryId: "100", historyTypes: tipi, maxResults: 500 },
      { startHistoryId: "100", historyTypes: tipi, maxResults: 500, pageToken: "1" },
    ]);
    expect(pagine).toEqual<PaginaModifiche[]>([
      { aggiunte: ["a", "b"], eliminate: ["c"], cambiCartelle: [], cursore: "110" },
      {
        aggiunte: [],
        eliminate: [],
        cambiCartelle: [
          { idConnettore: "d", cartelle: ["cestino"], etichette: ["TRASH"] },
          { idConnettore: "e", cartelle: ["archiviata"], etichette: ["IMPORTANT"] },
        ],
        cursore: "130",
      },
    ]);
  });

  it("confronta gli id della cronologia come numeri, non come stringhe", async () => {
    const { connettore } = connettoreConHistory([
      { history: [record("999", {}), record("1000", {})], historyId: "1001", nextPageToken: "1" },
      { history: [], historyId: "1001", nextPageToken: null },
    ]);
    const pagine = await tutte(connettore.modifiche("998"));
    expect(pagine.map((p) => p.cursore)).toEqual(["1000", "1001"]);
  });

  it("restituisce anche l'ultima pagina vuota per far avanzare il cursore", async () => {
    const { connettore } = connettoreConHistory([{ history: [], historyId: "150", nextPageToken: null }]);
    expect(await tutte(connettore.modifiche("100"))).toEqual([
      { aggiunte: [], eliminate: [], cambiCartelle: [], cursore: "150" },
    ]);
  });

  it("non fa mai arretrare il cursore", async () => {
    const { connettore } = connettoreConHistory([{ history: [], historyId: "90", nextPageToken: null }]);
    expect((await tutte(connettore.modifiche("100")))[0]?.cursore).toBe("100");
  });

  it("usa l'insieme completo di etichette più recente e ignora i cambi dei messaggi eliminati", async () => {
    const { connettore } = connettoreConHistory([
      {
        history: [
          record("201", { labelsAdded: [rif("x", ["INBOX", "STARRED"])], labelsRemoved: [rif("y", ["INBOX"])] }),
          record("202", { labelsRemoved: [rif("x", ["STARRED"])] }),
          record("203", { messagesDeleted: [rif("y")] }),
        ],
        historyId: "203",
        nextPageToken: null,
      },
    ]);

    const [pagina] = await tutte(connettore.modifiche("200"));

    expect(pagina?.eliminate).toEqual(["y"]);
    expect(pagina?.cambiCartelle).toEqual([{ idConnettore: "x", cartelle: ["archiviata"], etichette: ["STARRED"] }]);
  });

  it("rilegge le etichette quando la cronologia non le riporta", async () => {
    const messagesGetMinimal = vi.fn(async (id: string) => {
      if (id === "gone") throw nonTrovato();
      return { id, threadId: "t", labelIds: ["SPAM"] };
    });
    const { connettore } = connettoreConHistory(
      [
        {
          history: [record("301", { labelsAdded: [rif("z", null), rif("gone", null)] })],
          historyId: "301",
          nextPageToken: null,
        },
      ],
      { messagesGetMinimal },
    );

    const [pagina] = await tutte(connettore.modifiche("300"));

    expect(pagina?.cambiCartelle).toEqual([{ idConnettore: "z", cartelle: ["spam"], etichette: ["SPAM"] }]);
  });

  it("segnala il cursore scaduto su 404", async () => {
    const { connettore } = connettoreConHistory(async () => Promise.reject(nonTrovato()));
    await expect(tutte(connettore.modifiche("1"))).rejects.toMatchObject({ codice: "cursore_scaduto" });
  });

  it("riprova una pagina dopo un errore temporaneo", async () => {
    let chiamate = 0;
    const { connettore, historyList } = connettoreConHistory(async () => {
      if (chiamate++ === 0) throw indisponibile();
      return { history: [], historyId: "7", nextPageToken: null };
    });
    expect((await tutte(connettore.modifiche("5")))[0]?.cursore).toBe("7");
    expect(historyList).toHaveBeenCalledTimes(2);
  });
});

describe("ConnettoreGmail.cursoreAttuale", () => {
  it("legge l'historyId del profilo", async () => {
    const connettore = new ConnettoreGmail({
      client: clientFinto({ getProfile: async () => ({ emailAddress: "io@esempio.it", historyId: "12345" }) }),
      indirizzo: "io@esempio.it",
    });
    expect(await connettore.cursoreAttuale()).toBe("12345");
  });
});

describe("ConnettoreGmail.elenca", () => {
  const dopo = new Date("2026-09-01T00:00:00Z");
  const prima = new Date("2026-09-15T00:00:00Z");
  const sec = (d: Date) => d.getTime() / 1000;

  function connettoreConElenco(pagine: PaginaElenco[] = [{ ids: [], nextPageToken: null }]) {
    const messagesList = vi.fn(async (p: ParametriElenco) => pagine[p.pageToken ? Number(p.pageToken) : 0]!);
    const threadsGetMinimal = vi.fn(async (id: string) => ({
      id,
      messages: [rif("m1", ["INBOX"]), rif("m2", ["SENT"])].map((m) => ({ ...m, labelIds: m.labelIds ?? [] })),
    }));
    const connettore = new ConnettoreGmail({
      client: clientFinto({ messagesList, threadsGetMinimal }),
      indirizzo: "io@esempio.it",
    });
    return { connettore, messagesList, threadsGetMinimal };
  }

  it("elenca le ricevute nella finestra, pagina per pagina", async () => {
    const { connettore, messagesList } = connettoreConElenco([
      { ids: ["a", "b"], nextPageToken: "1" },
      { ids: ["c"], nextPageToken: null },
    ]);

    expect(await tutte(connettore.elenca({ tipo: "ricevute", dopo, prima }))).toEqual([["a", "b"], ["c"]]);
    const q = `after:${sec(dopo)} before:${sec(prima)} -in:sent -in:chats -in:drafts`;
    expect(messagesList.mock.calls.map(([p]) => p)).toEqual([
      { q, maxResults: 500 },
      { q, maxResults: 500, pageToken: "1" },
    ]);
  });

  it("elenca le inviate", async () => {
    const { connettore, messagesList } = connettoreConElenco();
    await tutte(connettore.elenca({ tipo: "inviate", dopo }));
    expect(messagesList.mock.calls[0]?.[0].q).toBe(`in:sent after:${sec(dopo)}`);
  });

  it("limita le ricevute ai mittenti indicati", async () => {
    const { connettore, messagesList } = connettoreConElenco();
    await tutte(connettore.elenca({ tipo: "ricevute", dopo, interlocutori: ["Marco@Fornitore.example", "anna@esempio.it"] }));
    expect(messagesList.mock.calls[0]?.[0].q).toBe(
      `after:${sec(dopo)} -in:sent -in:chats -in:drafts (from:marco@fornitore.example OR from:anna@esempio.it)`,
    );
  });

  it("limita le inviate ai destinatari indicati", async () => {
    const { connettore, messagesList } = connettoreConElenco();
    await tutte(connettore.elenca({ tipo: "inviate", dopo, interlocutori: ["anna@esempio.it"] }));
    expect(messagesList.mock.calls[0]?.[0].q).toBe(
      `in:sent after:${sec(dopo)} (to:anna@esempio.it OR cc:anna@esempio.it OR bcc:anna@esempio.it)`,
    );
  });

  it("scarta indirizzi che altererebbero la ricerca e non allarga mai il filtro", async () => {
    const { connettore, messagesList } = connettoreConElenco();
    await tutte(connettore.elenca({ tipo: "ricevute", dopo, interlocutori: ['x" OR in:anywhere', "ok@esempio.it"] }));
    expect(messagesList.mock.calls[0]?.[0].q).toContain("(from:ok@esempio.it)");

    messagesList.mockClear();
    expect(await tutte(connettore.elenca({ tipo: "ricevute", dopo, interlocutori: ["a b@c.it", "(x)@y.it"] }))).toEqual([]);
    expect(messagesList).not.toHaveBeenCalled();
  });

  it("per un thread restituisce i suoi messaggi", async () => {
    const { connettore, messagesList, threadsGetMinimal } = connettoreConElenco();
    expect(await tutte(connettore.elenca({ tipo: "ricevute", dopo, thread: "t9" }))).toEqual([["m1", "m2"]]);
    expect(threadsGetMinimal).toHaveBeenCalledWith("t9");
    expect(messagesList).not.toHaveBeenCalled();
  });

  it("per un thread eliminato non restituisce nulla", async () => {
    const connettore = new ConnettoreGmail({
      client: clientFinto({ threadsGetMinimal: async () => Promise.reject(nonTrovato()) }),
      indirizzo: "io@esempio.it",
    });
    expect(await tutte(connettore.elenca({ tipo: "ricevute", dopo, thread: "t9" }))).toEqual([]);
  });
});

describe("ConnettoreGmail: alias, notifiche, revoca e link", () => {
  it("dichiara le capacità; le notifiche solo con un topic", () => {
    const client = clientFinto({});
    expect(new ConnettoreGmail({ client, indirizzo: "io@esempio.it" }).capacita).toEqual({
      notifiche: false,
      threadNativi: true,
      invio: true,
      linkOriginale: true,
      alias: true,
    });
    expect(new ConnettoreGmail({ client, indirizzo: "io@esempio.it", topicNotifiche: "projects/p/topics/t" }).capacita.notifiche).toBe(true);
  });

  it("elenca gli alias di invio in minuscolo, compreso l'indirizzo principale", async () => {
    const connettore = new ConnettoreGmail({
      client: clientFinto({
        sendAsList: async () => ["Alias@Esempio.it", "alias@esempio.it"],
      }),
      indirizzo: "Io@Esempio.it",
    });
    expect(await connettore.alias()).toEqual(["io@esempio.it", "alias@esempio.it"]);
  });

  it("avvia le notifiche sul topic e restituisce la scadenza", async () => {
    const watch = vi.fn(async (_t: string) => ({ historyId: "5", expiration: "1790000000000" }));
    const connettore = new ConnettoreGmail({
      client: clientFinto({ watch }),
      indirizzo: "io@esempio.it",
      topicNotifiche: "projects/p/topics/gmail",
    });
    expect(await connettore.avviaNotifiche()).toEqual({ scadenza: new Date(1790000000000) });
    expect(watch).toHaveBeenCalledWith("projects/p/topics/gmail");
  });

  it("senza topic non avvia notifiche", async () => {
    const watch = vi.fn();
    const connettore = new ConnettoreGmail({ client: clientFinto({ watch }), indirizzo: "io@esempio.it" });
    expect(await connettore.avviaNotifiche()).toBeNull();
    expect(watch).not.toHaveBeenCalled();
  });

  it("ferma le notifiche", async () => {
    const stop = vi.fn(async () => {});
    await new ConnettoreGmail({ client: clientFinto({ stop }), indirizzo: "io@esempio.it" }).fermaNotifiche();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("revoca il consenso tramite la funzione fornita e ne riduce gli errori a codici", async () => {
    const revocaToken = vi.fn(async () => {});
    await new ConnettoreGmail({ client: clientFinto({}), indirizzo: "io@esempio.it", revocaToken }).revoca();
    expect(revocaToken).toHaveBeenCalledOnce();

    await expect(new ConnettoreGmail({ client: clientFinto({}), indirizzo: "io@esempio.it" }).revoca()).resolves.toBeUndefined();

    const fallita = new ConnettoreGmail({
      client: clientFinto({}),
      indirizzo: "io@esempio.it",
      revocaToken: async () => Promise.reject(indisponibile()),
    });
    await expect(fallita.revoca()).rejects.toMatchObject({ codice: "temporaneo" });
  });

  it("costruisce il link all'originale per l'account della casella", () => {
    const connettore = new ConnettoreGmail({ client: clientFinto({}), indirizzo: "io+lavoro@esempio.it" });
    expect(connettore.linkOriginale("18c2f0a", "t1")).toBe(
      "https://mail.google.com/mail/?authuser=io%2Blavoro%40esempio.it#all/18c2f0a",
    );
  });
});
