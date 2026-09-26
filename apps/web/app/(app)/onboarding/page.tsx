import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { CheckCircle2, Circle } from "lucide-react";
import { DIRETTIVE_PREDEFINITE } from "@ec/ai";
import { caselle, impostazioni, sincronizzazione } from "@ec/db";
import { comeUtente } from "@/lib/server/sessione";
import { Avviso } from "@/components/ui/avviso";
import { classiPulsante } from "@/components/ui/pulsante";
import { IntestazionePagina } from "@/components/ui/pagina";
import { Scheda } from "@/components/ui/scheda";
import { decidiImportazioneAzione } from "./azioni";
import { ModuloChiave, ModuloContesto, PulsanteInformativa } from "./moduli";

export default async function PaginaOnboarding() {
  const t = await getTranslations("onboarding");
  const formato = await getFormatter();
  const dati = await comeUtente(async (ctx, dip) => {
    const elenco = await caselle.elenca(ctx);
    return {
      consenso: await impostazioni.haConsenso(ctx, dip.configurazione.versioneInformativa),
      chiave: await impostazioni.infoChiave(ctx),
      contesto: await impostazioni.contestoCorrente(ctx),
      caselle: await Promise.all(elenco.map(async (c) => ({ casella: c, sync: await sincronizzazione.leggi(ctx, c.id) }))),
    };
  });
  const chiaveOk = dati.chiave?.stato === "valida";
  const importazioniDecise = dati.caselle.every(({ sync }) => sync && !["da_stimare", "stimata"].includes(sync.faseImportazione));
  const completo = dati.consenso && chiaveOk && importazioniDecise;

  const Passo = ({ fatto, titolo, children }: { fatto: boolean; titolo: string; children: React.ReactNode }) => (
    <Scheda className="p-5">
      <div className="mb-3 flex items-center gap-2">
        {fatto ? <CheckCircle2 className="size-5 text-accent-strong" aria-label={t("fatto")} /> : <Circle className="size-5 text-text-muted" aria-label={t("daFare")} />}
        <h2 className="text-base">{titolo}</h2>
      </div>
      <div className="space-y-3 text-sm">{children}</div>
    </Scheda>
  );

  return (
    <div className="space-y-5">
      <IntestazionePagina titolo={t("titolo")} descrizione={t("descrizione")} />

      <Passo fatto={dati.consenso} titolo={t("informativa.titolo")}>
        <ul className="list-disc space-y-1 pl-5 text-text-muted">
          <li>{t("informativa.dati")}</li>
          <li>{t("informativa.modelli")}</li>
          <li>{t("informativa.conservazione")}</li>
          <li>{t("informativa.limitedUse")}</li>
        </ul>
        <Link href="/privacy" className="text-accent-strong underline-offset-4 hover:underline">
          {t("informativa.completa")}
        </Link>
        {dati.consenso ? <p className="text-text-muted">{t("informativa.accettata")}</p> : <PulsanteInformativa etichetta={t("informativa.accetta")} />}
      </Passo>

      <Passo fatto={chiaveOk} titolo={t("chiave.titolo")}>
        <p className="text-text-muted">{t("chiave.spiegazione")}</p>
        {dati.chiave ? (
          <p className="font-mono text-xs text-text-muted">
            {t("chiave.salvata", { cifre: dati.chiave.ultimeCifre, stato: t(`chiave.stati.${dati.chiave.stato}`) })}
          </p>
        ) : null}
        <ModuloChiave />
      </Passo>

      <Passo fatto={Boolean(dati.contesto)} titolo={t("contesto.titolo")}>
        <p className="text-text-muted">{t("contesto.spiegazione")}</p>
        <ModuloContesto iniziale={dati.contesto?.testo ?? DIRETTIVE_PREDEFINITE} />
      </Passo>

      <Passo fatto={importazioniDecise && dati.caselle.length > 0} titolo={t("importazione.titolo")}>
        <p className="text-text-muted">{t("importazione.spiegazione")}</p>
        {dati.caselle.length === 0 ? <Avviso tono="attenzione" titolo={t("importazione.nessunaCasella")} /> : null}
        {dati.caselle.map(({ casella, sync }) => (
          <div key={casella.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
            <div>
              <p className="font-mono text-xs">{casella.indirizzo}</p>
              <p className="text-text-muted">
                {sync?.faseImportazione === "stimata" && sync.stima
                  ? t("importazione.stima", {
                      numero: sync.stima.numeroEmail,
                      costo: formato.number(sync.stima.costoStimato, { style: "currency", currency: "USD", maximumFractionDigits: 2 }),
                    })
                  : t(`importazione.fasi.${sync?.faseImportazione ?? "da_stimare"}`)}
              </p>
            </div>
            {sync?.faseImportazione === "stimata" || sync?.faseImportazione === "rifiutata" ? (
              <form action={decidiImportazioneAzione} className="flex gap-2">
                <input type="hidden" name="casella" value={casella.id} />
                <button name="scelta" value="conferma" className={classiPulsante("primario", "sm")} disabled={!chiaveOk || !dati.consenso}>
                  {t("importazione.conferma")}
                </button>
                {sync.faseImportazione === "stimata" ? (
                  <button name="scelta" value="rinvia" className={classiPulsante("secondario", "sm")}>
                    {t("importazione.rinvia")}
                  </button>
                ) : null}
              </form>
            ) : null}
            {casella.stato !== "collegata" ? (
              <a href={`/api/caselle/google/avvia?casella=${casella.id}`} className={classiPulsante("secondario", "sm")}>
                {t("importazione.autorizza")}
              </a>
            ) : null}
          </div>
        ))}
      </Passo>

      <div className="flex justify-end">
        <Link href="/" aria-disabled={!completo} className={classiPulsante(completo ? "primario" : "secondario")}>
          {completo ? t("vaiHome") : t("vaiHomeComunque")}
        </Link>
      </div>
    </div>
  );
}
