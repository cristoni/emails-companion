"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Activity, Home, Inbox, LogOut, Menu, Moon, Newspaper, Settings, Sun, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/components/ui/cn";

const ICONE = { home: Home, posta: Inbox, news: Newspaper, stato: Activity, impostazioni: Settings } as const;

type Voce = { href: string; etichetta: string; icona: keyof typeof ICONE };

function Marchio({ onClick }: { onClick?: () => void }) {
  return (
    <Link href="/" onClick={onClick} className="flex items-center gap-2 rounded-md font-semibold tracking-tight">
      <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-accent-strong text-[11px] font-bold text-accent-contrast">
        EC
      </span>
      Emails Companion
    </Link>
  );
}

/**
 * Navigazione dell'app: barra laterale fissa da `lg` in su; sotto, una barra superiore con il marchio e un
 * menu a scomparsa con sfondo oscurato, che si chiude con Esc, con un clic fuori o scegliendo una voce.
 * Le voci principali (le viste sulla posta) stanno in alto; stato e impostazioni in basso, vicino all'account.
 */
export function BarraLaterale({
  email,
  voci,
  vociSistema,
  etichette,
}: {
  email: string;
  voci: Voce[];
  vociSistema: Voce[];
  etichette: { esci: string; tema: string; menu: string; chiudi: string; navigazione: string };
}) {
  const percorso = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [aperta, setAperta] = useState(false);
  const attiva = (href: string) => (href === "/" ? percorso === "/" || percorso.startsWith("/situations") : percorso.startsWith(href));
  const chiudi = () => setAperta(false);

  useEffect(() => {
    if (!aperta) return;
    const suTasto = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAperta(false);
    };
    window.addEventListener("keydown", suTasto);
    return () => window.removeEventListener("keydown", suTasto);
  }, [aperta]);

  const voce = (v: Voce) => {
    const Icona = ICONE[v.icona];
    const corrente = attiva(v.href);
    return (
      <Link
        key={v.href}
        href={v.href}
        onClick={chiudi}
        aria-current={corrente ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
          corrente ? "bg-accent-soft font-medium text-accent-strong" : "text-text-muted hover:bg-surface hover:text-text",
        )}
      >
        <Icona className="size-4" aria-hidden />
        {v.etichetta}
      </Link>
    );
  };

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur lg:hidden">
        <button
          type="button"
          aria-label={etichette.menu}
          aria-expanded={aperta}
          aria-controls="barra-laterale"
          onClick={() => setAperta(true)}
          className="-ml-1 rounded-lg p-2 text-text-muted hover:bg-surface-muted hover:text-text"
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <Marchio />
      </header>

      {aperta ? <div aria-hidden className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={chiudi} /> : null}

      <aside
        id="barra-laterale"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-surface-muted px-3 py-5 transition-transform lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:translate-x-0",
          aperta ? "translate-x-0 shadow-xl lg:shadow-none" : "-translate-x-full",
        )}
      >
        <div className="mb-6 flex items-center justify-between px-3">
          <Marchio onClick={chiudi} />
          <button type="button" aria-label={etichette.chiudi} onClick={chiudi} className="rounded-lg p-1.5 text-text-muted hover:bg-surface hover:text-text lg:hidden">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <nav aria-label={etichette.navigazione} className="flex flex-1 flex-col justify-between gap-6">
          <div className="flex flex-col gap-0.5">{voci.map(voce)}</div>
          <div className="flex flex-col gap-0.5">{vociSistema.map(voce)}</div>
        </nav>
        <div className="mt-3 space-y-1 border-t border-border pt-3">
          <p className="flex items-center gap-2.5 px-3 py-1.5 text-sm" title={email}>
            <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold uppercase text-accent-strong">
              {email.slice(0, 1)}
            </span>
            <span className="truncate text-text-muted">{email}</span>
          </p>
          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-muted hover:bg-surface hover:text-text"
          >
            {/* Icona decisa dal CSS: il server non conosce il tema, e un'icona scelta in render causerebbe un errore di idratazione. */}
            <Sun className="hidden size-4 dark:block" aria-hidden />
            <Moon className="size-4 dark:hidden" aria-hidden />
            {etichette.tema}
          </button>
          <button
            type="button"
            onClick={async () => {
              await authClient.signOut();
              router.push("/sign-in");
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-muted hover:bg-surface hover:text-text"
          >
            <LogOut className="size-4" aria-hidden />
            {etichette.esci}
          </button>
        </div>
      </aside>
    </>
  );
}
