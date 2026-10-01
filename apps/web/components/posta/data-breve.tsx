import { useFormatter, useNow } from "next-intl";

/**
 * Data compatta per gli elenchi, come in una casella di posta: solo l'ora se è di oggi, giorno e mese se è
 * di quest'anno, altrimenti anche l'anno. "Oggi" e "quest'anno" si decidono nel fuso dell'utente,
 * confrontando le date formattate (il fuso e `now` sono configurati in `i18n/request.ts`), mai con le parti
 * locali del server. La data completa resta nel titolo.
 */
export function DataBreve({ iso, className }: { iso: string; className?: string }) {
  const formato = useFormatter();
  const ora = useNow();
  const data = new Date(iso);
  const giorno = (d: Date) => formato.dateTime(d, { year: "numeric", month: "2-digit", day: "2-digit" });
  const anno = (d: Date) => formato.dateTime(d, { year: "numeric" });
  const testo =
    giorno(data) === giorno(ora)
      ? formato.dateTime(data, { timeStyle: "short" })
      : anno(data) === anno(ora)
        ? formato.dateTime(data, { month: "short", day: "numeric" })
        : formato.dateTime(data, { dateStyle: "medium" });
  return (
    <time dateTime={iso} title={formato.dateTime(data, { dateStyle: "full", timeStyle: "short" })} className={className}>
      {testo}
    </time>
  );
}
