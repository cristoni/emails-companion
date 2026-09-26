import { richiediUtente } from "@/lib/server/sessione";

export default async function Home() {
  const utente = await richiediUtente();
  return <main className="p-8">{utente.email}</main>;
}
