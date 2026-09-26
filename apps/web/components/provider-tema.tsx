"use client";

import { ThemeProvider } from "next-themes";

export function ProviderTema({ children, nonce }: { children: React.ReactNode; nonce: string | undefined }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange {...(nonce ? { nonce } : {})}>
      {children}
    </ThemeProvider>
  );
}
