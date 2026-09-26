import { caricaConfigurazioneChiavi, type ConfigurazioneChiavi } from "@ec/crypto";

export interface ConfigurazioneAmbiente {
  modalita: "reale" | "finta";
  ambiente: "sviluppo" | "anteprima" | "produzione";
  databaseUrl: string;
  databaseCa: string | null;
  chiavi: ConfigurazioneChiavi;
  google: { clientId: string; clientSecret: string; redirectUriCaselle: string } | null;
  pubsub: { topic: string; subscription: string; credenziali: string } | null;
  urlApp: string;
}

export class ErroreConfigurazione extends Error {
  constructor(voce: string) {
    super(`configurazione_mancante:${voce}`);
    this.name = "ErroreConfigurazione";
  }
}

function obbligatoria(env: Record<string, string | undefined>, nome: string): string {
  const valore = env[nome];
  if (!valore) throw new ErroreConfigurazione(nome);
  return valore;
}

/**
 * Legge la configurazione. La modalità finta è ammessa solo fuori produzione e senza segreti reali:
 * un errore di configurazione non deve mai trasformare la produzione in un ambiente di prova.
 */
export function leggiConfigurazione(env: Record<string, string | undefined>): ConfigurazioneAmbiente {
  const modalita = env.APP_MODE === "fake" ? "finta" : "reale";
  const ambiente =
    env.VERCEL_ENV === "production" || env.RAILWAY_ENVIRONMENT_NAME === "production" || env.EC_AMBIENTE === "produzione"
      ? "produzione"
      : env.VERCEL_ENV === "preview"
        ? "anteprima"
        : "sviluppo";
  if (modalita === "finta" && (ambiente === "produzione" || env.GOOGLE_CLIENT_SECRET || env.EC_CHIAVE_PRINCIPALE_ATTIVA === "produzione")) {
    throw new ErroreConfigurazione("modalita_finta_non_ammessa");
  }
  const google =
    modalita === "reale"
      ? {
          clientId: obbligatoria(env, "GOOGLE_CLIENT_ID"),
          clientSecret: obbligatoria(env, "GOOGLE_CLIENT_SECRET"),
          redirectUriCaselle: obbligatoria(env, "GOOGLE_REDIRECT_URI_CASELLE"),
        }
      : null;
  const pubsub =
    env.GMAIL_PUBSUB_TOPIC && env.GMAIL_PUBSUB_SUBSCRIPTION && env.GCP_SERVICE_ACCOUNT_JSON
      ? { topic: env.GMAIL_PUBSUB_TOPIC, subscription: env.GMAIL_PUBSUB_SUBSCRIPTION, credenziali: env.GCP_SERVICE_ACCOUNT_JSON }
      : null;
  return {
    modalita,
    ambiente,
    databaseUrl: obbligatoria(env, "EC_DATABASE_URL"),
    databaseCa: env.EC_DATABASE_CA ?? null,
    chiavi: caricaConfigurazioneChiavi(env),
    google,
    pubsub,
    urlApp: env.EC_URL_APP ?? "http://localhost:3000",
  };
}
