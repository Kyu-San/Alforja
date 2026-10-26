# Descargador

App de escritorio (Tauri 2 + React) para bajar videos, audio y listas con
[yt-dlp](https://github.com/yt-dlp/yt-dlp) y ffmpeg. Uso personal. Nombre provisional.

## Requisitos

- Node 20+, Rust estable y las dependencias de Tauri de tu sistema: https://tauri.app/start/prerequisites/
- `yt-dlp` y `ffmpeg` en el PATH (o en la carpeta `bin` de los datos de la app, o en
  `DESCARGADOR_YTDLP` / `DESCARGADOR_FFMPEG`).

## Arrancar

```bash
npm install
npm run tauri dev        # la app de escritorio
npm run dev              # solo la interfaz en el navegador, con datos simulados
npm run tauri build      # instalador para tu sistema
```

## Pruebas

```bash
cd src-tauri && cargo test                       # unitarias
python3 scripts/test_server.py <carpeta> 8766 &  # ver src-tauri/tests/queue_e2e.rs
DESCARGADOR_TEST_SERVER=http://127.0.0.1:8766 cargo test --test queue_e2e -- --test-threads=1
npx vite --port 1420 & node e2e/screens.mjs      # interfaz (Playwright)
```

## Aviso

Bajar contenido de YouTube va contra sus términos salvo que el video ofrezca la
descarga. No se salta protecciones ni DRM; las listas privadas solo con tu propia
sesión del navegador. El uso es bajo tu responsabilidad.

`replica/` es la carpeta de trabajo del proceso de clonado (recon, arquitectura,
diseño, capturas). No forma parte de la app.
