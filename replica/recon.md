# Mapa de recon: 4K Video Downloader+ (escritorio: Windows, macOS, Linux)

Alcance: el bucle principal de 4K Video Downloader+. Pegar un enlace, elegir el
formato, descargar videos, audio, playlists, canales y subtítulos, y gestionar
la cola. El motor es **yt-dlp** (open source) más **ffmpeg**. Esta app es la
interfaz alrededor de ellos: no hacemos ingeniería inversa de YouTube.
Para: uso personal (una sola persona, sin venta ni tiendas de apps).
Fecha: 2026-10-26

> **Límite de este recon.** La política de red del entorno bloqueó
> `www.4kdownload.com`, y no hay un navegador conectado a tu cuenta. Por eso
> este mapa se basa en búsquedas: los resúmenes de las notas de versión
> oficiales, la página del producto y reseñas de terceros. **No hay capturas en
> `replica/screens/`.** Las pantallas están inferidas (confianza media).
> Antes de `/replica-design` conviene que abras la app tú mismo y guardes
> capturas de S01, S03, S04, S06 y S07.

## Fuentes

| # | fuente | URL | notas |
| --- | --- | --- | --- |
| 1 | página del producto | https://www.4kdownload.com/products/videodownloader-42 | Smart Mode (icono de bombilla), subtítulos en más de 50 idiomas, playlists y canales. Solo vista en resultados de búsqueda: el sitio está bloqueado desde aquí |
| 2 | blog / notas de versión 25.1.0 | https://www.4kdownload.com/blog/2025/05/13/new-4k-video-downloader-plus-update-25-1-0/ | opción "Original Audio", recomendaciones de videos similares |
| 3 | notas de versión 25.2.0 | https://www.4kdownload.com/blog/2025/07/10/4k-video-downloader-plus-rolls-out-25-2-0-update/ | elegir la pista de audio original pasa a ser gratis; mejor manejo de idiomas |
| 4 | notas de versión 25.4.2 | https://www.4kdownload.com/blog/2025/11/13/new-4k-video-downloader-plus-version-is-here/ | nuevo navegador integrado, "bypass" para contenido con login, vuelve "Clear All" |
| 5 | actualizaciones recientes | https://www.4kdownload.com/blog/2025/11/14/recent-4k-video-downloader-plus-updates-you-mightve-missed/ | navegación completa con teclado |
| 6 | notas de versión 26.2.0 | https://www.4kdownload.com/blog/2026/07/07/meet-4k-video-downloader-plus-26-2-0/ | suscripciones, resultados de audio con IA |
| 7 | funciones nuevas 2025 | https://www.4kdownload.com/blog/2025/04/03/new-4k-video-downloader-plus-features-to-try/ | resumen de funciones |
| 8 | guía de uso | https://helpdeskgeek.com/how-to-download-youtube-videos-4k-video-downloader-plus/ | menú de playlist (este video / toda la lista / suscribirse), playlists privadas con login |
| 9 | reseña | https://www.igeeksblog.com/4k-video-downloader-plus-review/ | flujo pegar → analizar → elegir |
| 10 | reseña 2026 | https://wi-fiplanet.com/4k-video-downloader-plus-review/ | herramientas de audio con IA; Smart Mode ahora de pago (sin confirmar) |
| 11 | reseña | https://videoconverter.wondershare.com/video-extractor-tips/4k-video-downloader-plus-review.html | límites del plan gratis (10 al día y 10 por playlist, según la fuente) |
| 12 | reseña | https://www.videoproc.com/download-record-video/4k-video-downloader-plus-review.htm | MP4/MKV, MP3/M4A/OGG, quejas de que no pasa de 1080p |
| 13 | reseñas de usuarios | https://www.g2.com/products/4k-video-downloader-plus/reviews | para `/replica-entrepreneur` |
| 14 | precios (terceros) | https://www.capterra.com/p/10038360/4K-Video-Downloader-Plus/ | Lite 15 $/año, Personal 25 $, Pro 45 $ (no verificado en el sitio oficial) |
| 15 | motor | https://github.com/yt-dlp/yt-dlp | licencia Unlicense; formatos, `--cookies-from-browser`, subtítulos, playlists |

