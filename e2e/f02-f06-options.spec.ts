import { axe, expect, paste, rows, test } from "./fixtures";

test("F02-H2 solo audio crea una descarga MP3", async ({ page }) => {
  await page.goto("/?seed=empty");
  await paste(page, "https://ejemplo.com/v/audio");
  const dialog = page.getByRole("dialog", { name: "Descargar" });
  await dialog.getByRole("radio", { name: "Solo audio" }).click();
  await expect(dialog.getByLabel("Calidad del audio")).toBeVisible();
  await axe(page, "S03 audio");
  await dialog.getByRole("button", { name: "Descargar" }).click();
  await expect(rows(page).first()).toContainText("MP3");
});

test("F06-H1 subtítulos: elegir dos idiomas activa Incrustar", async ({ page }) => {
  await page.goto("/");
  await paste(page, "https://ejemplo.com/v/subs");
  const dialog = page.getByRole("dialog", { name: "Descargar" });
  const embed = dialog.getByRole("checkbox", { name: /Incrustar/ });
  await expect(embed).toBeDisabled();
  await dialog.getByLabel("Subtítulos", { exact: false }).and(dialog.getByRole("button")).click();
  await page.getByRole("menuitemcheckbox", { name: /Español/ }).click();
  await page.getByRole("menuitemcheckbox", { name: /Inglés/ }).click();
  await axe(page, "S03 menú de subtítulos");
  await page.keyboard.press("Escape");
  await expect(dialog.getByLabel("Subtítulos", { exact: false }).and(dialog.getByRole("button"))).toContainText("Español, Inglés");
  await expect(embed).toBeEnabled();
});

test("F06 pista de audio: muestra la original", async ({ page }) => {
  await page.goto("/");
  await paste(page, "https://ejemplo.com/v/pistas");
  await expect(page.getByLabel("Pista de audio")).toContainText("Original (Español)");
});
