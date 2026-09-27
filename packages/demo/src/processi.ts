import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";

export interface ProcessoFiglio {
  nome: string;
  figlio: ChildProcess;
}

/**
 * Avvia un processo con l'output prefissato dal suo nome. Su POSIX è capo di un gruppo di processi,
 * così la chiusura raggiunge anche i sottoprocessi (next dev ne avvia di propri).
 */
export function avviaProcesso(nome: string, argomenti: string[], opzioni: { cwd: string; env: NodeJS.ProcessEnv }): ProcessoFiglio {
  const figlio = spawn(process.execPath, argomenti, {
    cwd: opzioni.cwd,
    env: opzioni.env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
    windowsHide: true,
  });
  for (const flusso of [figlio.stdout, figlio.stderr]) {
    if (!flusso) continue;
    createInterface({ input: flusso }).on("line", (riga) => console.log(`[${nome}] ${riga}`));
  }
  return { nome, figlio };
}

/** Termina il processo e i suoi discendenti in modo sincrono, anche durante l'uscita del processo padre. */
export function terminaAlbero(processo: ProcessoFiglio): void {
  const { figlio } = processo;
  if (figlio.pid === undefined || figlio.exitCode !== null || figlio.signalCode !== null) return;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(figlio.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } else {
      process.kill(-figlio.pid, "SIGTERM");
    }
  } catch {
    // Già terminato.
  }
}
