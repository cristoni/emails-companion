import { getTranslations } from "next-intl/server";
import { BarraLaterale } from "@/components/barra-laterale";
import { AggiornamentoAutomatico } from "@/components/aggiornamento-automatico";
import { richiediUtente } from "@/lib/server/sessione";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const utente = await richiediUtente();
  const t = await getTranslations("navigazione");
  return (
    <div className="flex min-h-dvh">
      <a
        href="#contenuto"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[60] focus:rounded-lg focus:bg-surface-raised focus:px-3 focus:py-2 focus:shadow-[var(--shadow-card)]"
      >
        {t("salta")}
      </a>
      <BarraLaterale
        email={utente.email}
        voci={[
          { href: "/", etichetta: t("home"), icona: "home" },
          { href: "/mail", etichetta: t("posta"), icona: "posta" },
          { href: "/news", etichetta: t("news"), icona: "news" },
        ]}
        vociSistema={[
          { href: "/status", etichetta: t("stato"), icona: "stato" },
          { href: "/settings", etichetta: t("impostazioni"), icona: "impostazioni" },
        ]}
        etichette={{ esci: t("esci"), temaScuro: t("temaScuro"), temaChiaro: t("temaChiaro"), menu: t("menu"), chiudi: t("chiudi"), navigazione: t("navigazione") }}
      />
      <main id="contenuto" tabIndex={-1} className="min-w-0 flex-1 px-4 pt-20 pb-10 outline-none sm:px-8 lg:px-12 lg:pt-8">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
      <AggiornamentoAutomatico />
    </div>
  );
}
