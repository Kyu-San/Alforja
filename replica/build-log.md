# Registro de construcción

Una línea por pantalla: ID, fecha, estado, lo que falta y lo que costó más de lo esperado.
Capturas en `replica/clone-screens/` (`real-*.png` = la app de escritorio real en Xvfb; el resto = interfaz con la capa simulada).

| ID | fecha | estado | falta | más difícil de lo esperado |
| --- | --- | --- | --- | --- |
| núcleo | 2026-10-26 | hecho | — | El `pragma journal_mode = wal` dentro de la migración rompía el primer arranque con un archivo real (en memoria no fallaba). Lo encontró la prueba de integración. |
| F01 (rebanada vertical) | 2026-10-26 | hecho | — | Probado en la app real: portapapeles → análisis → diálogo → descarga → archivo en disco (`real-F01-done.png`). |
| S01 lista | 2026-10-26 | hecho | virtualizar la lista principal si pasa de unos cientos de filas | La lista vacía dejaba la barra de estado a media ventana; foco itinerante = selección (si no, Espacio no hacía nada). |
| S02 análisis | 2026-10-26 | hecho | — | — |
| S03 un video | 2026-10-26 | hecho | probar subtítulos y pistas de audio con un video real | Radix Select no admite `""` como valor (la pista de audio salía vacía). El foco inicial caía en Cerrar y abría su tooltip. |
| S04 lista / canal | 2026-10-26 | parcial | la raíz de un canal (`@nombre`) devuelve pestañas, no videos | Probado en la app real con un RSS local (`real-S04.png`). |
| S05 suscripciones | 2026-10-26 | solo pantalla | todo (recomendable) | — |
| S06 navegador | 2026-10-26 | solo pantalla | todo (opcional) | — |
| S07 preferencias | 2026-10-26 | parcial | idioma de la interfaz | Validación en los dos lados (Rust y capa simulada). |
| S08 Smart Mode | 2026-10-26 | solo diálogo | todo (recomendable) | — |
| S09 menú contextual | 2026-10-26 | hecho | probar Abrir/Mostrar en un escritorio real | — |
| S10 cuenta | 2026-10-26 | parcial | probar con un perfil de navegador real | El mismo fallo de Radix con `""`. |
| S11 motor | 2026-10-26 | parcial | **actualizar yt-dlp desde la app (F09)** | — |

## Cómo se probó

- `cargo test` (11 unitarias): URLs, plantillas, selectores, argumentos, errores, JSON de yt-dlp, base de datos.
- `cargo test --test queue_e2e` (6 de integración, yt-dlp y ffmpeg reales contra `scripts/test_server.py`): unir video+audio con caída de calidad, MP3, errores y reintento, pausar/reanudar/cancelar a mitad, límite de simultáneas, lista.
- `node e2e/screens.mjs` (9 recorridos, Playwright con la capa simulada): todas las pantallas y estados, 760/1040/1440 px sin scroll horizontal, flujo F01 solo con teclado, consola limpia.
- La app de escritorio real en Xvfb: F01, F03 y un error, pulsando en la interfaz.

## Desviaciones de la Definition of done

- **390 px:** no aplica; es una app de escritorio con ventana mínima de 760×480. Se comprueban 760, 1040 y 1440.
- **Comportamiento de duplicados:** pedir un video que ya está en la carpeta termina al instante (yt-dlp ve el archivo y no lo vuelve a bajar). Las dos filas apuntan al mismo archivo.
- **Sin internet a YouTube** en este entorno: todo el motor se probó con MP4, HLS y RSS locales.