## Bucle principal

Copias el enlace de un video, pulsas **Pegar** y en dos clics tienes el
archivo en la calidad que elegiste.

## Pantallas

| ID | pantalla | cómo se llega | propósito | componentes clave | estados |
| --- | --- | --- | --- | --- | --- |
| S01 | Ventana principal / lista de descargas | al abrir la app | ver y gestionar todas las descargas | barra superior (Pegar enlace, Smart Mode, Suscripciones, Navegador, Preferencias), DownloadItem, búsqueda/filtro, Clear All | vacío ("copia un enlace y pulsa Pegar"), con elementos, descargando, error en un elemento |
| S02 | Analizando el enlace | Pegar en S01 | obtener los metadatos y formatos | spinner o elemento en estado "analizando", cancelar | cargando, error (enlace no soportado, privado, bloqueado por región, 403) |
| S03 | Diálogo de descarga de un video | tras S02, si es un solo video | elegir qué bajar | radio Video/Audio, lista de calidades con tamaño estimado, selector de formato (MP4/MKV o MP3/M4A/OGG), pista de audio/idioma, subtítulos (idioma, archivo o incrustados), carpeta de destino, botón Descargar | por defecto, sin 4K disponible, solo audio |
| S04 | Diálogo de playlist / canal | tras S02, si el enlace es una playlist o un canal | elegir cuáles bajar | opciones "este video" / "toda la playlist" / "suscribirse", lista con casillas y miniaturas, seleccionar todo, mismos controles de formato que S03 | cargando la lista (puede ser larga), lista filtrada |
| S05 | Suscripciones | barra superior | canales y playlists que se bajan solos | lista de suscripciones, último video, comprobar ahora, eliminar | vacío, con elementos, comprobando |
| S06 | Navegador integrado | barra superior | buscar en YouTube y descargar sin copiar enlaces | barra de direcciones, vista web, botón Descargar flotante | cargando, página sin video |
| S07 | Preferencias | barra superior o menú | ajustes globales | carpeta por defecto, descargas simultáneas, idioma de la interfaz, proxy, plantilla de nombre de archivo, actualizaciones, tema | — |
| S08 | Configuración de Smart Mode | Smart Mode en la barra (bombilla) | fijar el formato/calidad/subtítulos/carpeta para descargar con un clic | los mismos controles que S03, interruptor de activación | activado, desactivado |
| S09 | Menú contextual de un elemento | clic derecho en un DownloadItem | acciones sobre una descarga | Reproducir, Mostrar en carpeta, Copiar enlace, Pausar/Reanudar, Reintentar, Eliminar (y borrar archivo) | según el estado del elemento |
| S10 | Conectar cuenta / cookies | Preferencias o al pegar un enlace privado | bajar tus playlists privadas o Ver más tarde | elegir navegador del que leer la sesión, estado conectado | sin conectar, conectado, cookies caducadas |
| S11 | Acerca de / actualizaciones | menú Ayuda | versión de la app **y de yt-dlp**, actualizar | versión, botón Actualizar motor, enlace a registro | al día, actualización disponible, actualizando, error |

(S11 no existe así en el original: allí el motor está oculto. En tu versión es
importante porque yt-dlp necesita actualizarse a menudo.)

## Flujos

