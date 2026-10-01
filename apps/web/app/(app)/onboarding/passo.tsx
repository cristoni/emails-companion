import { CheckCircle2, ChevronDown, Sparkles } from "lucide-react";
import { Distintivo } from "@/components/ui/distintivo";
import { cn } from "@/components/ui/cn";

/**
 * Stato di un passo dell'onboarding: `fatto` (chiuso su una riga di riepilogo), `attuale` (il primo passo
 * obbligatorio da completare, l'unico aperto), `dopo` (obbligatorio, non ancora raggiungibile) e
 * `facoltativo` (il Contesto AI: chiuso, non blocca nulla e non conta nel progresso).
 */
export type StatoPasso = "fatto" | "attuale" | "dopo" | "facoltativo";

/**
 * Segno a sinistra del passo: spunta se completato, altrimenti il numero; il passo facoltativo non ha numero
 * (non conta nel progresso), solo un'icona neutra in un cerchio tratteggiato.
 */
function Marcatore({ numero, stato, completato }: { numero?: number; stato: StatoPasso; completato: boolean }) {
  if (completato) return <CheckCircle2 className="size-6 shrink-0 text-accent-strong" aria-hidden />;
  if (stato === "facoltativo" || numero === undefined) {
    return (
      <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full border border-dashed border-border-strong text-text-muted">
        <Sparkles className="size-3.5" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums",
        stato === "attuale" ? "bg-accent-strong text-accent-contrast" : "border border-border text-text-muted",
      )}
    >
      {numero}
    </span>
  );
}

/**
 * Passo numerato in un elenco ordinato. Il passo attuale è aperto; gli altri, se hanno un contenuto, sono un
 * `<details>` chiuso la cui riga mostra titolo e riepilogo (sempre visibili) e si apre su moduli e testi
 * originali, che restano nella pagina.
 */
export function Passo({
  numero,
  stato,
  completato = stato === "fatto",
  titolo,
  riepilogo,
  facoltativo,
  apri,
  etichette,
  children,
}: {
  /** Numero del passo obbligatorio; il passo facoltativo non ne ha. */
  numero?: number;
  stato: StatoPasso;
  /** Per il passo facoltativo: già personalizzato. */
  completato?: boolean;
  titolo: string;
  riepilogo?: React.ReactNode;
  /** Etichetta del distintivo "Facoltativo", se il passo lo è. */
  facoltativo?: string;
  /** Testo del comando che apre un passo chiuso ("Modifica", "Rivedi"…). */
  apri?: string;
  /** Testi per i lettori di schermo dello stato del passo. */
  etichette: { fatto: string; daFare: string };
  children?: React.ReactNode;
}) {
  const intestazione = (
    <div className="min-w-0 flex-1 space-y-0.5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className={cn("text-[15px]", stato === "dopo" && "text-text-muted")}>{titolo}</h2>
        <span className="sr-only">({completato ? etichette.fatto : etichette.daFare})</span>
        {facoltativo ? <Distintivo tono="neutro">{facoltativo}</Distintivo> : null}
      </div>
      {riepilogo ? <p className="text-sm text-text-muted">{riepilogo}</p> : null}
    </div>
  );

  if (stato === "attuale" || !children) {
    return (
      <li aria-current={stato === "attuale" ? "step" : undefined} className="flex gap-3 px-4 py-4 sm:px-5">
        <Marcatore numero={numero} stato={stato} completato={completato} />
        <div className="min-w-0 flex-1 space-y-3">
          {intestazione}
          {children ? <div className="space-y-3 text-sm">{children}</div> : null}
        </div>
      </li>
    );
  }

  return (
    <li className="px-4 py-4 sm:px-5">
      <details className="group/passo">
        <summary className="flex cursor-pointer list-none items-start gap-3 select-none [&::-webkit-details-marker]:hidden">
          <Marcatore numero={numero} stato={stato} completato={completato} />
          {intestazione}
          {apri ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 pt-0.5 text-xs font-medium text-accent-strong">
              {apri}
              <ChevronDown className="size-3.5 transition-transform group-open/passo:rotate-180" aria-hidden />
            </span>
          ) : null}
        </summary>
        <div className="mt-3 space-y-3 text-sm sm:pl-9">{children}</div>
      </details>
    </li>
  );
}
