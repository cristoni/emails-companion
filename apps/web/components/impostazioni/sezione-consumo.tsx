import { useFormatter, useTranslations } from "next-intl";
import type { VistaImpostazioniDto } from "@ec/applicazione";
import { Aiuto } from "@/components/ui/campi";
import { Espandibile } from "@/components/ui/espandibile";
import { opzioniImporto } from "./formato";
import { CLASSE_ANCORA } from "./sezione";
import { testiFunzione } from "./sezione-modelli";

/**
 * Consumo degli ultimi 30 giorni (ancora `#usage`), dentro la sezione della chiave: una riga con spesa e
 * chiamate, che si apre sulla tabella per Funzione AI. Sui telefoni la tabella nasconde le colonne dei token.
 */
export function ConsumoChiave({ consumo }: { consumo: VistaImpostazioniDto["consumo"] }) {
  const t = useTranslations("impostazioni");
  const tc = useTranslations("comuni");
  const formato = useFormatter();
  const totale = consumo.reduce(
    (acc, c) => ({
      invocazioni: acc.invocazioni + c.invocazioni,
      costo: acc.costo + c.costo,
      tokenIngresso: acc.tokenIngresso + c.tokenIngresso,
      tokenUscita: acc.tokenUscita + c.tokenUscita,
    }),
    { invocazioni: 0, costo: 0, tokenIngresso: 0, tokenUscita: 0 },
  );
  // Il codice della funzione è una stringa libera: un codice senza traduzione diventa "Altro", mai il codice grezzo.
  const nome = (funzione: string) =>
    t.has(`modelli.funzioni.${funzione}.nome`) || tc.has(`funzioni.${funzione}`) ? testiFunzione(t, tc, funzione).nome : t("consumo.funzioneSconosciuta");
  const cella = "px-3 py-2 text-right tabular-nums";
  const token = "hidden sm:table-cell";

  if (consumo.length === 0) {
    return (
      <p id="usage" className={`${CLASSE_ANCORA} text-text-muted`}>
        {t("consumo.nessuno")}
      </p>
    );
  }

  return (
    <div id="usage" className={CLASSE_ANCORA}>
      <Espandibile
        titolo={t("consumo.riepilogo", { costo: formato.number(totale.costo, opzioniImporto(totale.costo)), chiamate: totale.invocazioni })}
        classeContenuto="space-y-2"
      >
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-surface-muted text-xs text-text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  {t("consumo.funzione")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t("consumo.invocazioni")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t("consumo.costo")}
                </th>
                <th scope="col" className={`${token} px-3 py-2 text-right font-medium`}>
                  {t("consumo.tokenIngresso")}
                </th>
                <th scope="col" className={`${token} px-3 py-2 text-right font-medium`}>
                  {t("consumo.tokenUscita")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {consumo.map((c) => (
                <tr key={c.funzione}>
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    {nome(c.funzione)}
                  </th>
                  <td className={cella}>{formato.number(c.invocazioni)}</td>
                  <td className={cella}>{formato.number(c.costo, opzioniImporto(c.costo))}</td>
                  <td className={`${token} ${cella}`}>{formato.number(c.tokenIngresso)}</td>
                  <td className={`${token} ${cella}`}>{formato.number(c.tokenUscita)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border-strong font-medium">
              <tr>
                <th scope="row" className="px-3 py-2 text-left">
                  {t("consumo.totale")}
                </th>
                <td className={cella}>{formato.number(totale.invocazioni)}</td>
                <td className={cella}>{formato.number(totale.costo, opzioniImporto(totale.costo))}</td>
                <td className={`${token} ${cella}`}>{formato.number(totale.tokenIngresso)}</td>
                <td className={`${token} ${cella}`}>{formato.number(totale.tokenUscita)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <Aiuto>{t("consumo.fonte")}</Aiuto>
      </Espandibile>
    </div>
  );
}
