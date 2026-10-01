import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { DistintivoProposta } from "@/components/comuni/distintivi";
import { ModuloAzione } from "@/components/comuni/modulo-azione";
import { cn } from "@/components/ui/cn";
import { confermaElementoAzione, rifiutaCollegamentoAzione, rifiutaRispostaAzione, scartaElementoAzione } from "@/app/(app)/situations/[id]/azioni";

type TipoProposta = "attivita" | "attesa" | "risposta" | "collegamento";

/** Segno compatto della proposta, nella riga dei distintivi, quando la sua domanda sta altrove (la scheda in cima). */
export function SegnoProposta() {
  return (
    <span className="text-xs font-medium">
      <DistintivoProposta discreto />
    </span>
  );
}

/**
 * Proposta dell'AI non ancora confermata, detta come domanda: "Proposta AI: …?" con [Sì] e [No…]. Ogni
 * risposta è un'unica azione esistente: la conferma, oppure lo scarto o lo scollegamento con la loro richiesta
 * di conferma. Prende il posto del distintivo "Proposta AI" dell'elemento (un solo segno dell'AI per elemento)
 * e non è mai il pulsante principale: il lavoro vero resta nella scheda "Prossima azione".
 */
export function StrisciaProposta({
  tipo,
  id,
  chiusa = false,
  luogo = "scheda",
  perche,
  className,
}: {
  tipo: TipoProposta;
  id: string;
  /** Attesa già chiusa (soddisfatta o annullata): la domanda è al passato. */
  chiusa?: boolean;
  /** La stessa proposta compare una sola volta, ma l'id della domanda deve restare unico nella pagina. */
  luogo?: "prossima" | "scheda";
  /** Link "Perché?" della proposta, accanto alla domanda quando l'elemento non ha una riga di distintivi. */
  perche?: React.ReactNode;
  className?: string;
}) {
  const t = useTranslations("situazione.proposta");
  const tc = useTranslations("comuni");
  const domandaId = `proposta-${luogo}-${tipo}-${id}`;
  return (
    <div
      role="group"
      aria-labelledby={domandaId}
      className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg bg-suggestion-soft px-3 py-2 text-sm", className)}
    >
      <p className="flex min-w-0 items-center gap-1.5" title={tc("propostaAiuto")}>
        <Sparkles className="size-3.5 shrink-0 text-suggestion" aria-hidden />
        <span id={domandaId}>{t(chiusa && tipo === "attesa" ? "domande.attesaChiusa" : `domande.${tipo}`)}</span>
        {perche}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <ModuloAzione azione={confermaElementoAzione} campi={{ tipo, id }} etichetta={t("si")} />
        <No tipo={tipo} id={id} />
      </div>
    </div>
  );
}

/** "No": scarta l'attività o l'Attesa, oppure scollega la risposta o l'email, sempre dopo una conferma. */
function No({ tipo, id }: { tipo: TipoProposta; id: string }) {
  const t = useTranslations("situazione.proposta.no");
  const ta = useTranslations("situazione.attivita");
  const tt = useTranslations("situazione.attese");
  const tr = useTranslations("situazione.risposte");
  const tl = useTranslations("situazione.collegamenti");
  switch (tipo) {
    case "attivita":
      return (
        <ModuloAzione
          azione={scartaElementoAzione}
          campi={{ tipo, id }}
          etichetta={t(tipo)}
          conferma={{ domanda: ta("scartaDomanda"), etichetta: ta("scartaConferma") }}
        />
      );
    case "attesa":
      return (
        <ModuloAzione
          azione={scartaElementoAzione}
          campi={{ tipo, id }}
          etichetta={t(tipo)}
          conferma={{ domanda: tt("scartaDomanda"), etichetta: tt("scartaConferma") }}
        />
      );
    case "risposta":
      return (
        <ModuloAzione
          azione={rifiutaRispostaAzione}
          campi={{ risposta: id }}
          etichetta={t(tipo)}
          conferma={{ domanda: tr("rifiutaDomanda"), etichetta: tr("rifiutaConferma") }}
        />
      );
    case "collegamento":
      return (
        <ModuloAzione
          azione={rifiutaCollegamentoAzione}
          campi={{ collegamento: id }}
          etichetta={t(tipo)}
          conferma={{ domanda: tl("rifiutaDomanda"), etichetta: tl("rifiutaConferma") }}
        />
      );
  }
}
