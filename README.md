# Alforja

Pega el enlace de un video, una lista o un canal y Alforja lo baja: video hasta
4K/8K si la fuente lo tiene, solo audio (MP3, M4A, OGG), subtítulos, listas
enteras o los videos que elijas. Con el **modo directo**, cada video que pegues se
baja sin preguntarte; con las **suscripciones**, lo nuevo de un canal se baja solo.

App de escritorio (Tauri 2 + React) sobre [yt-dlp](https://github.com/yt-dlp/yt-dlp)
y ffmpeg. Uso personal.

## Instalar

Los instaladores salen de GitHub Actions (`.github/workflows/release.yml`) al
subir a la rama `release` (`git push origin main:release`), al subir una etiqueta
`v*` o a mano desde la pestaña Actions. Quedan en un borrador de release, en la
pestaña Releases. Ahora solo se compila el de Windows (los demás están comentados
en el flujo). No están firmados, así que la primera vez:

| sistema | instalador | primera vez |
| --- | --- | --- |
| Windows | `.msi` o `-setup.exe` | SmartScreen: "Más información" → "Ejecutar de todas formas" |
| macOS | `.dmg` (Apple Silicon o Intel) | clic derecho en Alforja → Abrir → Abrir. Si dice "dañada": `xattr -dr com.apple.quarantine /Applications/Alforja.app` |
| Linux (Debian/Ubuntu) | `.deb` | `sudo apt install ./Alforja_0.1.0_amd64.deb` (instala ffmpeg si falta) |
| Linux (otros) | `.AppImage` o `.rpm` | — |

### ffmpeg

Hace falta para unir video y audio por encima de 1080p, sacar MP3 e incrustar
subtítulos. En Linux con el `.deb` se instala solo. En el resto:

- Windows: `winget install Gyan.FFmpeg`
- macOS: `brew install ffmpeg`
- o copia el ejecutable `ffmpeg` en la carpeta `bin` de los datos de Alforja (abajo).

Preferencias → Motor dice si lo encuentra.

### yt-dlp (el motor)

No tienes que hacer nada: si no lo encuentra al arrancar, Alforja descarga la
versión oficial de GitHub, comprueba su suma SHA-256 y la instala en su carpeta.
Una vez al día mira si hay una nueva (se puede apagar), porque los sitios cambian
y el motor deja de funcionar si no se actualiza. Si una versión nueva da
problemas, Preferencias → Motor → "Volver a la anterior".

## Usar

1. Copia el enlace en tu navegador y pulsa **Pegar enlace** (o Ctrl+V / ⌘V).
2. Elige calidad, formato, subtítulos y carpeta. Alforja recuerda tu última elección.
3. **Descargar.** La fila muestra el progreso; si no había la calidad pedida, lo dice.

- **Modo directo** (barra de arriba): elige una vez cómo quieres tus descargas y
  cada video que pegues se baja así, sin diálogo.
- **Listas y canales**: eliges qué videos bajar, o pulsas **Suscribirse** para que
  los nuevos se bajen solos (Suscripciones, en la barra de arriba).
- **La cola**: pausa, reanuda, cancela o reintenta desde la fila, el clic derecho
  o el teclado (flechas, Espacio pausa o reanuda, Intro abre, Supr quita).
- **Tus listas privadas o "Ver más tarde"**: Preferencias → Cuenta, elige el
  navegador donde tienes la sesión abierta (Firefox es el que mejor funciona).

## Tus datos

Todo es local: no hay cuentas ni servidor. Lo único que sale de tu equipo son las
peticiones a los sitios de los enlaces que pegas y, una vez al día como mucho, la
consulta a GitHub por versiones de yt-dlp.

| sistema | carpeta de datos (lista de descargas, ajustes, motor) |
| --- | --- |
| Windows | `%APPDATA%\app.alforja.desktop` |
| macOS | `~/Library/Application Support/app.alforja.desktop` |
| Linux | `~/.local/share/app.alforja.desktop` |

Los videos van a tu carpeta de Descargas (o la que elijas), no a esa carpeta.

**Desinstalar:** desinstala la app como cualquier otra y, si quieres borrar
también la lista y los ajustes, borra la carpeta de datos. Tus videos no se tocan.

## Aviso

Bajar contenido de YouTube va contra sus términos salvo que el video ofrezca la
descarga. Alforja no se salta protecciones ni DRM, y las listas privadas solo se
bajan con tu propia sesión. El uso es bajo tu responsabilidad.

## Desarrollo

Requisitos: Node 20+, Rust estable y las dependencias de Tauri de tu sistema
(https://tauri.app/start/prerequisites/), más `yt-dlp` y `ffmpeg`.

```bash
npm install
npm run tauri dev        # la app de escritorio
npm run dev              # solo la interfaz en el navegador, con datos simulados
npm run tauri build      # instalador para tu sistema
```

Pruebas (las mismas que corre `.github/workflows/ci.yml`):

```bash
scripts/make_fixtures.sh /tmp/fixtures 8766              # videos de prueba, sin internet
python3 scripts/test_server.py /tmp/fixtures 8766 &      # servidor local
(cd src-tauri && ALFORJA_TEST_SERVER=http://127.0.0.1:8766 cargo test -- --test-threads=1)
npx playwright test                                      # interfaz + accesibilidad (axe)
node scripts/screenshots.mjs                             # capturas para replica/clone-screens
python3 scripts/sweep.py . --config replica/brand.json   # nada del original
```

`replica/` es la carpeta de trabajo del proceso de clonado (recon, arquitectura,
diseño, pruebas, paridad, marca). No forma parte de la app.
