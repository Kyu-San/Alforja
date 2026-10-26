import { axe, expect, paste, rows, test } from "./fixtures";

test.describe("F07 cola", () => {
  test("F07-H2 pausar, reanudar y cancelar desde la fila", async ({ page }) => {
    await page.goto("/?seed=empty");
    await paste(page, "https://ejemplo.com/v/cola");
    await page.getByRole("dialog").getByRole("button", { name: "Descargar" }).click();
    const row = rows(page).first();
    await expect(row).toHaveAttribute("data-status", "downloading");
    await row.hover();
    await row.getByRole("button", { name: "Pausar" }).click();
    await expect(row).toHaveAttribute("data-status", "paused");
    await row.getByRole("button", { name: "Reanudar" }).click();
    await expect(row).toHaveAttribute("data-status", /queued|downloading/);
    await row.getByRole("button", { name: "Cancelar" }).click();
    await expect(row).toHaveAttribute("data-status", "cancelled");
    await expect(row).toContainText("Cancelada");
  });

  test("F07-N1 un error se reintenta desde el menú contextual", async ({ page }) => {
    await page.goto("/?seed=empty");
    await paste(page, "https://ejemplo.com/v/error");
    await page.getByRole("dialog").getByRole("radio", { name: /^360p/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Descargar" }).click();
    const row = rows(page).first();
    await expect(row).toHaveAttribute("data-status", "error", { timeout: 20_000 });
    await row.click({ button: "right" });
    await axe(page, "S09");
    await page.getByRole("menuitem", { name: "Reintentar" }).click();
    await expect(row).toHaveAttribute("data-status", /queued|downloading/);
  });

  test("F07-E4 borrar el archivo pide confirmación", async ({ page }) => {
    await page.goto("/");
    await expect(rows(page)).toHaveCount(6);
    const done = page.locator("[role=row][data-status=done]").first();
    await done.click({ button: "right" });
    await page.getByRole("menuitem", { name: /Quitar y borrar el archivo/ }).click();
    const confirm = page.getByRole("dialog", { name: "¿Borrar el archivo?" });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByRole("button", { name: "No, dejarlo" })).toBeFocused();
    await axe(page, "confirmación de borrado");
    await confirm.getByRole("button", { name: "No, dejarlo" }).click();
    await expect(confirm).toBeHidden();
    await expect(rows(page)).toHaveCount(6);
  });

  test("F07-E5 quitar las terminadas deja las activas", async ({ page }) => {
    await page.goto("/");
    await expect(rows(page)).toHaveCount(6);
    await page.getByRole("button", { name: /^Más acciones/ }).click();
    await page.getByRole("menuitem", { name: "Quitar las terminadas" }).click();
    await expect(rows(page)).toHaveCount(3);
    await expect(page.getByText("3 quitadas de la lista").first()).toBeVisible();
  });
});
