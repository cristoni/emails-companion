import { cn } from "./cn";

const TONI = {
  accento: "bg-accent-soft text-text [&>svg]:text-accent-strong",
  urgente: "bg-urgent-soft text-urgent",
  risposta: "bg-reply-soft text-reply",
  proposta: "bg-suggestion-soft text-suggestion border-dashed border-border-strong",
  neutro: "bg-surface-muted text-text-muted border-border",
  pericolo: "bg-danger-soft text-danger",
} as const;

export type TonoDistintivo = keyof typeof TONI;

/**
 * Distintivo a pillola. Il significato è sempre anche nel testo o nell'icona, mai solo nel colore. Il testo
 * blu è riservato a ciò che si clicca: il tono `accento` (stati positivi) colora solo l'icona. Ogni tono ha
 * un bordo di 1px (trasparente dove non serve), così pillole di toni diversi hanno la stessa altezza.
 */
export function Distintivo({ tono = "neutro", icona, children, className }: { tono?: TonoDistintivo; icona?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONI[tono], className)}>
      {icona}
      {children}
    </span>
  );
}
