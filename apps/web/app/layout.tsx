import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { ProviderTema } from "@/components/provider-tema";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-app", display: "swap" });

export const metadata: Metadata = {
  title: "Emails Companion",
  description: "An AI-first mail client centred on what you need to do.",
  robots: { index: false, follow: false },
};

export default async function LayoutRadice({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang={locale} suppressHydrationWarning className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-dvh font-sans">
        <ProviderTema nonce={nonce}>
          <NextIntlClientProvider>{children}</NextIntlClientProvider>
        </ProviderTema>
      </body>
    </html>
  );
}
