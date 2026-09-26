import { cn } from "./cn";

const TONI = {
  info: "border-border bg-surface-muted text-text",
  attenzione: "border-urgent/30 bg-urgent-soft text-text",
  errore: "border-danger/30 bg-danger-soft text-text",
  successo: "border-accent/30 bg-accent-soft text-text",
} as const;

export function Avviso({ tono = "info", titolo, children, azione }: { tono?: keyof typeof TONI; titolo: React.ReactNode; children?: React.ReactNode; azione?: React.ReactNode }) {
  return (
    <div role={tono === "errore" ? "alert" : "status"} className={cn("flex items-start justify-between gap-4 rounded-lg border px-4 py-3 text-sm", TONI[tono])}>
      <div className="space-y-0.5">
        <p className="font-medium">{titolo}</p>
        {children ? <div className="text-text-muted">{children}</div> : null}
      </div>
      {azione ? <div className="shrink-0">{azione}</div> : null}
    </div>
  );
}
