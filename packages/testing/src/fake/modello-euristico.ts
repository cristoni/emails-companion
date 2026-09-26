import { GatewayModelliFinto } from "./gateway";

interface EmailDati {
  alias: string;
  direzione: string;
  mittente: string;
  destinatari: string[];
  oggetto: string;
  testo: string;
  lingua: string;
}

const NEWS = /(newsletter|digest|weekly|noreply|no-reply|notifications?@|unsubscribe|promo)/i;
const URGENTE = /(urgent|urgente|asap|entro oggi|by today|immediately|subito)/i;

function frasi(testo: string): string[] {
  return testo
    .split(/(?<=[.?!])\s+|\n+/)
    .map((f) => f.trim())
    .filter((f) => f.length >= 8);
}

function domanda(testo: string): string | null {
  return frasi(testo).find((f) => f.endsWith("?")) ?? null;
}

/**
 * Modello finto per la modalità locale e i test E2E: regole semplici e deterministiche che producono
 * output validi (alias esistenti, citazioni letterali) per tutte le Funzioni AI.
 */
export function gatewayEuristico(): GatewayModelliFinto {
  const g = new GatewayModelliFinto();
  g.quando("classificazione_priorita", (d: { email: EmailDati }) => {
    const e = d.email;
    const news = NEWS.test(`${e.mittente} ${e.oggetto} ${e.testo}`);
    const urgente = !news && URGENTE.test(`${e.oggetto} ${e.testo}`);
    const q = domanda(e.testo);
    const citazione = (urgente ? frasi(e.testo).find((f) => URGENTE.test(f)) : q) ?? null;
    return {
      output: {
        categoria: news ? "news" : q ? "operativa" : "informativa",
        urgente,
        base_urgenza: urgente && citazione ? "rilevato" : "dedotto",
        priorita: urgente ? "alta" : q ? "media" : "bassa",
        motivazione: news ? "Automated or bulk message." : q ? "Contains a direct request." : "Informational message.",
        titolo_situazione: e.oggetto || null,
        descrizione_situazione: frasi(e.testo)[0] ?? null,
        evidenze: citazione ? [{ email: "e1", citazione, campo: urgente ? "urgenza" : "categoria" }] : [],
      },
    };
  });
  g.quando("estrazione_attivita", (d: { email: EmailDati }) => {
    const q = d.email.direzione === "entrata" ? domanda(d.email.testo) : null;
    return {
      output: {
        elementi: q
          ? [{ esito: "nuovo", riferimento: null, descrizione: `Reply: ${q}`, scadenza_iso: null, scadenza_citazione: null, priorita: "media", urgente: false, base: "rilevato", evidenze: [{ email: "e1", citazione: q }] }]
          : [],
        titolo_situazione: null,
        descrizione_situazione: null,
      },
    };
  });
  g.quando(
    "attese_risposte",
    (d: {
      email: EmailDati;
      situazioni_candidate: { alias: string }[];
      attese_candidate: { alias: string; destinatari: string[]; requisiti: { alias: string }[] }[];
    }) => {
      const e = d.email;
      if (e.direzione === "uscita") {
        const q = domanda(e.testo);
        return {
          output: {
            richieste: q
              ? [{ esito: "nuovo", riferimento: null, destinatari: e.destinatari, oggetto: e.oggetto || q, data_attesa_iso: null, data_attesa_citazione: null, requisiti: [], sollecito_di: null, base: "rilevato", evidenze: [{ email: "e1", citazione: q }] }]
              : [],
            collegamenti: [],
            valutazioni: [],
            completamenti: [],
            titolo_situazione: e.oggetto || null,
            descrizione_situazione: q,
          },
        };
      }
      const prima = frasi(e.testo)[0];
      const pertinenti = d.attese_candidate.filter((w) => w.destinatari.map((x) => x.toLowerCase()).includes(e.mittente.toLowerCase()));
      return {
        output: {
          richieste: [],
          collegamenti: d.situazioni_candidate.slice(0, 1).map((s) => ({ candidato: s.alias, pertinente: pertinenti.length > 0, confidenza: 0.6, motivazione: "Same correspondent.", evidenze: [] })),
          valutazioni: prima
            ? pertinenti.map((w) => ({
                attesa: w.alias,
                valutazione: "completa",
                requisiti: w.requisiti.map((r) => ({ requisito: r.alias, soddisfatto: true, evidenze: [{ email: "e1", citazione: prima }] })),
                motivazione: "The correspondent replied.",
              }))
            : [],
          completamenti: [],
          titolo_situazione: null,
          descrizione_situazione: null,
        },
      };
    },
  );
  g.quando("riepilogo_news", (d: { email: EmailDati[] }) => ({
    output: { voci: d.email.map((e) => ({ testo: e.oggetto || frasi(e.testo)[0] || "—", email: [e.alias] })) },
  }));
  g.quando("bozze_assistite", (d: { tipo: string; email: EmailDati }) => ({
    output: {
      oggetto: d.email.oggetto.startsWith("Re:") ? d.email.oggetto : `Re: ${d.email.oggetto}`,
      corpo: d.email.lingua === "it" ? (d.tipo === "sollecito" ? "Ciao, ti scrivo per un aggiornamento sulla mia richiesta. Grazie!" : "Grazie, ti rispondo a breve.") : d.tipo === "sollecito" ? "Hi, just following up on my request. Thanks!" : "Thanks, I will get back to you shortly.",
    },
  }));
  return g;
}
