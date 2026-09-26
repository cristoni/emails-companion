import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const intestazioniStatiche = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

const config: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  outputFileTracingIncludes: { "/*": ["./messages/**/*.json"] },
  serverExternalPackages: ["pg", "graphile-worker", "eld", "@google-cloud/pubsub"],
  async headers() {
    return [{ source: "/:percorso*", headers: intestazioniStatiche }];
  },
};

export default createNextIntlPlugin("./i18n/request.ts")(config);
