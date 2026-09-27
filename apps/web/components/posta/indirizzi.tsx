import type { Indirizzo } from "@ec/core/dominio";
import { cn } from "@/components/ui/cn";

/**
 * Partecipante di un'email: nome e indirizzo sono testo dell'email, mostrati come testo semplice con
 * direzione automatica (un nome può essere in una scrittura da destra a sinistra).
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
          <span dir="auto">{nome}</span> <span className="font-mono text-xs text-text-muted">&lt;{indirizzo.indirizzo}&gt;</span>
        </>
      ) : (
        <span className="font-mono text-[13px]">{indirizzo.indirizzo}</span>
      )}
    </span>
  );
}

export function ElencoIndirizzi({ indirizzi, vuoto }: { indirizzi: readonly Indirizzo[]; vuoto: string }) {
  if (indirizzi.length === 0) return <span className="text-text-muted">{vuoto}</span>;
  return (
    <ul className="flex flex-col gap-0.5">
      {indirizzi.map((i, n) => (
        <li key={`${i.indirizzo}-${n}`}>
          <TestoIndirizzo indirizzo={i} />
        </li>
      ))}
    </ul>
  );
}
