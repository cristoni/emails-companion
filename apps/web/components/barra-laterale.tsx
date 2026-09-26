"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useState } from "react";
import { Activity, Home, Inbox, LogOut, Menu, Moon, Newspaper, Settings, Sun } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/components/ui/cn";

const ICONE = { home: Home, posta: Inbox, news: Newspaper, stato: Activity, impostazioni: Settings } as const;

export function BarraLaterale({
  email,
  voci,
  etichette,
}: {
  email: string;
  voci: { href: string; etichetta: string; icona: keyof typeof ICONE }[];
  etichette: { esci: string; tema: string; menu: string };
}) {
  const percorso = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [aperta, setAperta] = useState(false);
  const attiva = (href: string) => (href === "/" ? percorso === "/" || percorso.startsWith("/situations") : percorso.startsWith(href));

  return (
    <>
      <button
        type="button"
        aria-label={etichette.menu}
        onClick={() => setAperta((v) => !v)}
        className="fixed left-3 top-3 z-40 rounded-lg border border-border bg-surface-raised p-2 lg:hidden"
      >
        <Menu className="size-4" />
      </button>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-border bg-surface-muted px-3 py-5 transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0",
          aperta ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Link href="/" className="mb-6 flex items-center gap-2 px-3 font-semibold tracking-tight">
          <span aria-hidden className="grid size-6 place-items-center rounded-md bg-accent-strong text-[11px] font-bold text-accent-contrast">EC</span>
          Emails Companion
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5">
          {voci.map((v) => {
            const Icona = ICONE[v.icona];
            return (
              <Link
                key={v.href}
                href={v.href}
                onClick={() => setAperta(false)}
                aria-current={attiva(v.href) ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  attiva(v.href) ? "bg-accent-soft font-medium text-accent-strong" : "text-text-muted hover:bg-surface hover:text-text",
                )}
              >
                <Icona className="size-4" aria-hidden />
                {v.etichetta}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-1 border-t border-border pt-3">
          <p className="truncate px-3 font-mono text-xs text-text-muted" title={email}>
            {email}
          </p>
          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-muted hover:bg-surface hover:text-text"
          >
            {resolvedTheme === "dark" ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
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
