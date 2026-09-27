import Link from "next/link";
import { useTranslations } from "next-intl";
import { Bot, Cog, User } from "lucide-react";
import type { EventoDto } from "@ec/applicazione";
import type { Attore } from "@ec/core/dominio";
import { testoCodice } from "@/components/comuni/codici";
import { LinkEmail } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { Distintivo } from "@/components/ui/distintivo";
import { PulsanteAnnulla, Sezione } from "./comuni";

const ICONE: Record<Attore, typeof Bot> = { ai: Bot, utente: User, sistema: Cog };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cronologia della Situazione, dalla più recente: chi ha agito (AI, utente, sistema), cosa è cambiato e
 * quando. Un evento che registra una correzione ancora attiva offre l'annullamento.
 */
export function SezioneCronologia({
  eventi,
  annullabili,
}: {
  eventi: readonly EventoDto[];
  /** Correzioni attive per id, con le altre correzioni da annullare insieme. */
  annullabili: ReadonlyMap<string, readonly string[]>;
}) {
  const t = useTranslations("situazione.cronologia");
  return (
    <Sezione id="cronologia" titolo={t("titolo")} descrizione={t("descrizione")} conteggio={eventi.length}>
      {eventi.length === 0 ? (
        <p className="text-sm text-text-muted">{t("vuoto")}</p>
      ) : (
        <ol className="divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface-raised">
          {eventi.map((e) => (
            <VoceEvento key={e.id} evento={e} annullabili={annullabili} />
          ))}
        </ol>
      )}
    </Sezione>
  );
}

function VoceEvento({ evento: e, annullabili }: { evento: EventoDto; annullabili: ReadonlyMap<string, readonly string[]> }) {
  const t = useTranslations("situazione.cronologia");
  const Icona = ICONE[e.attore] ?? Cog;
  const correzione = e.riferimenti.correzione;
  const daAnnullare = correzione ? annullabili.get(correzione) : undefined;
  const email = e.riferimenti.email;
  // Rifiuto di un collegamento: gli elementi spostati vivono in un'altra Situazione, raggiungibile da qui.
  const altraSituazione = e.tipo === "collegamento_rifiutato" ? e.riferimenti.a : e.tipo === "elementi_spostati" ? e.riferimenti.da : undefined;

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface-muted">
          <Icona className="size-3.5 text-text-muted" aria-hidden />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="text-sm">{testoCodice(t, "tipi", e.tipo, "tipoGenerico")}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
            <Distintivo tono={e.attore === "utente" ? "accento" : "neutro"}>{testoCodice(t, "attori", e.attore, "attoreGenerico")}</Distintivo>
            <Istante iso={e.creatoIl} stile="data_ora" />
            {email && UUID.test(email) ? <LinkEmail emailId={email} className="text-accent-strong underline-offset-4 hover:underline" /> : null}
            {altraSituazione && UUID.test(altraSituazione) ? (
              <Link href={`/situations/${altraSituazione}`} className="text-accent-strong underline-offset-4 hover:underline">
                {t("altraSituazione")}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
      {correzione && daAnnullare ? <PulsanteAnnulla correzioni={[correzione, ...daAnnullare]} /> : null}
    </li>
  );
}
