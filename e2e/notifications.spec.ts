import { expect, paste, rows, test } from "./fixtures";

type Win = Window & { __notifications?: { title: string; body?: string }[] };

/** Baja un video de 360p (rápido en la capa simulada) y espera a que termine. */
async function downloadOne(page: import("@playwright/test").Page) {
  await paste(page, "https://ejemplo.com/v/aviso");
  const dialog = page.getByRole("dialog", { name: "Descargar" });
  await dialog.getByRole("radio", { name: /^360p/ }).click();
  await dialog.getByRole("button", { name: "Descargar" }).click();
  await expect(rows(page).first()).toHaveAttribute("data-status", "done", { timeout: 20_000 });
  await page.waitForTimeout(300);
  return page.evaluate(() => (window as Win).__notifications ?? []);
}

test("NOT-H1 con la ventana detrás, avisa al terminar", async ({ page }) => {
  await page.addInitScript(() => (document.hasFocus = () => false));
  await page.goto("/?seed=empty");
  const sent = await downloadOne(page);
  expect(sent).toEqual([{ title: "Ya está en tu alforja", body: "Documental: el viaje de la luz (4K)" }]);
});

test("NOT-E1 con el aviso apagado, no avisa", async ({ page }) => {
  await page.addInitScript(() => (document.hasFocus = () => false));
  await page.goto("/?seed=empty#/preferencias/general");
  await page.getByRole("switch", { name: "Avisar al terminar" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("toolbar")).toBeVisible();
  expect(await downloadOne(page)).toEqual([]);
});

test("NOT-E2 con la ventana delante, no avisa", async ({ page }) => {
  await page.addInitScript(() => (document.hasFocus = () => true));
  await page.goto("/?seed=empty");
  expect(await downloadOne(page)).toEqual([]);
});
