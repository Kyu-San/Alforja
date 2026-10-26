#!/usr/bin/env python3
"""Genera tokens.css y tailwind.css desde tokens.json. Solo librería estándar.

    python3 replica/design/build_tokens.py

Vuelve a ejecutarlo tras cada cambio en tokens.json (también tras /replica-brand).
Nunca edites los .css generados a mano.
"""
import json
import pathlib

here = pathlib.Path(__file__).resolve().parent
t = json.loads((here / "tokens.json").read_text(encoding="utf-8"))
head = "/* Generado por build_tokens.py desde tokens.json. No editar a mano. */\n"

css = [head, ":root {", "  color-scheme: dark;"]
for k, v in t["color"].items():
    css.append(f"  --color-{k}: {v};")
for k, v in t["font"].items():
    css.append(f"  --font-{k}: {v};")
for k, v in t["type"].items():
    css += [f"  --text-{k}: {v['size']}px;", f"  --leading-{k}: {v['line']}px;", f"  --weight-{k}: {v['weight']};"]
for i, v in enumerate(t["space"]):
    css.append(f"  --space-{i}: {v}px;")
for k, v in t["radius"].items():
    css.append(f"  --radius-{k}: {v}px;")
for k, v in t["shadow"].items():
    css.append(f"  --shadow-{k}: {v};")
for k, v in t["motion"].items():
    css.append(f"  --motion-{k}: {v};")
for k in ("toolbar-height", "row-height", "row-height-compact", "dialog-width", "dialog-width-wide"):
    css.append(f"  --{k}: {t['layout'][k]}px;")
css += ["}", "",
        "html, body { background: var(--color-bg); color: var(--color-text);",
        "  font-family: var(--font-sans); font-size: var(--text-base); line-height: var(--leading-base); }",
        "@media (prefers-reduced-motion: reduce) { :root { --motion-fast: 0ms; --motion-base: 0ms; } }", ""]
(here / "tokens.css").write_text("\n".join(css), encoding="utf-8")

# Tailwind v4: @theme con los valores literales (no var() a sí mismas, que serían
# circulares). Tailwind los emite en :root con los mismos nombres que tokens.css,
# así que este archivo sustituye a tokens.css en la app; tokens.css queda para CSS sin Tailwind.
# Utilidades: bg-surface, text-text, text-muted, border-border-input, rounded-md, shadow-pop...
tw = [head, '@import "tailwindcss";', "", "@theme {",
      "  --color-*: initial;"]
for k, v in t["color"].items():
    tw.append(f"  --color-{'muted' if k == 'text-muted' else k}: {v};")
for k, v in t.get("overlay", {}).items():
    tw.append(f"  --color-{k}: {v};")
for k, v in t["font"].items():
    tw.append(f"  --font-{k}: {v};")
tw.append("  --text-*: initial;")
for k, v in t["type"].items():
    tw += [f"  --text-{k}: {v['size']}px;", f"  --text-{k}--line-height: {v['line']}px;"]
tw.append("  --radius-*: initial;")
for k, v in t["radius"].items():
    tw.append(f"  --radius-{k}: {v}px;")
tw.append("  --shadow-*: initial;")
for k, v in t["shadow"].items():
    tw.append(f"  --shadow-{k}: {v};")
L = t["layout"]
tw += [f"  --spacing-toolbar: {L['toolbar-height']}px;", f"  --spacing-row: {L['row-height']}px;",
       f"  --spacing-row-compact: {L['row-height-compact']}px;", f"  --spacing-dialog: {L['dialog-width']}px;",
       f"  --spacing-dialog-wide: {L['dialog-width-wide']}px;"]
tw += [f"  --spacing-thumb-w: {L['thumb'].split('x')[0]}px;", f"  --spacing-thumb-h: {L['thumb'].split('x')[1]}px;"]
tw += [f"  --duration-fast: {t['motion']['fast']};", f"  --duration-base: {t['motion']['base']};"]
tw += [f"  --ease-app: {t['motion']['ease']};", "  --spacing: 4px;", "}", "",
       "@layer base {",
       "  :root { color-scheme: dark; }",
       "  html, body { background: var(--color-bg); color: var(--color-text);",
       "    font-family: var(--font-sans); font-size: var(--text-base); line-height: var(--text-base--line-height); }",
       "}", ""]
(here / "tailwind.css").write_text("\n".join(tw), encoding="utf-8")
# Copia para la app: el código no depende de la carpeta replica/.
app_theme = here.parent.parent / "src" / "styles"
if app_theme.is_dir():
    (app_theme / "theme.css").write_text("\n".join(tw), encoding="utf-8")
print("tokens.css y tailwind.css generados:", len(t["color"]), "colores,", len(t["type"]), "tamaños de texto")
