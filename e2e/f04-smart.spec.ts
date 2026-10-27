import { axe, expect, paste, rows, test } from "./fixtures";

test.describe("F04 Smart Mode", () => {
  test("F04-H1 configurar una vez y pegar = descargar, sin diálogo", async ({ page }) => {
    await page.goto("/?seed=empty");
    const toggle = page.getByRole("button", { name: /^Smart Mode/ });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    const dialog = page.getByRole("dialog", { name: "Smart Mode" });
    await expect(dialog).toBeVisible();
    await axe(page, "S08");
    await dialog.getByRole("radio", { name: "Solo audio" }).click();
    await dialog.getByLabel("Formato").click();
    await page.getByRole("option", { name: "M4A" }).click();
    await dialog.getByRole("button", { name: "Guardar" }).click();
    await expect(dialog).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    await paste(page, "https://ejemplo.com/v/smart");
    await expect(page.getByText("En la cola con Smart Mode").first()).toBeVisible();
    await expect(page.getByRole("dialog")).toBeHidden();
    const row = rows(page).first();
    await expect(row).toContainText("M4A");
    await expect(row).toBeFocused();
  });

  test("F04-E3 el aviso de Smart Mode no se repite al volver a la lista", async ({ page }) => {
    await page.goto("/?seed=empty&smart=1");
    await paste(page, "https://ejemplo.com/v/una-vez");
    await expect(page.getByText("En la cola con Smart Mode").first()).toBeVisible();
    await page.getByRole("button", { name: "Cerrar aviso" }).first().click();
    await expect(page.getByRole("status").filter({ hasText: "En la cola con Smart Mode" })).toHaveCount(0);
    await page.getByRole("button", { name: "Suscripciones" }).click();
    await expect(page.getByRole("heading", { name: "Suscripciones", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("toolbar")).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByText("En la cola con Smart Mode")).toHaveCount(0);
  });

  test("F04-E4 activado, el botón se ve en color de acento", async ({ page }) => {
    await page.goto("/?seed=empty&smart=1");
    const toggle = page.getByRole("button", { name: /^Smart Mode/ });
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(toggle).toHaveCSS("color", "rgb(123, 147, 255)");
  });

  test("F04-E1 con Smart Mode, una lista sigue mostrando su diálogo con esas opciones", async ({ page }) => {
    await page.goto("/?seed=empty&smart=1");
    await paste(page, "https://ejemplo.com/playlist?list=PL1");
    const dialog = page.getByRole("dialog", { name: "Descargar la lista" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Calidad")).toContainText("Hasta 1080p");
  });

  test("F04-E2 desactivarlo vuelve al diálogo de siempre", async ({ page }) => {
    await page.goto("/?seed=empty&smart=1");
    await page.getByRole("button", { name: /^Smart Mode/ }).click();
    await page.getByRole("switch", { name: "Activar Smart Mode" }).click();
    await page.getByRole("button", { name: "Guardar" }).click();
    await paste(page, "https://ejemplo.com/v/normal");
    await expect(page.getByRole("dialog", { name: "Descargar" })).toBeVisible();
  });

  test("F01-E16 el diálogo recuerda la última elección", async ({ page }) => {
    await page.goto("/?seed=empty");
    await paste(page, "https://ejemplo.com/v/1");
    let dialog = page.getByRole("dialog", { name: "Descargar" });
    await dialog.getByRole("radio", { name: /^720p/ }).click();
    await dialog.getByLabel("Formato").click();
    await page.getByRole("option", { name: /MKV/ }).click();
    await dialog.getByRole("button", { name: "Descargar" }).click();
    await expect(dialog).toBeHidden();

    await page.reload();
    await paste(page, "https://ejemplo.com/v/2");
    dialog = page.getByRole("dialog", { name: "Descargar" });
    await expect(dialog.getByRole("radio", { name: /^720p/ })).toBeChecked();
    await expect(dialog.getByLabel("Formato")).toContainText("MKV");
  });
});
