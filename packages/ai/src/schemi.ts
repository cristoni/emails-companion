import { z } from "zod";
import { BASI, CATEGORIE, PRIORITA, VALUTAZIONI, type FunzioneAI } from "@ec/core/dominio";
import { ErroreAI } from "./errori";

export const ESITI_ELEMENTO = ["nuovo", "aggiorna", "non_trovato"] as const;
export type EsitoElemento = (typeof ESITI_ELEMENTO)[number];

export const ESITI_COMPLETAMENTO = ["completata", "aggiornata", "non_pertinente"] as const;
export type EsitoCompletamento = (typeof ESITI_COMPLETAMENTO)[number];

const testoLibero = z.string().min(1);
const testoOpzionale = testoLibero.nullable();

const aliasEmail = z.string().describe("Alias of an email present in the data, e.g. e1");

const evidenza = z.object({
  email: aliasEmail,
  citazione: testoLibero.describe("Verbatim substring copied exactly from the text of that email"),
});
export type EvidenzaModello = z.infer<typeof evidenza>;

const evidenze = z.array(evidenza);

const dataIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .describe("Calendar date YYYY-MM-DD, or null");

const titoloSituazione = testoOpzionale.describe("Short title for a new Situation, or null");
const descrizioneSituazione = testoOpzionale.describe("One or two sentences describing the Situation, or null");

/**
 * "nuovo" senza riferimento e con il campo che descrive l'elemento; "aggiorna" e "non_trovato"
 * con il riferimento a un elemento esistente. Non esprimibile in JSON Schema strict: vale solo in validazione.
 */
function esitoCoerente<K extends string>(campo: K) {
  return (v: { esito: EsitoElemento; riferimento: string | null } & Record<K, string | null>, ctx: z.RefinementCtx): void => {
    if ((v.esito === "nuovo") !== (v.riferimento === null)) {
      ctx.addIssue({ code: "custom", path: ["riferimento"], message: "riferimento_incoerente" });
    }
    if (v.esito === "nuovo" && v[campo] === null) {
      ctx.addIssue({ code: "custom", path: [campo], message: "campo_mancante" });
    }
  };
}

/** Ogni elemento esistente, candidato o requisito ha al più un esito: un doppione renderebbe ambigua la riconciliazione. */
function senzaDoppioni<K extends string>(campo: K) {
  return (lista: readonly Record<K, string | null>[], ctx: z.RefinementCtx): void => {
    const visti = new Set<string>();
    lista.forEach((voce, i) => {
      const riferimento = voce[campo];
      if (riferimento === null) return;
      if (visti.has(riferimento)) ctx.addIssue({ code: "custom", path: [i, campo], message: "riferimento_duplicato" });
      visti.add(riferimento);
    });
  };
}

export const schemaClassificazione = z.object({
  categoria: z.enum(CATEGORIE),
  urgente: z.boolean(),
  base_urgenza: z.enum(BASI),
  priorita: z.enum(PRIORITA),
  motivazione: testoLibero,
  titolo_situazione: titoloSituazione,
  descrizione_situazione: descrizioneSituazione,
  evidenze: z.array(
    z.object({
      email: aliasEmail,
      citazione: evidenza.shape.citazione,
      campo: z.enum(["categoria", "urgenza", "priorita"]),
    }),
  ),
});

export const schemaEstrazione = z.object({
  elementi: z
    .array(
      z.object({
        esito: z.enum(ESITI_ELEMENTO),
        riferimento: z.string().nullable().describe("Alias of an existing item (t1…) for aggiorna/non_trovato, null for nuovo"),
        descrizione: testoOpzionale,
        scadenza_iso: dataIso,
        scadenza_citazione: testoOpzionale.describe("Verbatim quote stating the deadline, or null"),
        priorita: z.enum(PRIORITA).nullable(),
        urgente: z.boolean().nullable(),
        base: z.enum(BASI),
        evidenze,
      })
      .superRefine(esitoCoerente("descrizione")),
    )
    .superRefine(senzaDoppioni("riferimento")),
  titolo_situazione: titoloSituazione,
  descrizione_situazione: descrizioneSituazione,
});

export const schemaAtteseRisposte = z.object({
  richieste: z
    .array(
      z.object({
        esito: z.enum(ESITI_ELEMENTO),
        riferimento: z.string().nullable().describe("Alias of an existing waiting item of this email (w1…), null for nuovo"),
        destinatari: z.array(z.string()).describe("Addresses of the people asked, taken from the email headers"),
        oggetto: testoOpzionale.describe("What was asked, in a short phrase"),
        data_attesa_iso: dataIso,
        data_attesa_citazione: testoOpzionale,
        requisiti: z.array(testoLibero).describe("Each distinct piece of information or decision requested"),
        sollecito_di: z.string().nullable().describe("Alias of the open waiting item (w…) this email chases, or null"),
        base: z.enum(BASI),
        evidenze,
      })
      .superRefine(esitoCoerente("oggetto")),
    )
    .superRefine(senzaDoppioni("riferimento")),
  collegamenti: z
    .array(
      z.object({
        candidato: z.string().describe("Alias of a candidate Situation (s1…)"),
        pertinente: z.boolean(),
        confidenza: z.number().min(0).max(1).describe("Number from 0 (a guess) to 1 (certain)"),
        motivazione: testoLibero,
        evidenze,
      }),
    )
    .superRefine(senzaDoppioni("candidato")),
  valutazioni: z
    .array(
      z.object({
        attesa: z.string().describe("Alias of a candidate waiting item (w…)"),
        valutazione: z.enum(VALUTAZIONI),
        requisiti: z
          .array(
            z.object({
              requisito: z.string().describe("Alias of a requirement of that waiting item (w1r1…)"),
              soddisfatto: z.boolean(),
              evidenze,
            }),
          )
          .superRefine(senzaDoppioni("requisito")),
        motivazione: testoLibero,
      }),
    )
    .superRefine(senzaDoppioni("attesa")),
  completamenti: z
    .array(
      z.object({
        attivita: z.string().describe("Alias of a candidate action item (t…)"),
        esito: z.enum(ESITI_COMPLETAMENTO),
        nuova_scadenza_iso: dataIso,
        evidenze,
      }),
    )
    .superRefine(senzaDoppioni("attivita")),
  titolo_situazione: titoloSituazione,
  descrizione_situazione: descrizioneSituazione,
});

