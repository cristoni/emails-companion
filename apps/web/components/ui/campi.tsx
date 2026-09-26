import { cn } from "./cn";

const BASE = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-text-muted focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30";

export function Etichetta({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-medium", className)} {...props} />;
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(BASE, "h-9", className)} {...props} />;
}

export function AreaTesto({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(BASE, "min-h-32 font-mono text-[13px] leading-relaxed", className)} {...props} />;
}

export function Selezione({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(BASE, "h-9", className)} {...props} />;
}

export function Aiuto({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-xs text-text-muted", className)} {...props} />;
}
