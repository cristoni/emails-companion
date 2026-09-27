import { useFormatter, useTranslations } from "next-intl";
import type { VistaImpostazioniDto } from "@ec/applicazione";
import { StatoVuoto } from "@/components/ui/pagina";
import { opzioniImporto } from "./formato";
import { Sezione } from "./sezione";
import { testiFunzione } from "./sezione-modelli";

/** Sezione `#usage`: invocazioni, costo in dollari e token per Funzione AI negli ultimi 30 giorni. */
export function SezioneConsumo({ consumo }: { consumo: VistaImpostazioniDto["consumo"] }) {
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
  const cella = "px-3 py-2.5 text-right tabular-nums";

  return (
    <Sezione id="usage" titolo={t("consumo.titolo")} descrizione={t("consumo.descrizione")}>
      {consumo.length === 0 ? (
        <StatoVuoto titolo={t("consumo.nessuno")} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead className="bg-surface-muted text-xs text-text-muted">
              <tr>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">
                  {t("consumo.funzione")}
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  {t("consumo.invocazioni")}
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  {t("consumo.costo")}
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  {t("consumo.tokenIngresso")}
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  {t("consumo.tokenUscita")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {consumo.map((c) => (
                <tr key={c.funzione}>
                  <th scope="row" className="px-3 py-2.5 text-left font-normal">
                    {nome(c.funzione)}
                  </th>
                  <td className={cella}>{formato.number(c.invocazioni)}</td>
                  <td className={cella}>{formato.number(c.costo, opzioniImporto(c.costo))}</td>
                  <td className={cella}>{formato.number(c.tokenIngresso)}</td>
                  <td className={cella}>{formato.number(c.tokenUscita)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border-strong font-medium">
              <tr>
                <th scope="row" className="px-3 py-2.5 text-left">
                  {t("consumo.totale")}
                </th>
                <td className={cella}>{formato.number(totale.invocazioni)}</td>
                <td className={cella}>{formato.number(totale.costo, opzioniImporto(totale.costo))}</td>
                <td className={cella}>{formato.number(totale.tokenIngresso)}</td>
                <td className={cella}>{formato.number(totale.tokenUscita)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Sezione>
  );
}
