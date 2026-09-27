import { expect, test } from "@playwright/test";
import { messaggio, URL_BASE } from "./demo";

/**
 * Lingua delle pagine pubbliche (§13.2): preferenza salvata, poi cookie `ec_lingua`, poi inglese.
 * Senza sessione conta solo il cookie; `Accept-Language` non viene mai usato.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const PAGINE = [
  { percorso: "/sign-in", namespace: "accesso" },
  { percorso: "/privacy", namespace: "privacy" },
] as const;

for (const { percorso, namespace } of PAGINE) {
  test.describe(percorso, () => {
    test("è in inglese per impostazione predefinita", async ({ page }) => {
      const risposta = await page.goto(percorso);
      expect(risposta?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(messaggio("en", namespace, "titolo"));
    });

    test("è in italiano con il cookie ec_lingua=it", async ({ page, context }) => {
      await context.addCookies([{ name: "ec_lingua", value: "it", url: URL_BASE }]);
      const risposta = await page.goto(percorso);
      expect(risposta?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", "it");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(messaggio("it", namespace, "titolo"));
    });

    test("ignora un valore di ec_lingua non supportato", async ({ page, context }) => {
      await context.addCookies([{ name: "ec_lingua", value: "fr", url: URL_BASE }]);
      await page.goto(percorso);
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
    });
  });
}

test.describe("Accept-Language italiano", () => {
  test.use({ locale: "it-IT" });

  test("non cambia la lingua predefinita", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(messaggio("en", "accesso", "titolo"));
  });
});
