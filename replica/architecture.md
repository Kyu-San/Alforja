# Arquitectura: tu descargador (rehace las funciones principales de 4K Video Downloader+)

Una app de escritorio local, para una sola persona. No hay servidor, cuentas,
pagos ni emails. Por eso la pila web por defecto de la skill (Next.js,
Supabase, Stripe, Vercel...) **no aplica**. La equivalente para escritorio es:

## Stack

| capa | elección | por qué |
| --- | --- | --- |
| contenedor de la app | **Tauri 2** | instaladores de ~10 MB frente a ~150 MB de Electron; gestiona procesos hijo (sidecars), portapapeles, notificaciones y diálogos de carpeta con plugins oficiales. Si no quieres tocar Rust: cámbialo por Electron (mismo diseño; el backend pasa a Node) |
| interfaz | React + TypeScript + Vite | lo más documentado; Tauri lo trae como plantilla |
| estilos | Tailwind, con los tokens de `/replica-design` | igual que el resto del pack |
| estado de la interfaz | Zustand + eventos de Tauri | el backend manda el progreso y la interfaz solo lo pinta |
| base de datos | SQLite (`tauri-plugin-sql` o `rusqlite`) en la carpeta de datos de la app | un archivo local, sin servidor; ver `schema.sql` |
| motor de descarga | **yt-dlp** (binario oficial de GitHub) | soporta YouTube y más de 1.000 sitios, con subtítulos, playlists y cookies del navegador. Se guarda en la carpeta de datos (escribible) para poder actualizarlo |
| procesado | **ffmpeg** (incluido como sidecar) | une video y audio por encima de 1080p, extrae MP3/M4A/OGG e incrusta subtítulos |
| tareas en segundo plano | planificador dentro del backend de Rust (tokio) | la cola, las suscripciones cada N horas y la comprobación del motor. No hace falta un servicio externo |
| notificaciones | `tauri-plugin-notification` | "descarga terminada" |
| actualizaciones de la app | ninguna al principio (uso personal) | recompilas e instalas. Si un día hace falta: `tauri-plugin-updater` |
| empaquetado | `tauri build` en tu propia máquina | .msi/.exe, .dmg o .AppImage/.deb. Sin firmar: en macOS se abre con clic derecho → Abrir |

Una base de datos y un proceso, sin servicios aparte. No necesitamos la
arquitectura del original, solo sus funciones.

Estructura del proyecto:

```
src/                      interfaz React (pantallas S01–S11)
src-tauri/src/
  commands.rs             los comandos de abajo
  queue.rs                planificador de la cola (un único actor)
  engine.rs               lanzar, parsear y actualizar yt-dlp
  subscriptions.rs        comprobación periódica
  db.rs                   acceso a SQLite
src-tauri/migrations/0001_init.sql   = replica/schema.sql
src-tauri/binaries/       ffmpeg (sidecar). yt-dlp se descarga en el primer arranque
```

## Esquema

Tablas: 5 (`presets`, `playlists`, `subscriptions`, `downloads`,
`settings`). Reglas de acceso: **ninguna por fila**, porque solo hay un
usuario y el archivo es local. La única puerta es la capa de comandos de
Tauri, que valida cada entrada (ver "seguridad" abajo). SQL completo en
`replica/schema.sql`, probado en SQLite.

Restricciones que resuelven problemas en la base de datos, no en la
interfaz:

- `downloads_subscription_video` (índice único): una suscripción nunca pone
  el mismo video dos veces en la cola, aunque se crucen dos comprobaciones.
- `presets_one_smart_mode` (índice único parcial): solo puede haber un preset
  de Smart Mode.
- `check` de contenedor según el tipo: no existe "audio en MP4" ni "video en
  MP3".
- `done` exige `output_path` y `finished_at`, y `error` exige `error_code`.
  Así no hay estados a medias.
- `settings.id = 1`: solo hay una fila de ajustes.
- Al borrar: una suscripción o playlist deja sus descargas (`set null`) y un
  preset en uso no se puede borrar (`restrict`).

