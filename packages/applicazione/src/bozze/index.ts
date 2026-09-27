import type { PayloadJob } from "@ec/core/porte";
import type { Dipendenze } from "../dipendenze";
import { inviaEmail, sweeperInvii, verificaInvio } from "./invio";
import { generaBozza } from "./richiesta";

export {
  abbinaInvioPerEmail,
  confermaInvio,
  decidiEsitoIncerto,
  DURATA_VERIFICA_MS,
  fineVerifica,
  inviaEmail,
  SOGLIA_CONFERMATO_MS,
  SOGLIA_IN_INVIO_MS,
  sweeperInvii,
  verificaInvio,
  type AbbinamentoInvio,
  type EsitoConfermaInvio,
  type EsitoDecisioneInvio,
  type EsitoInvioEmail,
  type EsitoVerificaInvio,
} from "./invio";
export {
  generaBozza,
  leggiBozza,
  modificaBozza,
  richiediBozza,
  rigeneraBozza,
  type AvvisoBozza,
  type EsitoGenerazioneBozza,
  type EsitoModificaBozza,
  type EsitoRichiestaBozza,
  type RichiestaBozza,
  type VistaBozza,
} from "./richiesta";
export {
  bozzeDellaSituazione,
  dettaglioBozza,
  RITARDO_GENERAZIONE_MS,
  type DettaglioBozzaDto,
  type EmailDellaBozzaDto,
  type StatoGenerazioneBozza,
  type VoceBozzaDto,
} from "./vista";
export { LIMITE_CORPO, LIMITE_OGGETTO } from "./busta";

type JobBozze = "genera_bozza" | "invia_email" | "verifica_invio" | "sweeper_invii";

/** Gestori dei job di bozze e invio, da unire a quelli di `gestoriJob`. */
export function gestoriBozze(dip: Dipendenze): { [N in JobBozze]: (payload: PayloadJob[N]) => Promise<void> } {
  return {
    genera_bozza: async (p) => {
      await generaBozza(dip, p.utenteId, p.bozzaId, p.richiestaId);
    },
    invia_email: async (p) => {
      await inviaEmail(dip, p.utenteId, p.invioId);
    },
    verifica_invio: async (p) => {
      await verificaInvio(dip, p.utenteId, p.invioId);
    },
    sweeper_invii: async () => {
      const esito = await sweeperInvii(dip);
      // Le voci in errore restano com'erano e tornano al giro successivo: il job fallito le rende visibili
      // nei log del worker con il solo codice.
      if (esito.errori > 0) throw Object.assign(new Error("sweeper_voci_in_errore"), { codice: "sweeper_voci_in_errore" });
    },
  };
}
