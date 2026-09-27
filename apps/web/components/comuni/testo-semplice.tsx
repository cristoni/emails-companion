import { cn } from "@/components/ui/cn";

/**
 * Testo di un'email o prodotto dall'AI (§13): testo semplice, mai HTML, senza link automatici né immagini,
 * marcato con la sua lingua e con direzione automatica.
 */
export function TestoSemplice({
  testo,
  lingua,
  className,
  come = "div",
}: {
  testo: string;
  lingua?: string | null;
  className?: string;
  come?: "div" | "p" | "span" | "blockquote";
}) {
  const Tag = come;
  return (
    <Tag lang={lingua ?? undefined} dir="auto" className={cn("whitespace-pre-wrap break-words", className)}>
      {testo}
    </Tag>
  );
}
