import {
  ConnettoreGmail,
  creaAuthPerCasella,
  creaClientGmail,
  revocaToken,
  rinnovaAccesso,
  type ConfigurazioneOAuth,
  type DepositoCredenziali,
} from "@ec/connettore-gmail";
import { ErroreConnettore, type ConnettorePosta, type FabbricaConnettori, type Orologio } from "@ec/core/porte";
import { caselle, credenziali, type UnitaDiLavoro } from "@ec/db";

/** Fabbrica dei connettori Gmail: credenziali per casella, token condivisi e scritture condizionate (§6.3). */
export class FabbricaConnettoriGmail implements FabbricaConnettori {
  readonly #unita: UnitaDiLavoro;
  readonly #oauth: ConfigurazioneOAuth;
  readonly #topic: string | null;
  readonly #orologio: Orologio;

  constructor(opzioni: { unita: UnitaDiLavoro; oauth: ConfigurazioneOAuth; topicNotifiche: string | null; orologio: Orologio }) {
    this.#unita = opzioni.unita;
    this.#oauth = opzioni.oauth;
    this.#topic = opzioni.topicNotifiche;
    this.#orologio = opzioni.orologio;
  }

  async per(casellaId: string): Promise<ConnettorePosta> {
    const utenteId = await this.#unita.sistema((ctx) => caselle.utenteDellaCasella(ctx.tx, casellaId));
    if (!utenteId) throw new ErroreConnettore("autorizzazione_revocata");
    const casella = await this.#unita.perUtente(utenteId, (ctx) => caselle.leggi(ctx, casellaId));
    if (!casella) throw new ErroreConnettore("autorizzazione_revocata");
    const deposito: DepositoCredenziali = {
      leggi: (id) => this.#unita.perUtente(utenteId, (ctx) => credenziali.leggi(ctx, id)),
      salvaAccessoSeValido: (id, generazione, token, scadenza) =>
        this.#unita.perUtente(utenteId, (ctx) => credenziali.salvaAccessoSeValido(ctx, id, generazione, token, scadenza)),
      segnaDaRicollegare: async (id, generazione) => {
        await this.#unita.perUtente(utenteId, (ctx) => credenziali.segnaDaRicollegare(ctx, id, generazione, this.#orologio.ora()));
      },
    };
    const auth = creaAuthPerCasella({
      casellaId,
      deposito,
      rinnova: (refreshToken) => rinnovaAccesso(this.#oauth, refreshToken),
      ora: () => this.#orologio.ora(),
    });
    return new ConnettoreGmail({
      client: creaClientGmail(auth),
      indirizzo: casella.indirizzo,
      topicNotifiche: this.#topic,
      revocaToken: async () => {
        const salvate = await deposito.leggi(casellaId);
        if (salvate?.refreshToken) await revocaToken(salvate.refreshToken);
      },
    });
  }
}