`MediaInfo` (el resultado de analizar un enlace) **no es una tabla**. Vive en
memoria con una caché de 10 minutos por URL, porque los enlaces de los
formatos de YouTube caducan.

## API (comandos de Tauri)

Quién puede llamar: solo la interfaz local, mediante `invoke()`. En la config
de Tauri, las *capabilities* exponen estos comandos y nada más: sin acceso
general a la shell ni al sistema de archivos desde la interfaz.

### F01 / F02: bajar un video o su audio

| comando | hace | entrada | salida | flujo |
| --- | --- | --- | --- | --- |
| `parse_url` | `yt-dlp -J --flat-playlist -- <url>`, normaliza formatos, audios y subtítulos | `url` | `MediaInfo` (video) o `PlaylistInfo` (lista ligera) | F01, F02, F03 |
| `start_download` | inserta en `downloads` (queued) y despierta la cola | `url`, `options` (kind, container, quality, audio_lang, subtitle_langs, embedded, output_dir) | `Download` | F01, F02, F06 |
| `smart_download` | `parse_url` y luego `start_download` con el preset de Smart Mode, sin diálogo | `url` | `Download` o un error que pide abrir el diálogo | F04 |

### F03: playlists y canales

| comando | hace | entrada | salida | flujo |
| --- | --- | --- | --- | --- |
| `start_playlist_download` | crea `playlists` y una fila en `downloads` por cada video elegido, en una sola transacción | `playlist_info`, `selected_ids[]`, `options` | `Playlist` + n `Download` | F03 |

### F07: la cola

| comando | hace | entrada | salida | flujo |
| --- | --- | --- | --- | --- |
| `list_downloads` | lista paginada de S01 | `filter`, `search`, `cursor` | `Download[]` | F07 |
| `pause_download` | mata el proceso (y sus hijos), estado `paused`; el `.part` se queda en disco | `id` | `Download` | F07 |
| `resume_download` | vuelve a `queued`; yt-dlp continúa el `.part` con `--continue` | `id` | `Download` | F07 |
| `cancel_download` | mata el proceso, borra los `.part`, estado `cancelled` | `id` | `Download` | F07 |
| `retry_download` | `error` → `queued`, `attempts + 1` | `id` | `Download` | F07, F09 |
| `remove_download` | borra la fila y, si lo pides, también el archivo | `id`, `delete_file` | — | F07 |
| `clear_finished` | borra de la lista los `done`, `cancelled` y `error` | — | n | F07 |
| `open_file` / `reveal_in_folder` | abre el archivo o la carpeta con el plugin `opener` | `id` | — | F01 |

### F04: Smart Mode y presets

| comando | hace | entrada | salida | flujo |
| --- | --- | --- | --- | --- |
| `list_presets` / `save_preset` / `delete_preset` | gestiona los presets | `Preset` | `Preset[]` | F04, F05 |
| `set_smart_mode` | marca un preset como Smart Mode o lo desactiva | `preset_id` o `null` | `Preset` | F04 |

### F05: suscripciones

| comando | hace | entrada | salida | flujo |
| --- | --- | --- | --- | --- |
| `subscribe` | crea la suscripción y apunta los videos actuales como vistos, **sin bajarlos** (si no, suscribirte a un canal grande lo descargaría entero) | `url`, `preset_id` | `Subscription` | F05 |
| `list_subscriptions` / `update_subscription` / `unsubscribe` | gestiona las suscripciones | … | … | F05 |
| `check_subscription_now` | ejecuta ya la comprobación de una suscripción | `id` | n videos nuevos en la cola | F05 |

### F08: navegador integrado

| comando | hace | entrada | salida | flujo |
| --- | --- | --- | --- | --- |
| `open_browser_window` | abre una ventana WebView con la URL; no tiene permisos para llamar a comandos | `url?` | — | F08 |
| `browser_download_current` | lo llama la ventana principal (no la página web) con la URL actual y abre S03 | — | `MediaInfo` | F08 |

