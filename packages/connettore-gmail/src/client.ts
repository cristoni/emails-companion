import { gmail, type gmail_v1 } from "@googleapis/gmail";
import type { OAuth2Client } from "google-auth-library";
import { ErroreConnettore } from "@ec/core";

export interface RiferimentoMessaggio {
  id: string;
  threadId: string | null;
  labelIds: string[] | null;
}

export interface RecordHistory {
  id: string;
  messagesAdded: RiferimentoMessaggio[];
  messagesDeleted: RiferimentoMessaggio[];
  labelsAdded: RiferimentoMessaggio[];
  labelsRemoved: RiferimentoMessaggio[];
}

export interface ParametriHistory {
  startHistoryId: string;
  historyTypes: string[];
  maxResults: number;
  pageToken?: string;
}

export interface PaginaHistory {
  history: RecordHistory[];
  historyId: string | null;
  nextPageToken: string | null;
}

export interface ParametriElenco {
  q: string;
  maxResults: number;
  pageToken?: string;
}

export interface PaginaElenco {
  ids: string[];
  nextPageToken: string | null;
}

export interface MessaggioMinimo {
  id: string;
  threadId: string | null;
  labelIds: string[];
}

export interface MessaggioRaw extends MessaggioMinimo {
  /** Epoch in millisecondi, come stringa. */
  internalDate: string;
  /** RFC 5322 in base64url. */
  raw: string;
}

export interface MessaggioMetadati extends MessaggioMinimo {
  headers: { name: string; value: string }[];
}

export interface ThreadMinimo {
  id: string;
  messages: MessaggioMinimo[];
}

/** Il sottoinsieme dell'API Gmail usato dal connettore, con dati semplici e già tipizzati. */
export interface ClientGmail {
  getProfile(): Promise<{ emailAddress: string; historyId: string }>;
  historyList(parametri: ParametriHistory): Promise<PaginaHistory>;
  messagesList(parametri: ParametriElenco): Promise<PaginaElenco>;
  messagesGetRaw(id: string): Promise<MessaggioRaw>;
  messagesGetMetadata(id: string, headers: string[]): Promise<MessaggioMetadati>;
  messagesGetMinimal(id: string): Promise<MessaggioMinimo>;
  threadsGetMinimal(id: string): Promise<ThreadMinimo>;
  messagesSend(raw: string, threadId: string | null): Promise<{ id: string; threadId: string | null }>;
  watch(topicName: string): Promise<{ historyId: string; expiration: string }>;
  stop(): Promise<void>;
  /** Indirizzi di invio (sendAsEmail), principale compreso. */
  sendAsList(): Promise<string[]>;
}

export interface OpzioniClientGmail {
  /** Timeout di ogni richiesta di lettura. */
  timeoutMs?: number;
  /** Timeout rigido dell'invio: oltre questo limite l'esito è ignoto. */
  timeoutInvioMs?: number;
}

function obbligatorio<T>(valore: T | null | undefined): T {
  if (valore === null || valore === undefined) throw new ErroreConnettore("temporaneo");
  return valore;
}

const riferimento = (m: gmail_v1.Schema$Message | undefined): RiferimentoMessaggio => ({
  id: obbligatorio(m?.id),
  threadId: m?.threadId ?? null,
  labelIds: m?.labelIds ?? null,
});

const minimo = (m: gmail_v1.Schema$Message): MessaggioMinimo => ({
  id: obbligatorio(m.id),
  threadId: m.threadId ?? null,
  labelIds: m.labelIds ?? [],
});

const riferimenti = (voci: { message?: gmail_v1.Schema$Message }[] | undefined) =>
  (voci ?? []).map((v) => riferimento(v.message));

/** ClientGmail sull'API REST; i ritentativi automatici della libreria sono disattivati: li governa il connettore. */
export function creaClientGmail(auth: OAuth2Client, opzioni: OpzioniClientGmail = {}): ClientGmail {
  const { timeoutMs = 60_000, timeoutInvioMs = 30_000 } = opzioni;
  const api = gmail({ version: "v1", auth, retry: false, timeout: timeoutMs });
  const userId = "me";
  const messaggio = async (id: string, format: "raw" | "metadata" | "minimal", metadataHeaders?: string[]) =>
    (await api.users.messages.get({ userId, id, format, ...(metadataHeaders ? { metadataHeaders } : {}) })).data;

  return {
    async getProfile() {
      const { data } = await api.users.getProfile({ userId });
      return { emailAddress: data.emailAddress ?? "", historyId: obbligatorio(data.historyId) };
    },
    async historyList(parametri) {
      const { data } = await api.users.history.list({ userId, ...parametri });
      return {
        history: (data.history ?? []).map((r) => ({
          id: obbligatorio(r.id),
          messagesAdded: riferimenti(r.messagesAdded),
          messagesDeleted: riferimenti(r.messagesDeleted),
          labelsAdded: riferimenti(r.labelsAdded),
          labelsRemoved: riferimenti(r.labelsRemoved),
        })),
        historyId: data.historyId ?? null,
        nextPageToken: data.nextPageToken ?? null,
      };
    },
    async messagesList(parametri) {
      const { data } = await api.users.messages.list({ userId, ...parametri });
      return { ids: (data.messages ?? []).map((m) => obbligatorio(m.id)), nextPageToken: data.nextPageToken ?? null };
    },
    async messagesGetRaw(id) {
      const m = await messaggio(id, "raw");
      return { ...minimo(m), internalDate: obbligatorio(m.internalDate), raw: obbligatorio(m.raw) };
    },
    async messagesGetMetadata(id, headers) {
      const m = await messaggio(id, "metadata", headers);
      return {
        ...minimo(m),
        headers: (m.payload?.headers ?? []).map((h) => ({ name: h.name ?? "", value: h.value ?? "" })),
      };
    },
    async messagesGetMinimal(id) {
      return minimo(await messaggio(id, "minimal"));
    },
    async threadsGetMinimal(id) {
      const { data } = await api.users.threads.get({ userId, id, format: "minimal" });
      return { id: obbligatorio(data.id), messages: (data.messages ?? []).map(minimo) };
    },
    async messagesSend(raw, threadId) {
      const { data } = await api.users.messages.send(
        { userId, requestBody: { raw, ...(threadId ? { threadId } : {}) } },
        { timeout: timeoutInvioMs },
      );
      if (!data.id) throw new ErroreConnettore("timeout_invio");
      return { id: data.id, threadId: data.threadId ?? null };
    },
    async watch(topicName) {
      const { data } = await api.users.watch({ userId, requestBody: { topicName } });
      return { historyId: obbligatorio(data.historyId), expiration: obbligatorio(data.expiration) };
    },
    async stop() {
      await api.users.stop({ userId });
    },
    async sendAsList() {
      const { data } = await api.users.settings.sendAs.list({ userId });
      return (data.sendAs ?? []).flatMap((s) => (s.sendAsEmail ? [s.sendAsEmail] : []));
    },
  };
}
