import { useTranslations } from "next-intl";
import { Clock3, Inbox } from "lucide-react";
import type { EmailSpostataDalleNewsDto, VistaNewsDto } from "@ec/applicazione";
import type { Indirizzo } from "@ec/core/dominio";
import { testoCodice } from "@/components/comuni/codici";
import { LinkEmail } from "@/components/comuni/evidenze";
import { Istante } from "@/components/comuni/istante";
import { TestoSemplice } from "@/components/comuni/testo-semplice";
import { DataBreve } from "@/components/posta/data-breve";
import { Scheda } from "@/components/ui/scheda";
import { AnnullaSpostamento, ModuloSpostaNews } from "./modulo-sposta";

/** Nome del mittente, o l'indirizzo se manca: come in una casella di posta, l'indirizzo completo è nell'email. */
function Mittente({ mittente, className }: { mittente: Indirizzo; className?: string }) {
  const nome = mittente.nome?.trim();
  return <TestoSemplice come="span" testo={nome || mittente.indirizzo} className={className} />;
}

/** Conteggio accanto al titolo della sezione, a pillola come nelle altre pagine. */
function Conteggio({ numero }: { numero: number }) {
  return (
    <span className="rounded-full border border-border bg-surface-muted px-1.5 text-xs font-medium tracking-normal text-text-muted tabular-nums">{numero}</span>
  );
}

/**
 * Originali delle News, con la stessa gerarchia delle righe di `/mail`: mittente in grassetto e data breve,
 * oggetto (link all'email, su tutta la riga), poi anteprima con in fondo le eccezioni ("non ancora nel
 * riepilogo", la casella solo se sono più d'una) e la correzione "Non è una News?". La data sta sopra il
 * link, così il suo titolo con la data completa resta leggibile al passaggio del mouse. Il taglio a due righe
 * è sul testo dell'oggetto, non sul titolo: così l'anello del focus del link non viene tagliato.
 */
export function ElencoNews({ membri }: { membri: VistaNewsDto["membri"] }) {
  const t = useTranslations("news.elenco");
  const piuCaselle = new Set(membri.map((m) => m.casella)).size > 1;
  return (
    <section aria-labelledby="news-elenco-titolo" className="space-y-3">
      <h2 id="news-elenco-titolo" tabIndex={-1} className="flex items-center gap-2 text-base">
        {t("titolo")}
        <Conteggio numero={membri.length} />
      </h2>
      <Scheda className="overflow-hidden">
        <ul className="divide-y divide-border">
          {membri.map((m) => {
            const oggetto = m.oggetto.trim() || t("senzaOggetto");
            return (
              <li
                key={m.emailId}
                className="relative px-4 py-3 transition-colors hover:bg-surface-muted has-[a:focus-visible]:bg-surface-muted sm:px-5"
              >
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <Mittente mittente={m.mittente} className="min-w-0 truncate whitespace-nowrap font-semibold" />
                  <DataBreve iso={m.ricevutaIl} className="relative z-10 shrink-0 text-xs tabular-nums text-text-muted" />
                </div>
                <h3 id={`news-oggetto-${m.emailId}`} className="mt-0.5 text-sm font-normal tracking-normal">
                  {/* Il link si estende su tutta la riga: l'intera voce apre l'email. */}
                  <LinkEmail
                    emailId={m.emailId}
                    className="block underline-offset-4 after:absolute after:inset-0 after:content-[''] hover:text-accent-strong hover:underline focus-visible:underline"
                  >
                    <TestoSemplice come="span" testo={oggetto} className="line-clamp-2" />
                  </LinkEmail>
                </h3>
                {/* L'anteprima tiene almeno metà riga: se le eccezioni non ci stanno accanto, vanno a capo. */}
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                  {m.anteprima.trim() ? <TestoSemplice come="p" testo={m.anteprima} className="line-clamp-1 min-w-[50%] flex-1 whitespace-normal text-sm" /> : null}
                  {m.nelRiepilogo ? null : (
                    <span className="inline-flex shrink-0 items-center gap-1">
                      <Clock3 className="size-3.5" aria-hidden />
                      {t("nonNelRiepilogo")}
                    </span>
                  )}
                  {piuCaselle && m.casella ? (
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <Inbox className="size-3.5 shrink-0" aria-hidden />
                      <span className="sr-only">{t("casella")}: </span>
                      <span className="truncate">{m.casella}</span>
                    </span>
                  ) : null}
                  <ModuloSpostaNews emailId={m.emailId} oggetto={oggetto} descrittoDa={`news-oggetto-${m.emailId}`} />
                </div>
              </li>
            );
          })}
        </ul>
      </Scheda>
    </section>
  );
}

/**
 * Email spostate fuori dalle News nelle ultime 24 ore, in righe compatte annullabili. Sta sopra l'elenco,
 * vicino a dove l'utente ha agito. Niente id `news-oggetto-`: queste email non sono più nelle News. Il titolo
 * riceve il focus dopo uno spostamento, perché la riga di partenza è sparita.
 */
export function ElencoSpostate({ spostate }: { spostate: readonly EmailSpostataDalleNewsDto[] }) {
  const t = useTranslations("news.spostate");
  const te = useTranslations("news.elenco");
  const tc = useTranslations("comuni");
  if (spostate.length === 0) return null;
  return (
    <section aria-labelledby="news-spostate-titolo" className="space-y-3">
      <h2 id="news-spostate-titolo" tabIndex={-1} className="text-base">
        {t("titolo")}
      </h2>
      <Scheda className="overflow-hidden">
        <ul className="divide-y divide-border">
          {spostate.map((s) => {
            const oggetto = s.oggetto.trim() || te("senzaOggetto");
            return (
              <li key={s.emailId} className="flex items-center gap-3 px-4 py-2 sm:px-5">
                <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-3">
                  <LinkEmail emailId={s.emailId} className="block min-w-0 truncate text-sm font-medium underline-offset-4 hover:text-accent-strong hover:underline sm:flex-1">
                    <TestoSemplice come="span" testo={oggetto} className="whitespace-nowrap" />
                  </LinkEmail>
                  <p className="truncate text-xs text-text-muted sm:shrink-0">
                    {t("categoria", { categoria: testoCodice(tc, "categorie", s.categoria) })} · <Istante iso={s.spostataIl} stile="relativo" />
                  </p>
                </div>
                <AnnullaSpostamento emailId={s.emailId} oggetto={oggetto} />
              </li>
            );
          })}
        </ul>
      </Scheda>
    </section>
  );
}
