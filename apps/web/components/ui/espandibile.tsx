import { ChevronRight } from "lucide-react";
import { cn } from "./cn";

/**
 * Dettagli a richiesta: un `<details>` con una riga di riepilogo e una freccia. Serve a tenere chiusi i
 * contenuti secondari (correzioni, cronologia, metadati) senza toglierli dalla pagina. Il gruppo ha un nome,
 * così la freccia di un Espandibile annidato non ruota insieme a quella esterna.
 */
export function Espandibile({
  titolo,
  children,
  aperto,
  className,
  classeContenuto,
}: {
  titolo: React.ReactNode;
  children: React.ReactNode;
  aperto?: boolean;
  className?: string;
  classeContenuto?: string;
}) {
  return (
    <details open={aperto} className={cn("group/espandibile", className)}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md text-sm text-text-muted select-none hover:text-text [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 shrink-0 transition-transform group-open/espandibile:rotate-90" aria-hidden />
        {titolo}
      </summary>
      <div className={cn("mt-3", classeContenuto)}>{children}</div>
    </details>
  );
}
