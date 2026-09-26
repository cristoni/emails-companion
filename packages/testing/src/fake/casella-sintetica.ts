import type { CasellaFinta } from "./connettore";

/** Popola una casella simulata con posta sintetica (mai dati reali): richieste, risposte, News. */
export function popolaCasellaSintetica(casella: CasellaFinta, ora: Date): void {
  const ore = (h: number) => new Date(ora.getTime() - h * 60 * 60 * 1000);
  const io = casella.indirizzo;
  casella.ricevi({ da: "marco@cliente.example", a: [io], oggetto: "Quarterly report", testo: "Hi,\nCould you send me the quarterly report by Friday?\nThanks, Marco", il: ore(30), thread: "t-report", messageId: "report-1@cliente.example" });
  casella.ricevi({ da: io, a: ["giulia@fornitore.example"], oggetto: "August figures", testo: "Hi Giulia,\nCan you send me the August revenue and cost figures?\nThank you", il: ore(26), thread: "t-agosto", messageId: "agosto-1@esempio.example" });
  casella.ricevi({ da: "giulia@fornitore.example", a: [io], oggetto: "figures", testo: "Revenue was 12,000. I will send the costs tomorrow.", il: ore(20), thread: "t-figures", messageId: "agosto-2@fornitore.example" });
  casella.ricevi({ da: "ops@partner.example", a: [io], oggetto: "Production is down", testo: "Urgent: the production server is down since this morning. Please call me asap.", il: ore(3), thread: "t-down", messageId: "down-1@partner.example" });
  casella.ricevi({ da: "newsletter@notizie.example", a: [io], oggetto: "Weekly digest", testo: "This week in tech: five stories you might have missed. Unsubscribe at any time.", il: ore(5), thread: "t-news1", messageId: "news-1@notizie.example" });
  casella.ricevi({ da: "notifications@strumento.example", a: [io], oggetto: "Your build passed", testo: "Build #482 passed on main. No action needed.", il: ore(2), thread: "t-news2", messageId: "news-2@strumento.example" });
}
