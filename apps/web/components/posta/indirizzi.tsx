import type { Indirizzo } from "@ec/core/dominio";
import { cn } from "@/components/ui/cn";

/**
 * Partecipante di un'email: nome e indirizzo sono testo dell'email, mostrati come testo semplice con
 * direzione automatica (un nome può essere in una scrittura da destra a sinistra). Con il nome, l'indirizzo
 * segue attenuato; `breve` mostra solo il nome e lascia l'indirizzo nel titolo.
 */
export function TestoIndirizzo({ indirizzo, breve = false, className }: { indirizzo: Indirizzo; breve?: boolean; className?: string }) {
  const nome = indirizzo.nome?.trim();
  if (breve) {
    return (
      <span dir="auto" title={indirizzo.indirizzo} className={className}>
        {nome || indirizzo.indirizzo}
      </span>
    );
  }
  return (
    <span className={cn("break-words", className)}>
      {nome ? (
        <>
          <span dir="auto">{nome}</span> <span className="font-normal text-text-muted">&lt;{indirizzo.indirizzo}&gt;</span>
        </>
      ) : (
        <span>{indirizzo.indirizzo}</span>
      )}
    </span>
  );
}

/** Indirizzi sulla stessa riga, separati da virgole, per le intestazioni compatte. */
export function IndirizziInLinea({ indirizzi, vuoto }: { indirizzi: readonly Indirizzo[]; vuoto: string }) {
  if (indirizzi.length === 0) return <span className="text-text-muted">{vuoto}</span>;
  return (
    <>
      {indirizzi.map((i, n) => (
        <span key={`${i.indirizzo}-${n}`}>
          {n > 0 ? ", " : null}
          <TestoIndirizzo indirizzo={i} />
        </span>
      ))}
    </>
  );
}
