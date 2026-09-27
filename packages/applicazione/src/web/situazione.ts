import { valoreEffettivo, type Base } from "@ec/core/dominio";
import { operativo, posta, type ContestoUtente } from "@ec/db";
import type { Dipendenze } from "../dipendenze";
import { correzioniDto, evidenzeDto, UUID } from "../viste/calcolo";
import { viste } from "../viste/repository";
import type { CorrezioneDto, EvidenzaDto } from "../viste/tipi";

/**
 * Casi d'uso di lettura o azioni aggiuntive richiesti dalle pagine web dell'area "situazione".
 * Ogni area ha il proprio file, così le pagine possono crescere senza modificare moduli condivisi.
 */

/** Oltre questo numero le email richieste vengono ignorate: una Situazione reale ne ha molte meno. */
const MASSIMO_EMAIL = 500;

/** Urgenza dell'email d'origine di una Situazione, con la sua base e le evidenze dell'AI. */
export interface UrgenzaEmailOrigineDto {
  emailId: string;
  /** Solo un'email in entrata ha un'urgenza correggibile (`cambiaUrgenza`). */
  correggibile: boolean;
  /** Valore effettivo: la correzione dell'utente prevale sull'AI. */
  urgente: boolean;
  /** Valore dell'AI; null se l'email non è ancora classificata. */
  urgenteAi: boolean | null;
  base: Base | null;
  /** Motivazione della classificazione (testo dell'AI, nella lingua dell'email). */
  motivazione: string | null;
  evidenze: EvidenzaDto[];
  analisiId: string | null;
  /** Correzioni attive del campo `urgente`, per l'annullamento. */
  correzioni: CorrezioneDto[];
}

export interface CorrezioneEmailDto extends CorrezioneDto {
  emailId: string;
}

export interface EmailSituazioneWebDto {
  origine: UrgenzaEmailOrigineDto | null;
  /**
   * Correzioni attive sulle email indicate (categoria, urgenza, lingua): non fanno parte del dettaglio della
   * Situazione, ma la cronologia ne registra gli eventi e deve poterne offrire l'annullamento.
   */
  correzioniEmail: CorrezioneEmailDto[];
}

/**
 * Dati sulle email di una Situazione che `vistaSituazione` non espone: l'urgenza effettiva dell'email
 * d'origine (per attivarla o disattivarla) e le correzioni attive sulle email (per la cronologia).
 * Tutte le letture sono legate all'utente del contesto; gli id non validi vengono ignorati.
 */
export async function emailDellaSituazioneWeb(
  _dip: Dipendenze,
  ctx: ContestoUtente,
  emailOrigineId: string,
  emailIds: readonly string[],
): Promise<EmailSituazioneWebDto> {
  const validi = [...new Set([emailOrigineId, ...emailIds])].filter((id) => UUID.test(id)).slice(0, MASSIMO_EMAIL);
  if (validi.length === 0) return { origine: null, correzioniEmail: [] };

  const soggetti = validi.map((id) => ({ tipo: "email" as const, id }));
  const origineValida = UUID.test(emailOrigineId);
  const [correzioni, info, classificazioni, classificazioneOrigine] = await Promise.all([
    operativo.correzioniPer(ctx, soggetti),
    viste.infoEmail(ctx, validi),
    viste.classificazioni(ctx, validi),
    origineValida ? posta.leggiClassificazione(ctx, emailOrigineId) : Promise.resolve(null),
  ]);

  const correzioniEmail = validi
    .filter((id) => info.has(id))
    .flatMap((emailId) => correzioniDto(correzioni, { tipo: "email", id: emailId }).map((c) => ({ ...c, emailId })))
    .sort((a, b) => a.creataIl.localeCompare(b.creataIl) || (a.id < b.id ? -1 : 1));

  const infoOrigine = origineValida ? info.get(emailOrigineId) : undefined;
  if (!infoOrigine) return { origine: null, correzioniEmail };

  const soggetto = { tipo: "email", id: emailOrigineId } as const;
  const ai = classificazioni.get(emailOrigineId);
  const urgente = valoreEffettivo<boolean>(ai?.urgente ?? false, correzioni, soggetto, "urgente").valore === true;
  return {
    origine: {
      emailId: emailOrigineId,
      correggibile: infoOrigine.direzione === "entrata",
      urgente,
      urgenteAi: ai ? ai.urgente : null,
      base: ai ? ai.baseUrgenza : null,
      motivazione: classificazioneOrigine?.motivazione ?? null,
      evidenze: classificazioneOrigine ? evidenzeDto(classificazioneOrigine.evidenze) : [],
      analisiId: ai?.analisiId ?? classificazioneOrigine?.analisiId ?? null,
      correzioni: correzioniDto(correzioni, soggetto).filter((c) => c.campo === "urgente"),
    },
    correzioniEmail,
  };
}
