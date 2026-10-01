import { redirect } from "next/navigation";

/**
 * `/drafts` non è un elenco: ogni bozza si raggiunge dalla sua Situazione. Chi accorcia l'indirizzo di una
 * bozza torna alla home invece di finire su una pagina 404 fuori dall'app.
 */
export default function PaginaBozze(): never {
  redirect("/");
}
