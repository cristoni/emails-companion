import type { FunzioneAI } from "@ec/core/dominio";
import type { RichiestaModello } from "@ec/core/porte";
import type { DatiFunzione } from "./dati";
import { costruisciPrompt, type InputPrompt } from "./prompt";
import { REGISTRO_FUNZIONI } from "./registro";
import { jsonSchemaStrict } from "./schemi";

export interface InputRichiesta<F extends FunzioneAI> extends Omit<InputPrompt, "dati"> {
  modello: string;
  chiave: string;
  dati: DatiFunzione<F>;
}

const schemiJson = new Map<FunzioneAI, Record<string, unknown>>();

/** Unico punto da cui si costruisce una chiamata a un modello: schema e limiti vengono dal registro. */
export function costruisciRichiesta<F extends FunzioneAI>(funzione: F, input: InputRichiesta<F>): RichiestaModello {
  const { modello, chiave, ...prompt } = input;
  const voce = REGISTRO_FUNZIONI[funzione];
  let schema = schemiJson.get(funzione);
  if (!schema) {
    schema = jsonSchemaStrict(voce.schema);
    schemiJson.set(funzione, schema);
  }
  return {
    funzione,
    modello,
    chiave,
    ...costruisciPrompt(funzione, prompt),
    nomeSchema: voce.nomeSchema,
    schema: structuredClone(schema),
    maxTokenUscita: voce.maxTokenUscita,
  };
}
