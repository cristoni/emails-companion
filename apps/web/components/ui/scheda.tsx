import { cn } from "./cn";

export function Scheda({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-card)] border border-border bg-surface-raised shadow-[var(--shadow-card)]", className)} {...props} />;
}

export function IntestazioneScheda({ titolo, descrizione, azioni }: { titolo: React.ReactNode; descrizione?: React.ReactNode; azioni?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
      <div className="min-w-0 space-y-1">
        <h2 className="text-base">{titolo}</h2>
        {descrizione ? <p className="text-sm text-text-muted">{descrizione}</p> : null}
      </div>
      {azioni ? <div className="flex shrink-0 items-center gap-2">{azioni}</div> : null}
    </div>
  );
}
