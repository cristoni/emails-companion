import { AlertTriangle, CheckCircle2, CircleAlert, Info } from "lucide-react";
import { cn } from "./cn";

const TONI = {
  info: { classi: "border-border bg-surface-muted text-text", icona: Info, colore: "text-text-muted" },
  attenzione: { classi: "border-urgent/30 bg-urgent-soft text-text", icona: AlertTriangle, colore: "text-urgent" },
  errore: { classi: "border-danger/30 bg-danger-soft text-text", icona: CircleAlert, colore: "text-danger" },
  successo: { classi: "border-accent/30 bg-accent-soft text-text", icona: CheckCircle2, colore: "text-accent-strong" },
} as const;

/** Avviso con icona di tono (il significato non è affidato al solo colore); su schermi stretti l'azione va a capo sotto il testo. */
export function Avviso({ tono = "info", titolo, children, azione }: { tono?: keyof typeof TONI; titolo: React.ReactNode; children?: React.ReactNode; azione?: React.ReactNode }) {
  const { classi, icona: Icona, colore } = TONI[tono];
  return (
    <div
      role={tono === "errore" ? "alert" : "status"}
      className={cn("flex flex-col gap-3 rounded-lg border px-4 py-3 text-sm sm:flex-row sm:items-start sm:justify-between", classi)}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <Icona className={cn("mt-0.5 size-4 shrink-0", colore)} aria-hidden />
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium">{titolo}</p>
          {children ? <div className="text-text-muted">{children}</div> : null}
        </div>
      </div>
      {azione ? <div className="shrink-0 pl-6.5 sm:pl-0">{azione}</div> : null}
    </div>
  );
}
