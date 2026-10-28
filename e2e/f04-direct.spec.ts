import { axe, expect, paste, rows, test } from "./fixtures";

test.describe("F04 Modo directo", () => {
  test("F04-H1 configurar una vez y pegar = descargar, sin diálogo", async ({ page }) => {
    await page.goto("/?seed=empty");
    const toggle = page.getByRole("button", { name: /^Modo directo/ });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    const dialog = page.getByRole("dialog", { name: "Modo directo" });
    await expect(dialog).toBeVisible();
    await axe(page, "S08");
    await dialog.getByRole("radio", { name: "Solo audio" }).click();
    await dialog.getByLabel("Formato").click();
    await page.getByRole("option", { name: "M4A" }).click();
    await dialog.getByRole("button", { name: "Guardar" }).click();
    await expect(dialog).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    await paste(page, "https://ejemplo.com/v/direct");
    await expect(page.getByText("Directo a la cola").first()).toBeVisible();
    await expect(page.getByRole("dialog")).toBeHidden();
    const row = rows(page).first();
    await expect(row).toContainText("M4A");
    await expect(row).toBeFocused();
  });

  test("F04-E3 el aviso de Modo directo no se repite al volver a la lista", async ({ page }) => {
    await page.goto("/?seed=empty&direct=1");
    await paste(page, "https://ejemplo.com/v/una-vez");
    await expect(page.getByText("Directo a la cola").first()).toBeVisible();
    await page.getByRole("button", { name: "Cerrar aviso" }).first().click();
    await expect(page.getByRole("status").filter({ hasText: "Directo a la cola" })).toHaveCount(0);
    await page.getByRole("button", { name: "Suscripciones" }).click();
    await expect(page.getByRole("heading", { name: "Suscripciones", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("toolbar")).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByText("Directo a la cola")).toHaveCount(0);
  });

  test("F04-E4 activado, el botón se ve en color de acento", async ({ page }) => {
    await page.goto("/?seed=empty&direct=1");
    const toggle = page.getByRole("button", { name: /^Modo directo/ });
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(toggle).toHaveCSS("color", "rgb(232, 153, 110)");
  });

  test("F04-E1 con Modo directo, una lista sigue mostrando su diálogo con esas opciones", async ({ page }) => {
    await page.goto("/?seed=empty&direct=1");
    await paste(page, "https://ejemplo.com/playlist?list=PL1");
    const dialog = page.getByRole("dialog", { name: "Descargar la lista" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Calidad")).toContainText("Hasta 1080p");
  });

  test("F04-E2 desactivarlo vuelve al diálogo de siempre", async ({ page }) => {
    await page.goto("/?seed=empty&direct=1");
    await page.getByRole("button", { name: /^Modo directo/ }).click();
    await page.getByRole("switch", { name: "Encender el modo directo" }).click();
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

  test("F04-E5 Modo directo con un enlace que falla muestra el error", async ({ page }) => {
    await page.goto("/?seed=empty&direct=1");
    await expect(page.getByRole("button", { name: /^Modo directo/ })).toHaveAttribute("aria-pressed", "true");
    await paste(page, "https://ejemplo.com/video-privado");
    await expect(page.getByRole("dialog", { name: "Ese enlace no se pudo leer" })).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("Es privado");
    await expect(rows(page)).toHaveCount(0);
  });

  test("F04-E7 configurar Modo directo solo con teclado", async ({ page }) => {
    await page.goto("/?seed=empty");
    const toggle = page.getByRole("button", { name: /^Modo directo/ });
    await toggle.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Modo directo" });
    await expect(dialog).toBeVisible();
    // El foco empieza dentro del diálogo; Guardar se alcanza con Tab.
    const save = dialog.getByRole("button", { name: "Guardar" });
    for (let i = 0; i < 25 && !(await save.evaluate((e) => e === document.activeElement)); i++) await page.keyboard.press("Tab");
    await expect(save).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  test("F01-E17 una elección guardada corrupta no rompe nada", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("alforja.ultima-eleccion", "{no es json"));
    await page.goto("/?seed=empty");
    await paste(page, "https://ejemplo.com/v/1");
    const dialog = page.getByRole("dialog", { name: "Descargar" });
    await expect(dialog.getByRole("radio", { name: "Video" })).toBeChecked();
    await expect(dialog.getByLabel("Formato")).toContainText("MP4");
  });
});
