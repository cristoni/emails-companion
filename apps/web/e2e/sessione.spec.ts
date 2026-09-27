import { expect, test } from "@playwright/test";
import { chiaveOpenRouterFinta, FILE_SESSIONE, messaggio } from "./demo";

test.describe("senza sessione", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("le pagine dell'app portano all'accesso", async ({ request }) => {
    const risposta = await request.get("/onboarding", { maxRedirects: 0 });
    expect(risposta.status()).toBeGreaterThanOrEqual(300);
    expect(risposta.status()).toBeLessThan(400);
    expect(new URL(risposta.headers().location ?? "", "http://x").pathname).toBe("/sign-in");
  });
});

test.describe("con la sessione dell'utente demo", () => {
  test.use({ storageState: FILE_SESSIONE });

  test("la sessione creata dalla demo è valida sul server", async ({ page }) => {
    // /sign-in reindirizza chi ha una sessione valida: basta l'intestazione, senza caricare la home.
    const risposta = await page.request.get("/sign-in", { maxRedirects: 0 });
    expect(risposta.status()).toBeGreaterThanOrEqual(300);
    expect(risposta.status()).toBeLessThan(400);
    expect(new URL(risposta.headers().location ?? "", "http://x").pathname).toBe("/");
  });

  test("nessuna risposta di /onboarding contiene la chiave OpenRouter", async ({ page }) => {
    const chiave = chiaveOpenRouterFinta();
    const casuale = chiave.replace(/^sk-or-v1-demo/, "");
    // Chiave intera, chiave senza le ultime cifre (le sole mostrate) e frammenti della parte casuale.
    const canarini = [chiave, chiave.slice(0, -4), casuale.slice(0, 12), casuale.slice(-16, -4)];
    const contiene = (testo: string) => canarini.some((c) => testo.includes(c));

    const esaminate: string[] = [];
    const conChiave: string[] = [];
    const letture: Promise<void>[] = [];
    page.on("response", (risposta) => {
      letture.push(
        (async () => {
          const tipo = risposta.headers()["content-type"] ?? "";
          if (!/text\/|json|javascript|x-component/.test(tipo)) return;
          const testo = await risposta.text().catch(() => null);
          if (testo === null) return;
          esaminate.push(risposta.url());
          if (contiene(testo)) conChiave.push(risposta.url());
        })(),
      );
    });

    const documento = await page.goto("/onboarding");
    expect(documento?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/onboarding");
    // La lingua è quella salvata dall'utente demo, che altri test o prove manuali possono aver cambiato.
    const lingua = (await page.locator("html").getAttribute("lang")) === "it" ? "it" : "en";
    const salvata = messaggio(lingua, "onboarding", "chiave.salvata")
      .replace("{cifre}", chiave.slice(-4))
      .replace("{stato}", messaggio(lingua, "onboarding", "chiave.stati.valida"));
    await expect(page.getByText(salvata)).toBeVisible();
    await page.waitForLoadState("networkidle");

    // Payload RSC della stessa pagina, come in una navigazione lato client.
    const rsc = await page.request.get("/onboarding", { headers: { RSC: "1" } });
    expect(rsc.status()).toBe(200);
    const testoRsc = await rsc.text();

    await Promise.all(letture);
    expect(esaminate.length).toBeGreaterThan(0);
    expect(conChiave).toEqual([]);
    expect(contiene(testoRsc)).toBe(false);
    expect(contiene(await page.content())).toBe(false);
  });

  test("nessuna pagina dell'app, né il suo payload RSC, contiene la chiave OpenRouter", async ({ page }) => {
    const chiave = chiaveOpenRouterFinta();
    const casuale = chiave.replace(/^sk-or-v1-demo/, "");
    const canarini = [chiave, chiave.slice(0, -4), casuale.slice(0, 12), casuale.slice(-16, -4)];
    const contiene = (testo: string) => canarini.some((c) => testo.includes(c));

    for (const percorso of ["/settings", "/status", "/", "/mail", "/news"]) {
      const documento = await page.goto(percorso);
      expect(documento?.status(), percorso).toBe(200);
      await page.waitForLoadState("networkidle");
      expect(contiene(await page.content()), percorso).toBe(false);
      const rsc = await page.request.get(percorso, { headers: { RSC: "1" } });
      expect(contiene(await rsc.text()), `${percorso} (RSC)`).toBe(false);
    }
    // Le impostazioni mostrano solo le ultime cifre, e il campo per sostituirla è vuoto e mascherato.
    await page.goto("/settings#openrouter");
    await expect(page.getByText(chiave.slice(-4), { exact: false }).first()).toBeVisible();
    const campo = page.locator("#openrouter input[type=password]");
    await expect(campo).toHaveCount(1);
    await expect(campo).toHaveValue("");
    await expect(campo).toHaveAttribute("autocomplete", "off");
  });
});
