import { axe, expect, paste, test } from "./fixtures";

test.describe("F05 suscripciones", () => {
  test("F05-H1 suscribirse desde el diálogo de un canal y verlo en S05", async ({ page }) => {
    await page.goto("/?seed=empty");
    await page.getByRole("button", { name: "Suscripciones" }).click();
    await expect(page.getByText("Sin suscripciones")).toBeVisible();
    await axe(page, "S05 vacía");
    await page.keyboard.press("Escape");

    await paste(page, "https://ejemplo.com/@canal");
    const dialog = page.getByRole("dialog", { name: "Descargar del canal" });
    await dialog.getByRole("radio", { name: "Solo audio" }).click();
    await dialog.getByRole("button", { name: "Suscribirse" }).click();
    await expect(page.getByText("Suscrito a «Canal de ejemplo»").first()).toBeVisible();
    await page.getByRole("button", { name: "Ver suscripciones" }).first().click();

    const list = page.getByRole("list", { name: "Suscripciones" });
    await expect(list.getByRole("heading", { name: "Canal de ejemplo" })).toBeVisible();
    await expect(list).toContainText("MP3");
    await expect(list).toContainText("0 descargas");
    await axe(page, "S05 con una");
  });

  test("F05-E1 ya suscrito: error claro", async ({ page }) => {
    await page.goto("/?seed=empty");
    for (let i = 0; i < 2; i++) {
      await paste(page, "https://ejemplo.com/@canal");
      await page.getByRole("dialog").getByRole("button", { name: "Suscribirse" }).click();
    }
    await expect(page.getByText("Ya estás suscrito a ese enlace.").first()).toBeVisible();
  });

  test("F05-H2 comprobar ahora, pausar y darse de baja", async ({ page }) => {
    await page.goto("/?subs=1#/suscripciones");
    const list = page.getByRole("list", { name: "Suscripciones" });
    await expect(list.getByRole("listitem")).toHaveCount(3);
    await axe(page, "S05 con estados");

    await page.getByRole("button", { name: "Comprobar ahora Canal de cocina" }).click();
    await expect(page.getByText("1 video nuevo en la cola").first()).toBeVisible();
    await expect(list.getByRole("listitem").first()).toContainText("13 descargas");

    await page.getByRole("button", { name: "Comprobar ahora Canal que ya no existe" }).click();
    await expect(list.getByRole("listitem").nth(2)).toContainText("La última comprobación falló");

    await page.getByRole("switch", { name: "Pausar Canal de cocina" }).click();
    await expect(list.getByRole("listitem").first()).toContainText("En pausa");

    await page.getByRole("button", { name: "Darse de baja de Canal de cocina" }).click();
    const confirm = page.getByRole("dialog", { name: "¿Darse de baja?" });
    await expect(confirm.getByRole("button", { name: "No" })).toBeFocused();
    await confirm.getByRole("button", { name: "Darse de baja" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(2);
  });

  test("F05-N1 un video suelto no admite suscripción", async ({ page }) => {
    await page.goto("/?seed=empty");
    await paste(page, "https://ejemplo.com/v/suelto");
    await expect(page.getByRole("dialog", { name: "Descargar" }).getByRole("button", { name: "Suscribirse" })).toHaveCount(0);
  });

  test("F05-E3 el selector de frecuencia cabe en la cabecera", async ({ page }) => {
    await page.goto("/?subs=1#/suscripciones");
    const header = await page.locator("header").first().boundingBox();
    const select = await page.getByLabel("Frecuencia").boundingBox();
    // Centrado en la barra, como los botones (sin una etiqueta visible que lo empuje).
    const center = (b: { y: number; height: number }) => b.y + b.height / 2;
    expect(Math.abs(center(select!) - center(header!))).toBeLessThanOrEqual(2);
  });

  test("F05-E2 títulos largos y cambio de frecuencia", async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 480 });
    await page.goto("/?subs=1#/suscripciones");
    await expect(page.getByRole("heading", { name: /Podcast semanal/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByLabel("Frecuencia").click();
    await page.getByRole("option", { name: "Una vez al día" }).click();
    await expect(page.getByLabel("Frecuencia")).toContainText("Una vez al día");
  });

  test("F05-E6 S05 solo con teclado: pausar, comprobar y darse de baja", async ({ page }) => {
    await page.goto("/?subs=1#/suscripciones");
    const list = page.getByRole("list", { name: "Suscripciones" });
    await expect(list.getByRole("listitem")).toHaveCount(3);
    const sw = page.getByRole("switch", { name: "Pausar Canal de cocina" });
    await sw.focus();
    await page.keyboard.press("Space");
    await expect(list.getByRole("listitem").first()).toContainText("En pausa");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Comprobar ahora Canal de cocina" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByText("1 video nuevo en la cola").first()).toBeVisible();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    const confirm = page.getByRole("dialog", { name: "¿Darse de baja?" });
    await expect(confirm).toBeVisible();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(list.getByRole("listitem")).toHaveCount(2);
  });
});