```
F01 Bajar un video
    (copiar enlace en el navegador) -> S01 Pegar -> S02 -> S03 elegir calidad -> Descargar -> S01 progreso -> S09 Mostrar en carpeta
    clics en el camino feliz: 3 (Pegar, Descargar, Mostrar en carpeta)
    edge: enlace no soportado; video privado o con edad restringida; bloqueado por región;
          4K pedido pero la fuente solo tiene 1080p; disco lleno; nombre de archivo con caracteres inválidos;
          ya descargado antes (¿duplicar o saltar?)

F02 Bajar solo el audio en MP3
    S01 Pegar -> S02 -> S03 (Audio, MP3, calidad) -> Descargar
    clics: 3
    edge: falta ffmpeg; video sin pista de audio

F03 Bajar una playlist o un canal
    S01 Pegar -> S02 -> S04 "toda la playlist" -> (desmarcar algunos) -> Descargar -> S01 N elementos
    clics: 3 + los que desmarques
    edge: playlist de 1.000+ videos; videos borrados o privados dentro de la lista; la descarga se corta a la mitad

F04 Configurar Smart Mode y bajar con un clic
    S08 elegir preferencias -> activar -> (después) S01 Pegar -> descarga directa sin diálogo
    clics: 1 por descarga una vez configurado
    edge: el formato guardado no existe en ese video (usar el más cercano y avisar)

F05 Suscribirse a un canal
    S01 Pegar enlace de canal -> S02 -> S04 "suscribirse" -> S05
    después: la app comprueba al arrancar o cada N horas y baja lo nuevo
    edge: el canal cambia de nombre; la app estuvo cerrada una semana; cuotas de rate limit

F06 Subtítulos
    S03 o S04 -> elegir idioma(s) -> como .srt o incrustados -> Descargar
    edge: solo hay subtítulos automáticos; el idioma no existe en ese video

F07 Gestionar la cola
    S01 / S09: pausar, reanudar, reintentar, eliminar, Clear All
    edge: cerrar la app con descargas en curso y retomar al abrir

F08 Bajar desde el navegador integrado
    S06 navegar -> botón Descargar -> S03 -> Descargar
    clics: 2 desde que estás en la página del video

F09 Actualizar el motor cuando YouTube rompe las descargas
    error repetido en S01 -> aviso "actualiza el motor" -> S11 Actualizar -> Reintentar
    edge: no hay red; la actualización falla y hay que volver a la versión anterior
```

## Componentes

| componente | variantes | estados | se usa en |
| --- | --- | --- | --- |
| Button | primario, secundario, icono de barra | normal, hover, foco, desactivado, cargando | todas |
| Toolbar | — | Smart Mode activado/desactivado | S01 |
| DownloadItem | video, audio, playlist (agrupado) | en cola, analizando, descargando (%/velocidad/ETA), procesando (ffmpeg), pausado, completado, error | S01 |
| ProgressBar | determinada, indeterminada | — | S01, S02, S11 |
| Modal / Dialog | — | abierto, enviando | S03, S04, S08 |
| QualityList | video, audio | seleccionada, no disponible | S03, S04, S08 |
| Select | formato, idioma, pista de audio | abierto, desactivado | S03, S04, S07, S08 |
| FolderPicker | — | ruta válida, ruta inválida | S03, S07, S08 |
| Checkbox / CheckList | con miniatura | marcado, desmarcado, indeterminado (seleccionar todo) | S04 |
| Toggle | — | on, off | S07, S08 |
| ContextMenu | — | elementos activados según el estado | S09 |
| EmptyState | lista vacía, sin suscripciones | — | S01, S05 |
| Toast / Notification | éxito, error, actualización | — | todas; notificación del sistema al terminar |
| SearchField | — | vacío, con texto | S01 |
| WebView | — | cargando, error | S06 |

## Modelo de datos inferido

Es una app de escritorio local: no hay servidor. Todo vive en SQLite o JSON
en la carpeta de datos de la app.

