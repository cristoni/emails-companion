export { ConnettoreGmail, type OpzioniConnettoreGmail } from "./connettore";
export {
  creaClientGmail,
  type ClientGmail,
  type MessaggioMetadati,
  type MessaggioMinimo,
  type MessaggioRaw,
  type OpzioniClientGmail,
  type PaginaElenco,
  type PaginaHistory,
  type ParametriElenco,
  type ParametriHistory,
  type RecordHistory,
  type RiferimentoMessaggio,
  type ThreadMinimo,
} from "./client";
export { cartelleDaEtichette } from "./cartelle";
export { conRitentativi, erroreConnettore, type OpzioniRitentativi } from "./errori";
export {
  SCOPE_ACCESSO,
  SCOPE_GMAIL_INVIO,
  SCOPE_GMAIL_LETTURA,
  creaUrlAutorizzazione,
  generaPkce,
  revocaToken,
  rinnovaAccesso,
  scambiaCodice,
  valutaScope,
  type ConfigurazioneOAuth,
  type ConsensoGoogle,
  type EsitoScope,
} from "./oauth";
export {
  accessTokenValido,
  creaAuthPerCasella,
  type CredenzialiSalvate,
  type DepositoCredenziali,
  type RinnovaAccesso,
} from "./credenziali";
