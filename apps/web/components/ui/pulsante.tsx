import { cn } from "./cn";

const VARIANTI = {
  primario: "bg-accent-strong text-accent-contrast hover:bg-accent shadow-[var(--shadow-card)]",
  secondario: "border border-border bg-surface-raised text-text hover:bg-surface-muted",
  fantasma: "text-text-muted hover:bg-surface-muted hover:text-text",
  pericolo: "border border-danger/40 bg-danger-soft text-danger hover:border-danger",
} as const;

const DIMENSIONI = { sm: "h-9 px-3 text-sm sm:h-8", md: "h-9 px-4 text-sm", lg: "h-11 px-5" } as const;

export type VariantePulsante = keyof typeof VARIANTI;

/**
 * Classi di un pulsante (anche per i link con l'aspetto di pulsante). `aria-disabled` ha lo stesso aspetto di
 * `disabled` ma, a differenza di questo, non toglie il fuoco al pulsante: va usato per gli stati passeggeri
 * (un'azione in corso), insieme a un `onClick` che blocca il clic; `disabled` resta per gli stati duraturi.
 */
export function classiPulsante(variante: VariantePulsante = "secondario", dimensione: keyof typeof DIMENSIONI = "md") {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    VARIANTI[variante],
    DIMENSIONI[dimensione],
  );
}

export function Pulsante({
  variante = "secondario",
  dimensione = "md",
  className,
  ...props
}: React.ComponentProps<"button"> & { variante?: VariantePulsante; dimensione?: keyof typeof DIMENSIONI }) {
  return <button type="button" className={cn(classiPulsante(variante, dimensione), className)} {...props} />;
}
