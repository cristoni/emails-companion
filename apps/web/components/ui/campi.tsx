import { cn } from "./cn";

/** I campi hanno un bordo più marcato delle schede (`border-input`), così si riconoscono come campi da compilare. */
const BASE = "w-full rounded-lg border border-border-input bg-surface px-3 py-2 text-sm placeholder:text-text-muted focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30";

export function Etichetta({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-medium", className)} {...props} />;
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(BASE, "h-9", className)} {...props} />;
}

/** Area di testo in sans, adatta a testo da leggere (bozze, direttive); `codice` usa il monospazio. */
export function AreaTesto({ className, codice = false, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { codice?: boolean }) {
  return <textarea className={cn(BASE, "min-h-32 text-sm leading-relaxed", codice && "font-mono text-[13px]", className)} {...props} />;
}

export function Selezione({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(BASE, "h-9", className)} {...props} />;
}

export function Aiuto({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-xs text-text-muted", className)} {...props} />;
}
