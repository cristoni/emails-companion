import { useFormatter, useTranslations } from "next-intl";

export type StileIstante = "data" | "data_ora" | "relativo";

/**
 * Istante formattato nella lingua e nel fuso dell'utente (configurati in `i18n/request.ts`), con la data
 * completa nel titolo. Gli istanti delle viste sono stringhe ISO 8601 UTC.
 */
export function Istante({ iso, stile = "data_ora", className }: { iso: string | null | undefined; stile?: StileIstante; className?: string }) {
  const formato = useFormatter();
  const t = useTranslations("comuni.tempo");
  if (!iso) return <span className={className}>{t("mai")}</span>;
  const data = new Date(iso);
  const completo = formato.dateTime(data, { dateStyle: "full", timeStyle: "short" });
  const testo =
    stile === "relativo"
      ? formato.relativeTime(data)
      : stile === "data"
        ? formato.dateTime(data, { dateStyle: "medium" })
        : formato.dateTime(data, { dateStyle: "medium", timeStyle: "short" });
  return (
    <time dateTime={iso} title={completo} className={className}>
      {testo}
    </time>
  );
}
