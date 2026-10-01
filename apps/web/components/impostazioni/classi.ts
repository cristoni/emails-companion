/**
 * Area di tocco di un link isolato: un pseudo-elemento invisibile porta l'altezza utile a 40 px sui telefoni
 * senza spostare il testo. Stesso valore delle altre aree dell'app.
 */
export const AREA_TOCCO = "relative after:absolute after:-inset-x-1 after:-inset-y-2.5 after:content-['']";
