import { expect, test, type Page } from "@playwright/test";
import { FILE_SESSIONE, messaggio } from "./demo";

/**
 * Garanzie di architettura §14: ogni affermazione dell'AI porta alle email da cui deriva e l'utente può
 * correggere dove serve. I test leggono la lingua della pagina, così non dipendono dalla preferenza
 * salvata dall'utente demo, e riportano i dati allo stato iniziale.
 */
test.use({ storageState: FILE_SESSIONE });

async function lingua(page: Page): Promise<"en" | "it"> {
  return (await page.locator("html").getAttribute("lang")) === "it" ? "it" : "en";
}

async function hrefUnici(page: Page, selettore: string): Promise<string[]> {
  const valori = await page.locator(selettore).evaluateAll((elementi) => elementi.map((e) => e.getAttribute("href") ?? ""));
  return [...new Set(valori.filter(Boolean))];
}

test("ogni Situazione porta alle sue email, e ogni evidenza all'email da cui è citata", async ({ page }) => {
  await page.goto("/");
  const situazioni = await hrefUnici(page, 'main a[href^="/situations/"]');
  expect(situazioni.length).toBeGreaterThan(0);

  for (const situazione of situazioni) {
    await page.goto(situazione);
    for (const evidenza of await page.locator("main li:has(blockquote)").all()) {
      await expect(evidenza.locator('a[href^="/mail/"]')).not.toHaveCount(0);
    }
    const email = await hrefUnici(page, 'main a[href^="/mail/"]');
    expect(email.length, situazione).toBeGreaterThan(0);
    for (const percorso of email) {
      expect((await page.request.get(percorso)).status(), percorso).toBe(200);
      const id = percorso.split("/").pop();
      expect((await page.request.get(`/original/${id}`)).status(), `originale di ${percorso}`).toBe(200);
    }
  }
});

test("una correzione della categoria vale subito ed è annullabile", async ({ page }) => {
  await page.goto("/news");
  const titolo = page.locator('[id^="news-oggetto-"]').first();
  await expect(titolo).toBeVisible();
  const emailId = (await titolo.getAttribute("id"))!.replace("news-oggetto-", "");

  await page.goto(`/mail/${emailId}`);
  const l = await lingua(page);
  const categoria = page.getByLabel(messaggio(l, "posta", "classificazione.nuovaCategoria"));
  const annulla = page.getByRole("button", { name: messaggio(l, "posta", "classificazione.annulla") });
  await expect(categoria).toHaveValue("news");
  await expect(annulla).toHaveCount(0);

  await categoria.selectOption("informativa");
  await categoria.locator("xpath=ancestor::form").getByRole("button", { name: messaggio(l, "posta", "classificazione.salva") }).click();
  await expect(annulla).toBeVisible();
  await expect(categoria).toHaveValue("informativa");
  await page.goto("/news");
  await expect(page.locator(`[id="news-oggetto-${emailId}"]`)).toHaveCount(0);

  await page.goto(`/mail/${emailId}`);
  await annulla.click();
  await expect(annulla).toHaveCount(0);
  await expect(categoria).toHaveValue("news");
  await page.goto("/news");
  await expect(page.locator(`[id="news-oggetto-${emailId}"]`)).toHaveCount(1);
});
