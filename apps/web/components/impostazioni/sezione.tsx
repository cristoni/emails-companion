import { Scheda } from "@/components/ui/scheda";
import { cn } from "@/components/ui/cn";

/** Distanza delle ancore dal bordo superiore (sui telefoni si somma allo `scroll-padding` della barra fissa). */
export const CLASSE_ANCORA = "scroll-mt-6";

/**
 * Gruppo di impostazioni: un'etichetta (`h2`) sopra una sola Scheda che contiene le sezioni, separate da
 * una linea. Con `id` il gruppo stesso è una sezione con ancora (`/settings#<id>`), per i gruppi fatti di
 * una sola sezione, che così non ripetono il titolo.
 */
export function Gruppo({ titolo, id, children }: { titolo: React.ReactNode; id?: string; children: React.ReactNode }) {
  const idTitolo = id ? `${id}-titolo` : undefined;
  const contenuto = (
    <>
      <h2 id={idTitolo} className="mb-2 px-1 text-sm font-semibold text-text-muted">
        {titolo}
      </h2>
      <Scheda className="divide-y divide-border">{children}</Scheda>
    </>
  );
  return id ? (
    <section id={id} aria-labelledby={idTitolo} className={CLASSE_ANCORA}>
      {contenuto}
    </section>
  ) : (
    <div>{contenuto}</div>
  );
}

/**
 * Sezione dentro un Gruppo, raggiungibile da `/settings#<id>`: titolo, al massimo una riga attenuata quando
 * lo scopo non è evidente, e i comandi principali a destra.
 */
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
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titolo`} className={cn(CLASSE_ANCORA, "space-y-4 px-4 py-5 text-sm sm:px-5", className)}>
      <div className="space-y-0.5">
        <div className="flex items-center justify-between gap-3">
          <h3 id={`${id}-titolo`} className="flex min-w-0 flex-wrap items-center gap-2 text-[15px]">
            {titolo}
          </h3>
          {/* I comandi non allargano la riga del titolo: la descrizione resta subito sotto. */}
          {azioni ? <div className="-my-1.5 flex shrink-0 items-center gap-2">{azioni}</div> : null}
        </div>
        {descrizione ? <p className="text-text-muted">{descrizione}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Blocco interno di un Gruppo senza titolo proprio (per esempio una riga delle preferenze). */
export function Blocco({ id, className, children }: { id?: string; className?: string; children: React.ReactNode }) {
  return (
    <div id={id} className={cn(id ? CLASSE_ANCORA : null, "px-4 py-4 text-sm sm:px-5", className)}>
      {children}
    </div>
  );
}

/**
 * Riga di metadati attenuata, con le parti separate da un punto in mezzo. Le parti vuote sono omesse; il
 * punto resta attaccato alla parte che lo precede, così una riga che va a capo non ne comincia una con "·".
 */
export function RigaMeta({ parti, icona, className }: { parti: React.ReactNode[]; icona?: React.ReactNode; className?: string }) {
  const presenti = parti.filter((p) => p !== null && p !== undefined && p !== false && p !== "");
  return (
    <p className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-text-muted", className)}>
      {icona}
      {presenti.map((p, i) => (
        <span key={i}>
          {p}
          {i < presenti.length - 1 ? <span aria-hidden> ·</span> : null}
        </span>
      ))}
    </p>
  );
}
