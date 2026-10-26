import { test as base, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Cada prueba falla si hay errores o avisos en la consola, o excepciones. */
export const test = base.extend({
  page: async ({ page }, use) => {
    const problems: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text()}`);
    });
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    page.on("response", (r) => {
      if (r.status() >= 500) problems.push(`${r.status()} en ${r.url()}`);
    });
    await use(page);
    expect(problems, "consola limpia").toEqual([]);
  },
});
export { expect };

/** axe en la pantalla actual: 0 violaciones (WCAG 2.2 AA). */
export async function axe(page: Page, label: string) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
  // Los menús emergentes de Radix se pintan en un portal fuera de las regiones
  // (por diseño: el foco entra en ellos y Esc vuelve). Solo para la regla "region".
  const violations = r.violations
    .map((v) => (v.id === "region" ? { ...v, nodes: v.nodes.filter((n) => !n.target.join(" ").includes("data-radix-popper-content-wrapper")) } : v))
    .filter((v) => v.nodes.length);
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(summary, `axe en ${label}`).toEqual([]);
}

export async function paste(page: Page, text: string) {
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
  await page.getByRole("button", { name: "Pegar enlace" }).first().click();
}

export const rows = (page: Page) => page.getByRole("row");
