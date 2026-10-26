import { axe, expect, paste, rows, test } from "./fixtures";

test.describe("F03 playlist", () => {
  test("F03-H2 filtrar, desmarcar y descargar 20", async ({ page }) => {
    await page.goto("/?seed=empty");
    await paste(page, "https://ejemplo.com/playlist?list=PL1");
    const dialog = page.getByRole("dialog", { name: "Descargar la lista" });
    await expect(dialog).toBeVisible();
    await axe(page, "S04");
    await dialog.getByLabel("Filtrar la lista").fill("ritmo");
    await dialog.getByRole("checkbox", { name: "Seleccionar los filtrados" }).click();
    await expect(dialog.getByText("20 de 24 seleccionados")).toBeVisible();
    await dialog.getByRole("button", { name: "Descargar 20" }).click();
    await expect(rows(page)).toHaveCount(20);
  });

  test("F03-E1 filtro sin resultados", async ({ page }) => {
    await page.goto("/");
    await paste(page, "https://ejemplo.com/playlist?list=PL1");
    await page.getByLabel("Filtrar la lista").fill("zzz");
    await expect(page.getByText("Nada coincide con «zzz».")).toBeVisible();
  });

  test("F03-E2 sin nada seleccionado no se puede descargar", async ({ page }) => {
    await page.goto("/");
    await paste(page, "https://ejemplo.com/playlist?list=PL1");
    const dialog = page.getByRole("dialog", { name: "Descargar la lista" });
    await dialog.getByRole("checkbox", { name: "Seleccionar todos" }).click();
    await expect(dialog.getByText("0 de 24 seleccionados")).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^Descargar/ })).toBeDisabled();
  });

  test("F03-E3 lista de 2.000: solo se pintan las filas visibles", async ({ page }) => {
    await page.goto("/?big=1");
    await paste(page, "https://ejemplo.com/playlist?list=PL1");
    const group = page.getByRole("group", { name: "Videos de la lista" });
    await expect(page.getByText("2000 de 2000 seleccionados")).toBeVisible();
    expect(await group.getByRole("checkbox").count()).toBeLessThan(40);
    await group.evaluate((e) => (e.scrollTop = 56 * 1500));
    await expect(group.getByText("Lección 1501: acordes básicos")).toBeVisible();
  });
});
