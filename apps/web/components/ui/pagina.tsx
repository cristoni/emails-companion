export function IntestazionePagina({ titolo, descrizione, azioni }: { titolo: React.ReactNode; descrizione?: React.ReactNode; azioni?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
      <div className="space-y-1">
        <h1 className="text-2xl">{titolo}</h1>
        {descrizione ? <p className="text-sm text-text-muted">{descrizione}</p> : null}
      </div>
      {azioni ? <div className="flex items-center gap-2">{azioni}</div> : null}
    </header>
  );
}

/**
 * Stato vuoto. `compatto` è una sola riga attenuata, per le sezioni secondarie in cui l'assenza non è una
 * notizia; la versione piena, con il bagliore d'accento, resta per i casi in cui l'assenza conta.
 */
export function StatoVuoto({ titolo, children, compatto = false }: { titolo: React.ReactNode; children?: React.ReactNode; compatto?: boolean }) {
  if (compatto) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-text-muted">
        {titolo}
        {children ? <span className="block text-xs">{children}</span> : null}
      </p>
    );
  }
  return (
    <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-dashed border-border px-6 py-10 text-center">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-[radial-gradient(ellipse_at_center,var(--color-accent-soft),transparent_70%)]" />
      <p className="relative font-medium">{titolo}</p>
      {children ? <div className="relative mt-1 text-sm text-text-muted">{children}</div> : null}
    </div>
  );
}