### F09 / S07 / S11: ajustes y motor

| comando | hace | entrada | salida | flujo |
| --- | --- | --- | --- | --- |
| `get_settings` / `update_settings` | lee y escribe la fila de ajustes, validada | `Partial<Settings>` | `Settings` | S07 |
| `engine_status` | versión de yt-dlp y ffmpeg, y si hay una nueva | — | `EngineStatus` | F09 |
| `update_engine` | descarga el yt-dlp nuevo de GitHub Releases, **verifica el SHA-256** con `SHA2-256SUMS`, lo prueba (`--version`) y lo cambia; guarda el anterior | — | `EngineStatus` | F09 |
| `rollback_engine` | vuelve a la versión anterior | — | `EngineStatus` | F09 |

Eventos del backend a la interfaz (sustituyen a los webhooks): 
`download:progress` (id, bytes, total, velocidad, ETA; como mucho 4 por segundo y descarga),
`download:status` (id, estado, error), `subscription:checked`, `engine:updated`.
No hay webhooks de entrada ni de salida.

Tareas en segundo plano:

| tarea | cuándo | qué hace |
| --- | --- | --- |
| planificador de la cola | siempre; se despierta con cada cambio | mientras haya hueco (`max_concurrent`), toma el `queued` con menor `position` y lanza yt-dlp |
| recuperación al arrancar | al abrir la app | `downloading`, `parsing` y `processing` pasan a `queued` (o a `paused` si lo prefieres) |
| suscripciones | al arrancar y cada `subscription_every_h` horas, una a una con pausa entre ellas | `yt-dlp --flat-playlist --playlist-end 30`; los videos nuevos van a la cola con el preset de la suscripción |
| comprobar el motor | al arrancar, como mucho una vez al día | si hay versión nueva: la actualiza (con auto-update activado) o avisa |
| limpieza | al arrancar | `.part` huérfanos de más de 7 días que no tienen fila |

Nunca se llama a APIs privadas de nadie. Solo hablamos con yt-dlp, ffmpeg y
GitHub Releases (para actualizar yt-dlp).

## Lo que muerde

