"use client";

import { ThemeProvider } from "next-themes";

/** Il tema salvato nelle impostazioni vale come predefinito; la scelta fatta su questo browser resta prioritaria. */
export function ProviderTema({ children, nonce, tema = "system" }: { children: React.ReactNode; nonce: string | undefined; tema?: "system" | "light" | "dark" }) {
  return (
    <ThemeProvider attribute="class" defaultTheme={tema} enableSystem disableTransitionOnChange {...(nonce ? { nonce } : {})}>
      {children}
    </ThemeProvider>
  );
}
