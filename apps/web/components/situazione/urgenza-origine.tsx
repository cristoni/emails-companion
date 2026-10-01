import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import type { UrgenzaEmailOrigineDto } from "@ec/applicazione";
import { DistintivoBase } from "@/components/comuni/distintivi";
import { ElencoEvidenze, LinkEmail } from "@/components/comuni/evidenze";
import { ModuloAzione } from "@/components/comuni/modulo-azione";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { cn } from "@/components/ui/cn";
import { CLASSE_LINK_AZIONE } from "@/components/ui/collegamento";
import { Espandibile } from "@/components/ui/espandibile";
import { cambiaUrgenzaAzione } from "@/app/(app)/situations/[id]/azioni";
import { AREA_TOCCO, LinkPerche, linguaDi, PulsanteAnnulla, type ContestoDettaglio } from "./comuni";

/**
 * Urgenza non corretta e non urgente: lo stato normale di un'email, che non merita una riga. Basta il
 * pulsante "Segna come urgente" accanto ai link dell'email.
 */
export function urgenzaPredefinita(urgenza: UrgenzaEmailOrigineDto): boolean {
  return !urgenza.urgente && urgenza.correzioni.length === 0;
}

/** "Segna come urgente", compatto, per un'email che né l'AI né l'utente considerano urgente. */
export function SegnaUrgente({ emailId }: { emailId: string }) {
  const t = useTranslations("situazione.urgenzaOrigine");
  return (
    <ModuloAzione
      azione={cambiaUrgenzaAzione}
      campi={{ email: emailId, urgente: "si" }}
      variante="fantasma"
      etichetta={
        <>
          <AlertTriangle className="size-3.5" aria-hidden />
          {t("segna")}
        </>
      }
    />
  );
}

/**
 * Urgenza di un'email della Situazione, a richiesta: giudizio dell'AI con base, motivazione ed evidenze, la
 * correzione (segna come urgente o non urgente) e l'annullamento. Nella scheda "Prossima azione" si apre con
 * "È davvero urgente?" quando è quell'email a rendere urgente la Situazione; altrove sta, compatta, sulla
 * scheda dell'email, e solo quando non è lo stato normale (urgente, o corretta dall'utente).
 */
export function UrgenzaOrigine({
  origine,
  contesto,
  verifica = false,
  oggetto,
}: {
  origine: UrgenzaEmailOrigineDto;
  contesto: ContestoDettaglio;
  /** Forma della scheda "Prossima azione": la domanda al posto del valore. */
  verifica?: boolean;
  /** Oggetto dell'email, quando non è quella d'origine: dice quale email si sta verificando. */
  oggetto?: string;
}) {
  const t = useTranslations("situazione.urgenzaOrigine");
  const corretta = origine.correzioni.length > 0;
  const valore = origine.urgente ? t("urgente") : t("nonUrgente");
  const titolo = verifica ? t("verifica") : corretta ? t("riepilogoUtente", { valore }) : t("riepilogo", { valore });
  // Nella verifica l'urgenza è appena stata detta: il giudizio dell'AI si ripete solo se non coincide.
  const giudizioAi = verifica && origine.urgenteAi === true ? null : origine.urgenteAi === null ? t("nonClassificata") : origine.urgenteAi ? t("aiUrgente") : t("aiNonUrgente");
  return (
    <Espandibile titolo={titolo} className="text-sm" classeContenuto="mt-2 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2 text-text-muted">
        {oggetto !== undefined ? (
          <LinkEmail emailId={origine.emailId} className={cn(CLASSE_LINK_AZIONE, AREA_TOCCO)}>
            <TestoSemplice come="span" testo={oggetto || "—"} lingua={linguaDi(contesto, origine.emailId)} />
          </LinkEmail>
        ) : null}
        {giudizioAi ? <span>{giudizioAi}</span> : null}
        {origine.urgenteAi && origine.base ? <DistintivoBase base={origine.base} /> : null}
        <LinkPerche analisiId={origine.analisiId} contesto={contesto} />
      </div>
      {origine.motivazione ? <TestoSemplice come="p" testo={origine.motivazione} lingua={linguaDi(contesto, origine.emailId)} /> : null}
      {origine.urgenteAi ? <ElencoEvidenze evidenze={origine.evidenze} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        {corretta ? <span className="text-text-muted">{origine.urgente ? t("correttaUrgente") : t("correttaNonUrgente")}</span> : null}
        <ModuloAzione
          azione={cambiaUrgenzaAzione}
          campi={{ email: origine.emailId, urgente: origine.urgente ? "no" : "si" }}
          etichetta={origine.urgente ? t("togli") : t("segna")}
        />
        <PulsanteAnnulla correzioni={origine.correzioni.map((c) => c.id)} />
      </div>
    </Espandibile>
  );
}
