import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "./cn";

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

/**
 * Link di ritorno in cima a una pagina di dettaglio, uguale ovunque: freccia e nome della destinazione
 * ("Home", "Posta", "Situazione"), testo attenuato, alto 36px. `onClick` serve a chi vuole tornare con la
 * cronologia del browser (per esempio l'informativa) e va passato solo da un componente client.
 */
export function LinkIndietro({
  href,
  children,
  onClick,
  className,
}: {
  href: string;
  children: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  className?: string;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn("-ml-1 inline-flex h-9 items-center gap-1.5 rounded-lg px-1 text-sm text-text-muted underline-offset-4 hover:text-text hover:underline", className)}
    >
      <ArrowLeft className="size-4 shrink-0" aria-hidden />
      {children}
    </Link>
  );
}

/**
 * Conteggio a pillola accanto al titolo di una sezione. Con `etichetta` il numero a vista è nascosto ai
 * lettori di schermo, che leggono invece la frase completa (per esempio "3 situazioni").
 */
export function Conteggio({ numero, etichetta, className }: { numero: number; etichetta?: string; className?: string }) {
  return (
    <span className={cn("rounded-full border border-border bg-surface-muted px-1.5 text-xs font-medium tracking-normal text-text-muted tabular-nums", className)}>
      {etichetta ? (
        <>
          <span aria-hidden>{numero}</span>
          <span className="sr-only">{etichetta}</span>
        </>
      ) : (
        numero
      )}
    </span>
  );
}

/**
 * Titolo di una sezione di elenco, uguale su ogni pagina: "Titolo [n]" a 16px, con un'icona facoltativa
 * davanti. `id` va sul titolo, così la sezione può usarlo in `aria-labelledby`.
 */
export function IntestazioneSezione({
  id,
  titolo,
  conteggio,
  etichettaConteggio,
  icona,
  className,
  tabIndex,
}: {
  id?: string;
  titolo: React.ReactNode;
  conteggio?: number;
  /** Frase letta dai lettori di schermo al posto del numero (vedi `Conteggio`). */
  etichettaConteggio?: string;
  icona?: React.ReactNode;
  className?: string;
  tabIndex?: number;
}) {
  return (
    <h2 id={id} tabIndex={tabIndex} className={cn("flex items-center gap-2 text-base", className)}>
      {icona}
      {titolo}
      {conteggio !== undefined ? <Conteggio numero={conteggio} etichetta={etichettaConteggio} /> : null}
    </h2>
  );
}
