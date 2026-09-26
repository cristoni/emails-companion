import { inject } from "vitest";
import { creaDatabaseIsolato } from "./cluster";

declare module "vitest" {
  export interface ProvidedContext {
    pgUrlAmministrazione: string;
    pgPorta: number;
  }
}

/** Database nuovo, già migrato, per il file di test corrente. */
export async function databaseDiTest(): Promise<string> {
  return creaDatabaseIsolato(inject("pgUrlAmministrazione"), inject("pgPorta"));
}