```
Download   id, source_url, title, thumbnail_url, uploader, duration_s,
           kind (video | audio), format (mp4 | mkv | mp3 | m4a | ogg),
           quality (p. ej. 2160p / 320kbps), audio_lang, subtitle_langs[], subtitles_embedded,
           output_path, size_bytes, downloaded_bytes, speed, eta_s,
           status (queued | parsing | downloading | processing | paused | done | error),
           error_code, error_message, playlist_id?, subscription_id?, created_at, finished_at
           evidencia: S01 elementos y progreso, S03 opciones, S09 acciones
           confianza: alta

MediaInfo  (resultado del análisis; en memoria o caché)  url, title, formats[{format_id, ext,
           height, fps, vcodec, acodec, filesize}], audio_tracks[{lang, is_original}],
           subtitles[{lang, auto}], is_playlist, entries[]
           evidencia: S03/S04; corresponde a la salida de `yt-dlp --dump-json`
           confianza: alta

Playlist   id, source_url, title, kind (playlist | channel), item_count, selected_ids[]
           evidencia: S04, fuente 8
           confianza: media

Subscription  id, source_url, title, kind (channel | playlist), preset_id,
              last_checked_at, last_seen_video_id, enabled
              evidencia: S05, notas de versión 26.2.0
              confianza: media

Preset (Smart Mode)  id, kind, format, quality, audio_lang, subtitle_langs[],
                     subtitles_embedded, output_dir, enabled
                     evidencia: S08, página del producto
                     confianza: alta

Settings   output_dir, max_concurrent, ui_language, proxy, filename_template,
           cookies_browser?, engine_version, auto_update_engine, theme
           evidencia: S07
           confianza: media (los ajustes exactos del original no se vieron)
```

Relaciones: Playlist 1-n Download, Subscription 1-n Download, Subscription n-1
Preset, Download n-1 Preset (opcional).

## Matriz de funciones

Ver `features.csv`. Must: 11, should: 9, could: 6, skip: 6.

## Fuera de alcance (no se puede o no se debe clonar)

- **Saltarse protecciones de login de YouTube.** El original anuncia un
  "bypass" en 25.4. Eludir medidas técnicas no se construye. Las playlists
  privadas solo se bajan con **tu** sesión, mediante `--cookies-from-browser`.
- **Contenido con DRM** (Netflix, Disney+, Spotify, etc.). El original
  tampoco lo hace.
- **Licencias, planes, límites del plan gratis y anuncios.** Son su modelo de
  negocio, no funciones, y para uso personal no hacen falta.
- **Herramientas de audio con IA y recomendaciones de videos.** Quedan fuera
  del bucle principal. Se pueden añadir más adelante.
- **Su marca, iconos y textos.** Como siempre.
- **Aviso:** descargar de YouTube va contra sus Términos de servicio salvo
  que el video ofrezca la descarga. Para uso personal el riesgo práctico es
  bajo, pero el riesgo es tuyo. Si algún día quisieras distribuirla, Google
  Play y la Mac App Store no aceptan este tipo de apps.

## Tamaño

Pantallas: 11. Flujos: 9. Entidades: 5 (más Settings).

Partes difíciles:
1. **Mantener vivo el motor.** YouTube cambia a menudo y rompe los
   descargadores. Hay que empaquetar yt-dlp y ffmpeg y poder actualizar yt-dlp
   desde la app, con vuelta atrás si falla (F09, S11).
2. **Cola y progreso.** Procesos de yt-dlp en paralelo, leer su progreso,
   pausar y reanudar (yt-dlp reanuda con `--continue`) y recuperarse si se
   cierra la app.
3. **Calidad >1080p.** YouTube sirve el video y el audio por separado, así que
   ffmpeg tiene que unirlos (estado "procesando"). Además hay que empaquetar y
   firmar la app para Windows, macOS y Linux.

Tamaño: **M**. Un MVP con F01, F02, F03 y F07 cabe en un fin de semana largo,
porque yt-dlp hace el trabajo pesado. La paridad completa, con suscripciones,
Smart Mode, navegador integrado y actualización del motor, lleva unas semanas.
