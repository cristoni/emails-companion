import { cn } from "./cn";

const VARIANTI = {
  primario: "bg-accent-strong text-accent-contrast hover:bg-accent shadow-[var(--shadow-card)]",
  secondario: "border border-border bg-surface-raised text-text hover:bg-surface-muted",
  fantasma: "text-text-muted hover:bg-surface-muted hover:text-text",
  pericolo: "border border-danger/40 bg-danger-soft text-danger hover:border-danger",
} as const;

const DIMENSIONI = { sm: "h-8 px-3 text-sm", md: "h-9 px-4 text-sm", lg: "h-11 px-5" } as const;

export type VariantePulsante = keyof typeof VARIANTI;

export function classiPulsante(variante: VariantePulsante = "secondario", dimensione: keyof typeof DIMENSIONI = "md") {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
    VARIANTI[variante],
    DIMENSIONI[dimensione],
  );
}

export function Pulsante({
  variante = "secondario",
  dimensione = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: VariantePulsante; dimensione?: keyof typeof DIMENSIONI }) {
  return <button type="button" className={cn(classiPulsante(variante, dimensione), className)} {...props} />;
}
