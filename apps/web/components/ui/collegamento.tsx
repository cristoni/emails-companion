/**
 * Stile dei link nel testo: blu con una sottolineatura leggera anche a riposo, così si distinguono dalle
 * etichette. Il blu è riservato a ciò che si clicca o è selezionato; gli stati usano testo neutro e icona.
 */
export const CLASSE_LINK = "text-accent-strong underline decoration-accent-strong/30 underline-offset-4 transition-colors hover:decoration-current";

/** Link d'azione isolati, con icona o freccia (per esempio "Vedi tutte →"): niente sottolineatura a riposo. */
export const CLASSE_LINK_AZIONE = "inline-flex items-center gap-1 font-medium text-accent-strong underline-offset-4 hover:underline";

/**
 * Area di tocco di almeno 36px attorno a un link isolato o in una riga di metadati, senza cambiarne
 * l'ingombro: uno pseudo-elemento trasparente allarga la zona cliccabile di 10px sopra e sotto e di 4px ai lati.
 * Non usarla su link che stanno dentro un testo su più righe, dove le aree si sovrapporrebbero.
 */
export const AREA_TOCCO = "relative after:absolute after:-inset-x-1 after:-inset-y-2.5 after:content-['']";
