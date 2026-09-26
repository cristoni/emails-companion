import type { UnitaDiLavoro } from "@ec/db";
import type { FabbricaConnettori, GatewayModelli, GeneratoreId, Orologio, RilevatoreLingua } from "@ec/core/porte";

export interface Dipendenze {
  unita: UnitaDiLavoro;
  connettori: FabbricaConnettori;
  modelli: GatewayModelli;
  orologio: Orologio;
  ids: GeneratoreId;
  lingua: RilevatoreLingua;
  configurazione: Configurazione;
}

export interface Configurazione {
  /** Versione dell'informativa che l'utente deve aver accettato perché l'analisi parta. */
  versioneInformativa: string;
  /** Con notifiche push attive il polling è solo una rete di sicurezza. */
  notifichePushAttive: boolean;
  giorniImportazioneRicevute: number;
  giorniImportazioneInviate: number;
}

export const CONFIGURAZIONE_PREDEFINITA: Configurazione = {
  versioneInformativa: "2026-09-27",
  notifichePushAttive: false,
  giorniImportazioneRicevute: 14,
  giorniImportazioneInviate: 30,
};

export const GIORNO_MS = 24 * 60 * 60 * 1000;
export const MINUTO_MS = 60 * 1000;