export const schemaRiepilogoNews = z.object({
  voci: z.array(
    z.object({
      testo: testoLibero,
      email: z.array(aliasEmail).min(1).describe("Aliases of every email summarised by this entry"),
    }),
  ),
});

export const schemaBozza = z.object({
  oggetto: testoLibero,
  corpo: testoLibero,
});

export const SCHEMI_OUTPUT = {
  classificazione_priorita: schemaClassificazione,
  estrazione_attivita: schemaEstrazione,
  attese_risposte: schemaAtteseRisposte,
  riepilogo_news: schemaRiepilogoNews,
  bozze_assistite: schemaBozza,
} as const satisfies Record<FunzioneAI, z.ZodType>;

type NodoSchema = Record<string, unknown>;

/** Parole chiave accettate dalla modalità strict dei fornitori (OpenAI e compatibili). */
const PAROLE_STRICT: ReadonlySet<string> = new Set(["type", "properties", "required", "additionalProperties", "items", "enum", "anyOf", "description"]);
const PAROLE_NULLABILE: ReadonlySet<string> = new Set(["anyOf", "description"]);
/** Vincoli omessi dallo schema inviato: restano nella validazione Zod. */
const SOLO_ZOD: ReadonlySet<string> = new Set([
  "$schema",
  "format",
  "pattern",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minItems",
  "maxItems",
]);

/**
 * JSON Schema per `response_format` strict: ogni oggetto chiuso e con tutte le proprietà obbligatorie,
 * nullable come unione di tipi, niente vincoli non supportati (restano nella validazione Zod).
 * Solleva `ErroreAI("schema_non_supportato")` per costrutti che non si possono rappresentare senza perderli.
 */
export function jsonSchemaStrict(schema: z.ZodType): NodoSchema {
  return rendiStrict(z.toJSONSchema(schema, { target: "draft-2020-12", io: "output", reused: "inline", cycles: "throw" }));
}

function soloParole(nodo: NodoSchema, ammesse: ReadonlySet<string>): void {
  for (const chiave of Object.keys(nodo)) {
    if (!ammesse.has(chiave) && !SOLO_ZOD.has(chiave)) throw new ErroreAI("schema_non_supportato");
  }
}

function rendiStrict(nodo: NodoSchema): NodoSchema {
  const nullabile = unisciNull(nodo);
  if (nullabile) return nullabile;
  soloParole(nodo, PAROLE_STRICT);
  if ("additionalProperties" in nodo && nodo.additionalProperties !== false) throw new ErroreAI("schema_non_supportato");
  const risultato: NodoSchema = {};
  for (const [chiave, valore] of Object.entries(nodo)) {
    if (!PAROLE_STRICT.has(chiave)) continue;
    if (chiave === "properties") {
      const proprieta = Object.entries(valore as Record<string, NodoSchema>);
      risultato.properties = Object.fromEntries(proprieta.map(([k, v]) => [k, rendiStrict(v)]));
      risultato.required = proprieta.map(([k]) => k);
      risultato.additionalProperties = false;
    } else if (chiave === "items") {
      risultato.items = rendiStrict(valore as NodoSchema);
    } else if (chiave === "anyOf") {
      risultato.anyOf = (valore as NodoSchema[]).map(rendiStrict);
    } else if (chiave !== "required" && chiave !== "additionalProperties") {
      risultato[chiave] = valore;
    }
  }
  if (Array.isArray(risultato.type) && risultato.type.includes("null") && Array.isArray(risultato.enum) && !risultato.enum.includes(null)) {
    risultato.enum = [...risultato.enum, null];
  }
  return risultato;
}

/** `anyOf: [X, {type: "null"}]` con X di un solo tipo diventa X con `type: [tipo, "null"]`. */
function unisciNull(nodo: NodoSchema): NodoSchema | null {
  if (!Array.isArray(nodo.anyOf)) return null;
  const rami = (nodo.anyOf as NodoSchema[]).filter((r) => r.type !== "null");
  const unico = rami[0];
  if (rami.length !== 1 || rami.length === nodo.anyOf.length || typeof unico?.type !== "string") return null;
  soloParole(nodo, PAROLE_NULLABILE);
  const interno = rendiStrict(unico);
  const risultato: NodoSchema = { ...interno, type: [interno.type, "null"] };
  if (Array.isArray(interno.enum)) risultato.enum = [...interno.enum, null];
  if (typeof nodo.description === "string") risultato.description = nodo.description;
  return risultato;
}

export type OutputFunzione<F extends FunzioneAI> = z.infer<(typeof SCHEMI_OUTPUT)[F]>;
export type OutputClassificazione = OutputFunzione<"classificazione_priorita">;
export type OutputEstrazione = OutputFunzione<"estrazione_attivita">;
export type OutputAtteseRisposte = OutputFunzione<"attese_risposte">;
export type OutputRiepilogoNews = OutputFunzione<"riepilogo_news">;
export type OutputBozza = OutputFunzione<"bozze_assistite">;
