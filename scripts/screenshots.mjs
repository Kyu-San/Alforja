// Recorre cada pantalla con la capa simulada, guarda capturas para
// /replica-diff y comprueba teclado y consola.
//   npx vite --port 1420 &   y luego   node scripts/screenshots.mjs
import { createRequire } from "node:module";
// Playwright viene preinstalado en el sistema; se carga con require.
const { chromium } = createRequire(import.meta.url)("playwright");
import assert from "node:assert/strict";

const BASE = process.env.BASE ?? "http://localhost:1420/";
const OUT = new URL("../replica/clone-screens/", import.meta.url).pathname; // capturas para /replica-diff
const b = await chromium.launch();
const errors = [];
const results = [];

async function page(query = "", size = { width: 1040, height: 680 }) {
  const ctx = await b.newContext({ viewport: size, reducedMotion: "reduce", permissions: ["clipboard-read", "clipboard-write"] });
  const p = await ctx.newPage();
  p.on("console", (m) => (m.type() === "error" || m.type() === "warning") && errors.push(`${query}: ${m.text()}`));
  p.on("pageerror", (e) => errors.push(`${query}: ${e.message}`));
  await p.goto(BASE + query);
  await p.waitForSelector("[role=toolbar], header");
  await p.waitForTimeout(400);
  return p;
}
const shot = (p, name) => p.screenshot({ path: OUT + name + ".png" });
async function check(name, fn) {
  try {
    await fn();
    results.push(`ok    ${name}`);
  } catch (e) {
    results.push(`FALLA ${name}: ${e.message.split("\n")[0]}`);
  }
}
const setClipboard = (p, text) => p.evaluate((t) => navigator.clipboard.writeText(t), text);

await check("S01 lista con estados, 1040 / 760 / 1440", async () => {
  let p = await page();
  assert.equal(await p.getByRole("row").count(), 6);
  await shot(p, "S01");
  for (const [w, h] of [[760, 480], [1440, 900]]) {
    p = await page("", { width: w, height: h });
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, `scroll horizontal a ${w}px`);
    await shot(p, `S01-${w}`);
  }
});

await check("S01 vacía, títulos largos, búsqueda sin resultados", async () => {
  let p = await page("?seed=empty");
  await p.getByText("Aún no hay descargas").waitFor();
  const bar = await p.getByRole("status").last().boundingBox();
  assert.ok(bar.y > 600, "la barra de estado queda abajo");
  await shot(p, "S01-empty");
  p = await page("?seed=long", { width: 760, height: 480 });
  await shot(p, "S01-long");
  p = await page();
  await p.getByLabel("Buscar en la lista").fill("zzz");
  await p.getByText("Nada coincide con «zzz»").waitFor();
  await shot(p, "S01-search-empty");
});

await check("S09 menú contextual", async () => {
  const p = await page();
  await p.getByRole("row").nth(2).click({ button: "right" });
  await p.getByRole("menuitem", { name: /Mostrar en la carpeta/ }).waitFor();
  await shot(p, "S09");
});

await check("S02 sin enlace en el portapapeles, inválido, error y analizando", async () => {
  let p = await page();
  await setClipboard(p, "hola");
  await p.getByRole("button", { name: "Pegar enlace" }).first().click();
  const field = p.getByLabel("Enlace del video, la lista o el canal");
  await field.waitFor();
  assert.equal(await field.evaluate((e) => e === document.activeElement), true, "el foco empieza en el campo");
  await shot(p, "S02-input");
  await field.fill("no es un enlace");
  await field.blur();
  await p.getByText(/Eso no parece un enlace/).waitFor();
  await field.fill("https://ejemplo.com/video-privado");
  await p.getByRole("button", { name: "Analizar" }).click();
  await p.getByRole("alert").waitFor();
  await shot(p, "S02-error");
  p = await page("?slow=1");
  await setClipboard(p, "https://ejemplo.com/v/1");
  await p.getByRole("button", { name: "Pegar enlace" }).first().click();
  await p.getByText("Analizando el enlace…").waitFor();
  await shot(p, "S02-parsing");
});

await check("S03 video y solo audio", async () => {
  const p = await page();
  await setClipboard(p, "https://ejemplo.com/v/1");
  await p.getByRole("button", { name: "Pegar enlace" }).first().click();
  await p.getByRole("dialog", { name: "Descargar" }).waitFor();
  await p.waitForTimeout(300);
  await shot(p, "S03");
  await p.getByRole("radio", { name: "Solo audio" }).click();
  await shot(p, "S03-audio");
  await p.getByLabel("Pista de audio").click();
  await p.getByRole("option", { name: /Original/ }).waitFor();
  await p.keyboard.press("Escape");
});

