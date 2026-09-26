import { cn } from "./cn";

const TONI = {
  accento: "bg-accent-soft text-accent-strong",
  urgente: "bg-urgent-soft text-urgent",
  risposta: "bg-reply-soft text-reply",
  proposta: "bg-suggestion-soft text-suggestion border border-dashed border-border-strong",
  neutro: "bg-surface-muted text-text-muted border border-border",
  pericolo: "bg-danger-soft text-danger",
} as const;

export type TonoDistintivo = keyof typeof TONI;

/** Distintivo a pillola. Il significato è sempre anche nel testo o nell'icona, mai solo nel colore. */
export function Distintivo({ tono = "neutro", icona, children, className }: { tono?: TonoDistintivo; icona?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONI[tono], className)}>
      {icona}
      {children}
    </span>
  );
}
