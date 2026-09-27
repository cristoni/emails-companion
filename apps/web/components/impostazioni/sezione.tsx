import { IntestazioneScheda, Scheda } from "@/components/ui/scheda";
import { cn } from "@/components/ui/cn";

/** Sezione delle impostazioni: una Scheda con ancora, raggiungibile da `/settings#<id>`. */
export function Sezione({
  id,
  titolo,
  descrizione,
  azioni,
  children,
  className,
}: {
  id: string;
  titolo: React.ReactNode;
  descrizione?: React.ReactNode;
  azioni?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titolo`} className="scroll-mt-6">
      <Scheda>
        <IntestazioneScheda titolo={<span id={`${id}-titolo`}>{titolo}</span>} descrizione={descrizione} azioni={azioni} />
        <div className={cn("space-y-5 px-5 py-5 text-sm", className)}>{children}</div>
      </Scheda>
    </section>
  );
}

/** Coppia etichetta/valore per i metadati di una voce (casella, chiave, modello). */
export function Dato({ etichetta, children, className }: { etichetta: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 space-y-0.5", className)}>
      <dt className="text-xs text-text-muted">{etichetta}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}
