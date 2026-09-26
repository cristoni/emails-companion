import { compile, type SelectorDefinition } from "html-to-text";

const dichiarazioni = (proprieta: string, valore: string) => [":", ": "].map((s) => `${proprieta}${s}${valore}`);

const STILI_NASCOSTI = [...dichiarazioni("display", "none"), ...dichiarazioni("visibility", "hidden")].map(
  (d) => `[style*="${d}" i]`,
);

// "font-size:0" è anche il prefisso di "font-size:0.9em": lo zero deve chiudere il valore.
const STILI_A_ZERO = ["font-size", "max-height", "opacity"]
  .flatMap((p) => dichiarazioni(p, "0"))
  .flatMap((d) => [
    `[style$="${d}" i]`,
    ...[";", " ", "!", "px", "pt", "em", "rem", "%"].map((fine) => `[style*="${d}${fine}" i]`),
  ]);

const salta = (selector: string): SelectorDefinition => ({ selector, format: "skip" });

const converti = compile({
  wordwrap: false,
  // La visita è ricorsiva: senza limite un HTML annidato per qualche migliaio di livelli esaurisce lo stack.
  limits: { maxDepth: 300 },
  selectors: [
    { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
    ...["h1", "h2", "h3", "h4", "h5", "h6"].map((selector) => ({ selector, options: { uppercase: false } })),
    ...["td", "th"].map((selector) => ({
      selector,
      format: "block",
      options: { leadingLineBreaks: 1, trailingLineBreaks: 1 },
    })),
    salta("img"),
    salta("title"),
    salta("template"),
    salta("[hidden]"),
    salta('[aria-hidden="true" i]'),
    ...STILI_NASCOSTI.map(salta),
    ...STILI_A_ZERO.map(salta),
  ],
});

export function htmlInTesto(html: string): string {
  return converti(html);
}
