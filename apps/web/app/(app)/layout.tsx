import { getTranslations } from "next-intl/server";
import { BarraLaterale } from "@/components/barra-laterale";
import { AggiornamentoAutomatico } from "@/components/aggiornamento-automatico";
import { richiediUtente } from "@/lib/server/sessione";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const utente = await richiediUtente();
  const t = await getTranslations("navigazione");
  return (
    <div className="flex min-h-dvh">
      <BarraLaterale
        email={utente.email}
        voci={[
          { href: "/", etichetta: t("home"), icona: "home" },
          { href: "/mail", etichetta: t("posta"), icona: "posta" },
          { href: "/news", etichetta: t("news"), icona: "news" },
          { href: "/status", etichetta: t("stato"), icona: "stato" },
          { href: "/settings", etichetta: t("impostazioni"), icona: "impostazioni" },
        ]}
        etichette={{ esci: t("esci"), tema: t("tema"), menu: t("menu") }}
      />
      <main className="min-w-0 flex-1 px-4 pt-16 pb-6 sm:px-8 lg:px-12 lg:pt-6">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
      <AggiornamentoAutomatico />
    </div>
  );
}