- **Inyección de argumentos.** yt-dlp se lanza con `Command::new(...).args([...])`, **nunca a través de una shell**. Siempre se pone `--` antes de la URL (una "URL" que empieza por `-` sería una opción). Solo se aceptan esquemas `http(s)`. Nunca se usa `--exec` ni se pasan opciones libres desde la interfaz.
- **Rutas.** La plantilla de nombre no puede tener `..` ni rutas absolutas, y el archivo final tiene que caer dentro de `output_dir` (se comprueba tras `canonicalize`). Se usan `--windows-filenames` y el límite `%(title).180B`, por la ruta máxima de 260 caracteres de Windows.
- **Pausa.** yt-dlp no sabe pausar: se mata y se reanuda con `--continue`. En Windows hay que matar el árbol de procesos (ffmpeg es hijo de yt-dlp) con un Job Object. Si no, ffmpeg sigue vivo y bloquea el archivo.
- **Progreso.** Se usa `--newline --progress-template "download:%(progress)j"` para recibir una línea JSON por actualización, en vez de parsear texto que cambia de una versión a otra. El estado `processing` es la fase de ffmpeg (`--postprocessor-args` / el hook post_process).
- **Carreras en la cola.** Todas las transiciones de estado pasan por **un único actor** (`queue.rs`) que posee el `HashMap<id, Child>`. Pausar mientras arranca, o reanudar dos veces seguidas, no pueden pisarse. La base de datos refleja el estado; no lo coordina.
- **Idempotencia de las suscripciones.** Dos comprobaciones a la vez no duplican nada, gracias a `downloads_subscription_video`: se usa `insert ... on conflict do nothing`.
- **Rate limits.** YouTube devuelve 429 o pide "confirma que no eres un bot" si le pides demasiado. Por eso las suscripciones se comprueban de una en una, con `--sleep-requests 1` y como mucho los últimos 30 videos. Los errores de este tipo se muestran como "espera y reintenta", no como fallos genéricos.
- **El motor se rompe.** Es lo normal: YouTube cambia y yt-dlp saca un arreglo en días. Si hay 3 errores `engine` seguidos en videos distintos, se ofrece actualizar (F09). El binario vive en la carpeta de datos, no dentro del bundle firmado, para poder reemplazarlo.
- **Más de 1080p.** El video y el audio llegan por separado y ffmpeg los une. Hace falta un ~2× de espacio libre temporal: se comprueba antes de empezar (`size_bytes` estimado) y, si falla, el error es `disk_full`.
- **Playlists enormes.** S04 usa `--flat-playlist` (solo títulos e ids, rápido). Los formatos se piden por video cuando le toca en la cola. La lista se pinta virtualizada.
- **Cookies del navegador.** `--cookies-from-browser` solo con tu navegador, para tu propia cuenta. En Windows, Chrome y Edge cifran las cookies de forma que yt-dlp a menudo no puede leerlas. **Firefox es la opción fiable**, y en S10 conviene decirlo.
- **Formatos que no existen.** Si pides 4K y la fuente solo tiene 1080p, se usa un selector con caída: `bv*[height<=2160]+ba/b[height<=2160]/bv*+ba/b`. En el elemento se muestra la calidad real obtenida.
- **Zonas horarias.** Todo se guarda en UTC y se muestra en hora local. Solo importa en "última comprobación" y en las fechas de la lista.
- **Cerrar con descargas en curso.** Se pide confirmación. Al reabrir, la recuperación al arrancar las devuelve a la cola.
- **Licencia de ffmpeg.** Para uso personal da igual. Si algún día lo distribuyes, usa una build LGPL.
- No aplica: email, pagos, multi-tenant, GDPR, búsqueda de texto completo (un `like` sobre el título basta), tiempo real entre dispositivos y modo offline (ya es local).

## Orden de construcción

1. **Rebanada vertical (fea, de punta a punta).**
   Pegar un enlace, analizar, elegir calidad, bajar, ver la barra de progreso
   y abrir la carpeta.
   - Pantallas: S01 (lista mínima), S02, S03 (solo calidad y MP4).
   - Tablas: `settings`, `downloads`.
   - Comandos: `parse_url`, `start_download`, `list_downloads`, `reveal_in_folder`; eventos `download:progress` y `download:status`.
   - Motor: yt-dlp y ffmpeg empaquetados, una descarga a la vez.

   Esto demuestra que funcionan juntos Tauri, el sidecar, el parseo del
   progreso, la unión con ffmpeg y SQLite.

2. **Imprescindibles (11):**
   - **descarga:** MP4/MKV, solo audio MP3/M4A/OGG, carpeta de destino.
   - **cola:** varias a la vez, pausar, reanudar, cancelar, reintentar, eliminar, abrir, errores claros (`error_code` y mensaje en S01). Pantallas S01 y S09.
   - **playlists:** bajar la lista entera. Tabla `playlists`, comando `start_playlist_download`.

3. **Recomendables (9) y luego opcionales (6):**
   - Antes que nada, **actualizar yt-dlp desde la app** (S11, F09). Sin esto, la app deja de funcionar a las pocas semanas.
   - Recomendables: elegir videos de la playlist, canales, subtítulos SRT, pista de audio, Smart Mode (S08, tabla `presets`), suscripciones (S05, tabla `subscriptions`), preferencias (S07).
   - Opcionales: subtítulos incrustados, cookies del navegador (S10), navegador integrado (S06), otros sitios (ya funcionan con yt-dlp: solo hay que probarlos), 360°/VR, exportar e importar la lista.

4. **Arreglos de `/replica-entrepreneur`:** cuando se haya ejecutado. Las
   reseñas ya apuntan a "se queda en 1080p" y a "descargas atascadas". Ambas
   están cubiertas arriba: el selector con caída y la calidad real, y el actor
   único de la cola.
