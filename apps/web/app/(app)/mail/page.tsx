import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { casellePosta, elencoPosta } from "@ec/applicazione";
import { FiltroCaselle } from "@/components/posta/filtro-caselle";
import { RigaEmail } from "@/components/posta/riga-email";
import { IntestazionePagina, StatoVuoto } from "@/components/ui/pagina";
import { classiPulsante } from "@/components/ui/pulsante";
import { Scheda } from "@/components/ui/scheda";
import { richiediOnboardingEssenziale } from "@/lib/server/onboarding";
import { comeUtente } from "@/lib/server/sessione";

const PER_PAGINA = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Parametri = Record<string, string | string[] | undefined>;

function primo(valore: string | string[] | undefined): string | undefined {
  const v = Array.isArray(valore) ? valore[0] : valore;
  return v ? v.slice(0, 200) : undefined;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("posta");
  return { title: t("titolo") };
}

/**
 * `/mail`: elenco in sola lettura della posta sincronizzata, dalla più recente, con filtro per casella. La
 * casella di ogni email si mostra solo con più caselle collegate e senza filtro: altrimenti è sempre la stessa.
 */
export default async function PaginaPosta({ searchParams }: { searchParams: Promise<Parametri> }) {
  await richiediOnboardingEssenziale();
  const t = await getTranslations("posta");
  const parametri = await searchParams;
  const richiesta = primo(parametri.casella);
  const casellaId = richiesta && UUID.test(richiesta) ? richiesta.toLowerCase() : undefined;
  const prima = primo(parametri.prima);

  const { caselle, elenco } = await comeUtente(async (ctx, dip) => {
    const caselle = await casellePosta(dip, ctx);
    const valida = casellaId !== undefined && caselle.some((c) => c.id === casellaId);
    const elenco =
      richiesta !== undefined && !valida
        ? { email: [], cursore: null }
        : await elencoPosta(dip, ctx, { ...(valida ? { casellaId } : {}), ...(prima ? { prima } : {}), limite: PER_PAGINA });
    return { caselle, elenco };
  });

  const filtro = richiesta !== undefined ? (casellaId ?? richiesta) : null;
  const mostraCasella = caselle.length > 1 && filtro === null;
  const conFiltro = (extra: Record<string, string>) => {
    const q = new URLSearchParams(filtro ? { casella: filtro, ...extra } : extra).toString();
    return q ? `/mail?${q}` : "/mail";
  };

  return (
    <div>
      <IntestazionePagina titolo={t("titolo")} descrizione={t("descrizione")} />

      {caselle.length > 1 ? <FiltroCaselle caselle={caselle} selezionata={filtro} /> : null}

      {elenco.email.length === 0 ? (
        prima ? (
          <StatoVuoto titolo={t("vuoto.titoloPagina")}>
            <p>{t("vuoto.testoPagina")}</p>
            <Link href={conFiltro({})} className="mt-3 inline-block text-accent-strong underline-offset-4 hover:underline">
              {t("vuoto.tornaInizio")}
            </Link>
          </StatoVuoto>
        ) : filtro ? (
          <StatoVuoto titolo={t("vuoto.titoloCasella")}>
            <p>{t("vuoto.testoCasella")}</p>
            <Link href="/mail" className="mt-3 inline-block text-accent-strong underline-offset-4 hover:underline">
              {t("filtro.tutte")}
            </Link>
          </StatoVuoto>
        ) : (
          <StatoVuoto titolo={t("vuoto.titolo")}>{t("vuoto.testo")}</StatoVuoto>
        )
      ) : (
        <Scheda className="overflow-hidden">
          <ul aria-label={t("elenco.etichetta")} className="divide-y divide-border">
            {elenco.email.map((email) => (
              <RigaEmail key={email.id} email={email} mostraCasella={mostraCasella} />
            ))}
          </ul>
        </Scheda>
      )}

      {prima || elenco.cursore ? (
        <nav aria-label={t("elenco.paginazione")} className="mt-5 flex flex-wrap items-center justify-between gap-3">
          {prima ? (
            <Link href={conFiltro({})} className={classiPulsante("secondario", "sm")}>
              <ChevronLeft className="size-4" aria-hidden />
              {t("elenco.piuRecenti")}
            </Link>
          ) : (
            <span />
          )}
          {elenco.cursore ? (
            <Link href={conFiltro({ prima: elenco.cursore })} className={classiPulsante("secondario", "sm")}>
              {t("elenco.piuVecchie")}
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