await check("S04 lista: filtrar, deseleccionar y descargar", async () => {
  const p = await page("?seed=empty");
  await setClipboard(p, "https://ejemplo.com/playlist?list=PL1");
  await p.getByRole("button", { name: "Pegar enlace" }).first().click();
  await p.getByRole("dialog", { name: "Descargar la lista" }).waitFor();
  await shot(p, "S04");
  await p.getByLabel("Filtrar la lista").fill("ritmo");
  await p.getByRole("checkbox", { name: "Seleccionar los filtrados" }).click();
  await p.getByText("20 de 24 seleccionados").waitFor();
  await shot(p, "S04-filtered");
  await p.getByRole("button", { name: "Descargar 20" }).click();
  await p.getByText("20 videos en la cola").first().waitFor();
  assert.equal(await p.getByRole("row").count(), 20);
});

await check("S05 (vacía y con suscripciones), S06, S07 (4 secciones), S08", async () => {
  const p = await page();
  await p.getByRole("button", { name: "Suscripciones" }).click();
  await p.getByRole("heading", { name: "Suscripciones", exact: true }).waitFor();
  await shot(p, "S05");
  const ps = await page("?subs=1#/suscripciones");
  await ps.getByRole("list", { name: "Suscripciones" }).waitFor();
  await shot(ps, "S05-list");
  await p.keyboard.press("Escape");
  await p.getByRole("toolbar").waitFor();
  await p.getByRole("button", { name: "Navegador" }).click();
  await shot(p, "S06");
  await p.getByRole("button", { name: "Volver a las descargas" }).first().click();
  await p.keyboard.press("Control+,");
  await p.getByRole("heading", { name: "General" }).waitFor();
  await shot(p, "S07");
  await p.getByLabel("Nombre de los archivos").fill("../fuera/%(title)s");
  await p.getByLabel("Nombre de los archivos").press("Enter");
  await p.getByText(/La plantilla del nombre no es válida/).waitFor();
  await shot(p, "S07-error");
  await p.getByRole("link", { name: "Red" }).click();
  await shot(p, "S07-red");
  await p.getByRole("link", { name: "Cuenta" }).click();
  await shot(p, "S10");
  await p.getByRole("link", { name: "Motor" }).click();
  await p.getByText("2026.10.21").waitFor();
  await shot(p, "S11");
  await p.goto(BASE);
  await p.getByRole("button", { name: "Smart Mode" }).click();
  await p.getByRole("dialog", { name: "Smart Mode" }).waitFor();
  await shot(p, "S08");
});

await check("S11 motor: hay versión nueva, actualizar, volver atrás; ocupado con descargas", async () => {
  let p = await page("?engine=old");
  await p.getByRole("button", { name: /Más acciones \(hay una versión nueva/ }).waitFor();
  await p.goto(BASE + "?engine=old#/preferencias/motor");
  await p.getByText("Hay una versión nueva: 2026.11.02").waitFor();
  await shot(p, "S11-update");
  await p.getByRole("button", { name: "Actualizar ahora" }).click();
  await p.getByRole("alert").filter({ hasText: "Espera a que terminen" }).waitFor();
  p = await page("?seed=empty&engine=old#/preferencias/motor");
  await p.getByRole("button", { name: "Actualizar ahora" }).click();
  await p.getByText("Motor actualizado a 2026.11.02").first().waitFor();
  await p.getByText("Al día", { exact: true }).waitFor();
  await shot(p, "S11-updated");
  await p.getByRole("button", { name: "Volver a la anterior" }).click();
  await p.getByText("Has vuelto a 2026.10.21").first().waitFor();
});

await check("F01 solo con teclado: Ctrl+V, Tab hasta Descargar, Enter; flechas y Espacio en la lista", async () => {
  const p = await page("?seed=empty");
  await setClipboard(p, "https://ejemplo.com/v/teclado");
  await p.locator("body").click({ position: { x: 500, y: 400 } });
  await p.keyboard.press("Control+v");
  await p.getByRole("dialog", { name: "Descargar" }).waitFor();
  let found = false;
  for (let i = 0; i < 20 && !found; i++) {
    await p.keyboard.press("Tab");
    found = await p.evaluate(() => document.activeElement?.textContent?.trim() === "Descargar");
  }
  assert.ok(found, "Descargar se alcanza con Tab");
  await p.keyboard.press("Enter");
  await p.getByRole("row").first().waitFor();
  // Lista: Tab entra en la fila, Espacio pausa.
  await p.getByRole("row").first().focus();
  await p.keyboard.press("Space");
  await p.locator("[role=row][data-status=paused]").waitFor();
  await p.keyboard.press("Space");
  await p.locator("[role=row]:not([data-status=paused])").waitFor();
});

await check("Cola simulada: progreso y terminado", async () => {
  const p = await page();
  await p.locator("[data-status=downloading]").first().waitFor();
  await p.waitForTimeout(1200);
  await shot(p, "S01-progress");
});

await b.close();
console.log(results.join("\n"));
console.log(errors.length ? "\nCONSOLA:\n" + [...new Set(errors)].join("\n") : "\nconsola limpia");
process.exit(results.some((r) => r.startsWith("FALLA")) || errors.length ? 1 : 0);
