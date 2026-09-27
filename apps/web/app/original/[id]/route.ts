import sanitizeHtml from "sanitize-html";
import { posta } from "@ec/db";
import { composizione } from "@/lib/server/composizione";
import { utenteCorrente } from "@/lib/server/sessione";

const TAG_CONSENTITI = sanitizeHtml.defaults.allowedTags.concat(["img", "style", "center", "font", "span", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "colgroup", "col", "h1", "h2"]);

function sanifica(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: TAG_CONSENTITI.filter((t) => !["form", "input", "button", "textarea", "select", "iframe", "object", "embed", "script"].includes(t)),
    allowedAttributes: {
      "*": ["style", "class", "align", "valign", "width", "height", "bgcolor", "color", "dir", "lang", "title", "border", "cellpadding", "cellspacing", "colspan", "rowspan"],
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "width", "height"],
      font: ["face", "size", "color"],
    },
    allowedSchemes: ["http", "https", "mailto", "cid", "data"],
    allowedSchemesByTag: { img: ["http", "https", "cid", "data"] },
    allowVulnerableTags: true,
    transformTags: { a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }) },
  });
}

function testoComeHtml(testo: string): string {
  const sicuro = testo.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  return `<pre style="white-space:pre-wrap;font:14px/1.5 system-ui,sans-serif;margin:16px">${sicuro}</pre>`;
}

/**
 * Originale di un'email (§13.3): autenticato, non memorizzato in cache, isolato dalla direttiva CSP
 * `sandbox` anche se aperto direttamente. Le immagini remote sono bloccate finché l'utente non le chiede.
 */
export async function GET(richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const utente = await utenteCorrente();
  if (!utente) return new Response(null, { status: 401 });
  const { id } = await contesto.params;
  // Un id malformato è "non trovato": non arriva mai a una colonna uuid del database.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return new Response(null, { status: 404 });
  const immagini = new URL(richiesta.url).searchParams.get("immagini") === "1";
  const { dip } = await composizione();

  const dati = await dip.unita.perUtente(utente.id, async (ctx) => {
    const email = await posta.leggi(ctx, id);
    if (!email) return null;
    const copie = (await posta.copieDellEmail(ctx, id)).filter((c) => !c.eliminataNelProvider);
    return { email, copia: copie[0] ?? null };
  });
  if (!dati) return new Response(null, { status: 404 });

  let corpo = testoComeHtml(dati.email.testo);
  if (dati.copia) {
    try {
      const html = await (await dip.connettori.per(dati.copia.casellaId)).leggiHtml(dati.copia.idConnettore);
      if (html) corpo = sanifica(html);
    } catch {
      // Senza accesso all'originale si mostra il testo conservato.
    }
  }
  const csp = [
    "sandbox allow-popups allow-popups-to-escape-sandbox",
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    `img-src data: cid:${immagini ? " https:" : ""}`,
    "font-src data:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
  ].join("; ");
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><base target="_blank"></head><body>${corpo}</body></html>`, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": csp,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "private, no-store",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}
