import { axe, expect, paste, rows, test } from "./fixtures";

test.describe("F01 bajar un video", () => {
  test("F01-H1 pegar, descargar y ver el progreso hasta Listo", async ({ page }) => {
    await page.goto("/?seed=empty");
    await axe(page, "S01 vacía");
    await paste(page, "https://ejemplo.com/v/1");
    const dialog = page.getByRole("dialog", { name: "Descargar" });
    await expect(dialog).toBeVisible();
    await axe(page, "S03");
    await dialog.getByRole("radio", { name: /^360p/ }).click();
    await dialog.getByRole("button", { name: "Descargar" }).click();
    await expect(dialog).toBeHidden();
    const row = rows(page).first();
    await expect(row).toHaveAttribute("data-status", /queued|downloading/);
    await expect(row).toHaveAttribute("data-status", "done", { timeout: 20_000 });
    await expect(row).toContainText("Listo");
    await axe(page, "S01 con una descarga");
  });

  test("F01-E1 portapapeles sin enlace y campo vacío", async ({ page }) => {
    await page.goto("/");
    await paste(page, "");
    const field = page.getByLabel("Enlace del video, la lista o el canal");
    await expect(field).toBeFocused();
    await expect(page.getByRole("button", { name: "Analizar" })).toBeDisabled();
    await axe(page, "S02 campo");
  });

  test("F01-E2 títulos muy largos: una línea, sin scroll horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 480 });
    await page.goto("/?seed=long");
    const title = rows(page).first().locator(".truncate").first();
    const [scroll, client] = await title.evaluate((e) => [e.scrollWidth, e.clientWidth]);
    expect(scroll).toBeGreaterThan(client);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test("F01-E5 buscar con y sin acentos", async ({ page }) => {
    await page.goto("/");
    const search = page.getByLabel("Buscar en la lista");
    await search.fill("cocina");
    await expect(rows(page)).toHaveCount(1);
    await search.fill("Cómo");
    await expect(rows(page)).toHaveCount(1);
    await search.press("Escape");
    await expect(rows(page)).toHaveCount(6);
  });

  test("F01-E6 doble clic en Descargar crea una sola descarga", async ({ page }) => {
    await page.goto("/?seed=empty");
    await paste(page, "https://ejemplo.com/v/doble");
    await page.getByRole("dialog", { name: "Descargar" }).getByRole("button", { name: "Descargar" }).dblclick();
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.waitForTimeout(500);
    await expect(rows(page)).toHaveCount(1);
  });

  test("F01-E7 Esc mientras analiza: el resultado tardío no abre nada", async ({ page }) => {
    await page.goto("/?slow=1");
    await paste(page, "https://ejemplo.com/v/1");
    await expect(page.getByRole("dialog", { name: "Analizando el enlace…" })).toBeVisible();
    await axe(page, "S02 analizando");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.waitForTimeout(3000);
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("F01-E12 solo teclado", async ({ page }) => {
    await page.goto("/?seed=empty");
    await page.evaluate(() => navigator.clipboard.writeText("https://ejemplo.com/v/teclado"));
    await page.locator("body").click({ position: { x: 500, y: 400 } });
    await page.keyboard.press("Control+v");
    const dialog = page.getByRole("dialog", { name: "Descargar" });
    await expect(dialog).toBeVisible();
    const download = dialog.getByRole("button", { name: "Descargar" });
    for (let i = 0; i < 20 && !(await download.evaluate((e) => e === document.activeElement)); i++) await page.keyboard.press("Tab");
    await expect(download).toBeFocused();
    await page.keyboard.press("Enter");
    const row = rows(page).first();
    await expect(row).toBeFocused();
    await page.keyboard.press("Space");
    await expect(row).toHaveAttribute("data-status", "paused");
    await page.keyboard.press("Space");
    await expect(row).not.toHaveAttribute("data-status", "paused");
  });

  for (const [w, h] of [[760, 480], [1440, 900]]) {
    test(`F01-E14 a ${w}px sin scroll horizontal`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto("/");
      await expect(rows(page)).toHaveCount(6);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }

  test("F01-N1 texto que no es un enlace", async ({ page }) => {
    await page.goto("/");
    await paste(page, "hola");
    const field = page.getByLabel("Enlace del video, la lista o el canal");
    await field.fill("no es un enlace");
    await field.blur();
    await expect(page.getByText(/Eso no parece un enlace/)).toBeVisible();
    await expect(field).toHaveAttribute("aria-invalid", "true");
  });

  test("F01-N3 video privado: error claro con detalle", async ({ page }) => {
    await page.goto("/");
    await paste(page, "https://ejemplo.com/video-privado");
    await expect(page.getByRole("dialog", { name: "No se pudo analizar" })).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("Es privado");
    await axe(page, "S02 error");
  });
});
