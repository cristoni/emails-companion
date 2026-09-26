import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ContestoUtente } from "@ec/db";
import { ottieniAuth } from "./auth";
import { composizione } from "./composizione";

/** Utente della sessione: da richiamare in ogni pagina, Server Action e route (il proxy non autorizza). */
export async function utenteCorrente(): Promise<{ id: string; email: string; nome: string } | null> {
  const auth = await ottieniAuth();
  const sessione = await auth.api.getSession({ headers: await headers() });
  return sessione ? { id: sessione.user.id, email: sessione.user.email, nome: sessione.user.name } : null;
}

export async function richiediUtente() {
  const utente = await utenteCorrente();
  if (!utente) redirect("/sign-in");
  return utente;
}

/** Esegue un lavoro nel contesto dell'utente della sessione: tutte le query sono legate a lui. */
export async function comeUtente<T>(lavoro: (ctx: ContestoUtente, dip: Awaited<ReturnType<typeof composizione>>["dip"]) => Promise<T>): Promise<T> {
  const utente = await richiediUtente();
  const { dip } = await composizione();
  return dip.unita.perUtente(utente.id, (ctx) => lavoro(ctx, dip));
}
