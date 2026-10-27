import { axe, expect, test } from "./fixtures";

test("F08-H1 navegador no construido, Esc vuelve", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Navegador" }).click();
  await expect(page.getByText("El navegador integrado aún no está disponible")).toBeVisible();
  await axe(page, "S06");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("toolbar")).toBeVisible();
});

test("NAV-E1 Esc vuelve a la lista aunque el foco no esté en la pantalla", async ({ page }) => {
  await page.goto("/#/suscripciones");
  await expect(page.getByRole("heading", { name: "Suscripciones", exact: true })).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Escape");
  await expect(page.getByRole("toolbar")).toBeVisible();
});

test.describe("S07 preferencias", () => {
  test("S07-N1 valores inválidos: error junto al campo", async ({ page }) => {
    await page.goto("/#/preferencias/general");
    await axe(page, "S07");
    const tpl = page.getByLabel("Nombre de los archivos");
    await tpl.fill("../fuera/%(title)s");
    await tpl.press("Enter");
    await expect(page.getByText(/La plantilla del nombre no es válida/)).toBeVisible();
    await page.getByRole("link", { name: "Red" }).click();
    const proxy = page.getByLabel("Proxy");
    await proxy.fill("ftp//x");
    await proxy.press("Enter");
    await expect(page.getByText(/Escribe una dirección que empiece por/)).toBeVisible();
    await axe(page, "S07 red con error");
  });

  test("S07-H1 guardar simultáneas y sesión del navegador", async ({ page }) => {
    await page.goto("/#/preferencias/general");
    await page.getByLabel("Cuántas").click();
    await page.getByRole("option", { name: "5" }).click();
    await page.getByRole("link", { name: "Cuenta" }).click();
    await axe(page, "S10");
    await page.getByLabel("Navegador").click();
    await page.getByRole("option", { name: /Firefox/ }).click();
    await page.getByRole("link", { name: "General" }).click();
    await expect(page.getByLabel("Cuántas")).toContainText("5");
    await page.getByRole("link", { name: "Cuenta" }).click();
    await expect(page.getByLabel("Navegador")).toContainText("Firefox");
  });

  test("S07-H2 avisar al terminar se puede apagar", async ({ page }) => {
    await page.goto("/#/preferencias/general");
    const sw = page.getByRole("switch", { name: "Avisar al terminar" });
    await expect(sw).toBeChecked();
    await sw.click();
    await expect(sw).not.toBeChecked();
  });
});

test.describe("F09 motor", () => {
  test("F09-H1 actualizar y volver atrás", async ({ page }) => {
    await page.goto("/?seed=empty&engine=old#/preferencias/motor");
    await expect(page.getByText("Hay una versión nueva: 2026.11.02")).toBeVisible();
    await axe(page, "S11");
    await page.getByRole("button", { name: "Actualizar ahora" }).click();
    await expect(page.getByText("Motor actualizado a 2026.11.02").first()).toBeVisible();
    await expect(page.getByText("Al día", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Volver a la anterior" }).click();
    await expect(page.getByText("Has vuelto a 2026.10.21").first()).toBeVisible();
  });

  test("F09-N1 con descargas en marcha no actualiza", async ({ page }) => {
    await page.goto("/?engine=old");
    await expect(page.getByRole("button", { name: /Más acciones \(hay una versión nueva/ })).toBeVisible();
    await page.locator("[data-status=downloading]").first().waitFor();
    await page.goto("/?engine=old#/preferencias/motor");
    await page.locator("text=Hay una versión nueva").waitFor();
    // La cola simulada arranca al cargar: hay descargas en marcha.
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Actualizar ahora" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Espera a que terminen" })).toBeVisible();
  });
});
