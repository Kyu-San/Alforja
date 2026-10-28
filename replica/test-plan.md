# Plan de pruebas: Alforja

Build: segunda ronda sobre 5f290ed (primera: 5636673)  Fecha: 2026-10-26  Entorno: local, Linux, sin acceso a YouTube ni GitHub

Tres niveles:

- **e2e**: Playwright (`e2e/*.spec.ts`) contra la interfaz con la capa de datos simulada. Cada spec falla si hay errores en la consola y pasa axe (accesibilidad) en cada pantalla.
- **rust**: `cargo test` con yt-dlp y ffmpeg reales contra un servidor local (`scripts/test_server.py`) y una "GitHub" local.
- **gui**: la app de escritorio real en Xvfb, a mano (pulsando con xdotool, capturas en `replica/clone-screens/real-*.png`).

"No aplica" con motivo: no hay cuentas, pagos, servidor ni varias pestañas (una ventana, un usuario, local).

| case | flow | tipo | pasos | esperado | auto | resultado |
| --- | --- | --- | --- | --- | --- | --- |
| F01-H1 | bajar un video | feliz | copiar enlace, Pegar, Descargar | fila nueva con progreso y luego "Listo" | e2e | pasa (tras BUG-001, 002, 004) |
| F01-H2 | | feliz, motor real | HLS 720p+360p+audio, pedir 1080p MKV | archivo .mkv unido, calidad real 720p, estados downloading→processing→done | rust | pasa |
| F01-H3 | | feliz, app real | pegar enlace local en la app real y descargar | archivo en disco, fila "Listo" | gui | pasa |
| F01-E1 | | vacío | portapapeles sin enlace → Pegar; Analizar con el campo vacío | se abre el campo; Analizar desactivado | e2e | pasa |
| F01-E2 | | texto muy largo | títulos de 150 caracteres en la lista | una línea con elipsis, título entero en tooltip, sin scroll horizontal | e2e | pasa |
| F01-E3 | | muy largo, motor real | video con título de 300 caracteres | nombre de archivo recortado (≤180 bytes de título), descarga correcta | rust | pasa |
| F01-E4 | | emoji y acentos, motor real | título con emoji y acentos; carpeta de destino "Música y vídeos 🎬" | archivo creado con ese nombre en esa carpeta | rust | pasa |
| F01-E5 | | acentos en la búsqueda | buscar "cocina" y "Cómo" | encuentra las filas | e2e | pasa |
| F01-E6 | | doble clic en Descargar | doble clic rápido | una sola descarga | e2e | pasa |
| F01-E7 | | volver a mitad | Esc mientras analiza | se cierra; el resultado que llega tarde no abre nada | e2e | pasa |
| F01-E8 | | cerrar la app a mitad | descarga lenta a medias; reabrir | vuelve a la cola y continúa desde el .part | rust | pasa |
| F01-E9 | | red lenta | descarga a ~300 KB/s | progreso y tiempo restante se actualizan | rust | pasa |
| F01-E10 | | sin conexión | host que no responde | error "network" con mensaje claro | rust | pasa |
| F01-E11 | | ya descargado | pedir otra vez un video que ya está en la carpeta | termina al instante con el mismo archivo | rust | pasa; ver BUG-007 |
| F01-E12 | | solo teclado | Ctrl+V, Tab hasta Descargar, Intro; Espacio en la fila | descarga creada; pausa/reanuda | e2e | pasa |
| F01-E13 | | lector de pantalla | axe en S01, S02, S03; filas con aria-label de estado | 0 violaciones | e2e | pasa |
| F01-E14 | | ancho | 760 y 1440 px | sin scroll horizontal | e2e | pasa |
| F01-E15 | | dos pestañas / segundo usuario / sesión / zonas horarias | — | no aplica: una ventana, un usuario local, sin sesión; fechas solo en UTC → hora local en "última comprobación" | — | n/a |
| F01-N1 | | enlace inválido | escribir "no es un enlace" | error junto al campo, no se analiza | e2e | pasa |
| F01-N2 | | URL peligrosa | "-o /etc/x", file://, javascript: | rechazada antes de llegar a yt-dlp | rust | pasa |
| F01-N3 | | privado / no compatible | enlace privado | diálogo de error con detalle técnico | e2e | pasa |
| F01-N4 | | carpeta sin permiso, motor real | destino de solo lectura | error "No se puede escribir en esa carpeta" y no se crea la descarga | rust | pasa |
| F01-N5 | | sin motor | yt-dlp no encontrado | error "Falta el motor" en la fila | rust | pasa |
| F02-H1 | solo audio | feliz, motor real | MP3 192k | .mp3 | rust | pasa |
| F02-H2 | | feliz | elegir Solo audio en S03 | fila MP3 | e2e | pasa (tras BUG-003) |
| F02-E1 | | M4A y OGG, motor real | los dos formatos | .m4a y .ogg | rust | pasa |
| F03-H1 | playlist | feliz, motor real | RSS local con 2 videos | subcarpeta con el nombre de la lista, títulos de cada entrada | rust | pasa |
| F03-H2 | | feliz | filtrar y desmarcar, Descargar 20 | 20 filas | e2e | pasa |
| F03-H3 | | app real | pegar el RSS en la app real | 2 archivos en "Lista de prueba" | gui | pasa |
| F03-E1 | | filtro sin resultados | filtrar "zzz" | "Nada coincide" | e2e | pasa |
| F03-E2 | | nada seleccionado | desmarcar todo | Descargar desactivado | e2e | pasa |
| F03-E3 | | lista enorme | 2.000 videos | menos de 40 filas pintadas, se desplaza | e2e | pasa |
| F03-E4 | | título con / : ? | — | nombre de carpeta seguro | rust (unit) | pasa |
| F03-E5 | | raíz de un canal | pestañas (videos, shorts, directos) | sigue la de videos | rust (unit, JSON simulado) | pasa |
| F04-H1 | Smart Mode | feliz | configurar solo audio M4A, guardar, pegar un video | a la cola sin diálogo, aviso, fila M4A con el foco | e2e + gui | pasa |
| F04-E1 | | lista con Smart Mode | pegar una lista | S04 con las opciones de Smart Mode | e2e + gui | pasa |
| F04-E2 | | desactivar | apagar y pegar | vuelve el diálogo | e2e | pasa |
| F04-E3 | | volver a la lista | pegar, ir a Suscripciones, Esc | el aviso no se repite | e2e | pasa (tras BUG-008) |
| F04-E4 | | estado visible | Smart Mode activado | botón en color de acento, `aria-pressed` | e2e | pasa (tras BUG-009) |
| F04-E5 | | enlace que falla | Smart Mode activado, pegar un enlace privado | diálogo de error; nada en la cola | e2e | pasa |
| F04-E6 | | persiste | guardar, apagar, reabrir la base de datos | las opciones siguen; solo un Smart Mode activo | rust | pasa |
| F04-E7 | | solo teclado | Intro en Smart Mode, Tab hasta Guardar, Intro | activado | e2e | pasa |
| F05-H1 | suscripciones | feliz | pegar un canal, Solo audio, Suscribirse | aparece en S05 con MP3 y 0 descargas | e2e + gui | pasa |
| F05-H2 | | comprobar, pausar, baja | Comprobar ahora, interruptor, Darse de baja con confirmación | nuevo en la cola; "En pausa"; quitada | e2e | pasa |
| F05-H3 | | motor real | RSS con 2 videos → suscribirse → publicar uno | 0 al suscribirse, 1 en la cola, se baja como MP3 en su carpeta | rust + gui | pasa |
| F05-E1 | | ya suscrito | suscribirse dos veces | "Ya estás suscrito"; sin formatos huérfanos | e2e + rust | pasa |
| F05-E2 | | títulos largos, frecuencia | 760 px; cambiar a "Una vez al día" | sin scroll horizontal; se guarda | e2e | pasa |
| F05-E3 | | cabecera | selector de frecuencia | centrado en la barra | e2e | pasa (tras BUG-010) |
| F05-E4 | | dos comprobaciones a la vez, motor real | publicar uno y comprobar dos veces en paralelo | una sola descarga | rust | pasa |
| F05-E6 | | solo teclado | Espacio en el interruptor, Tab, Intro en Comprobar, Tab, Intro en Baja, confirmar | todo con el teclado sin perder el foco | e2e | pasa (tras BUG-012) |
| F05-E7 | | la fuente falla, motor real | 503 al comprobar; luego vuelve | error apuntado en S05; el video publicado entretanto se baja después | rust | pasa |
| F05-N1 | | video suelto | pegar un video | sin botón Suscribirse; el comando lo rechaza | e2e + rust | pasa |
| F06-H1 | subtítulos | feliz | elegir 2 idiomas | "Incrustar" se activa | e2e | pasa |
| F06-H2 | | feliz, motor real | HLS con subtítulos WebVTT es/en, pedir es | .es.srt junto al video | rust | pasa |
| F07-H1 | cola | pausar/reanudar/cancelar, motor real | descarga lenta | .part se conserva al pausar; cancelar borra temporales | rust | pasa |
| F07-H2 | | botones y menú | pausar, reanudar, cancelar, reintentar desde la fila y el menú | estados correctos | e2e | pasa (tras BUG-001) |
| F07-E1 | | límite de simultáneas, motor real | 1 a la vez | la segunda espera | rust | pasa |
| F07-E2 | | pausar/reanudar muy rápido, motor real | pausar y reanudar 5 veces seguidas | termina bien, sin filas ni procesos duplicados | rust | pasa |
| F07-E3 | | quitar mientras descarga, motor real | Quitar a mitad | fila borrada, sin temporales | rust | pasa |
| F07-E4 | | borrar archivo | "Quitar y borrar el archivo…" | pide confirmación; "No, dejarlo" no borra | e2e | pasa |
| F07-E5 | | quitar terminadas | menú ⋯ | quedan las activas; los archivos no se tocan | e2e | pasa |
| F07-N1 | | reintentar error | fallo → Reintentar | vuelve a la cola, intentos +1 | rust + e2e | pasa (tras BUG-001, 005) |
| F07-N2 | | abrir / mostrar en carpeta | doble clic y "Mostrar en la carpeta" en la app real | se llama al sistema con la ruta correcta | gui | pasa (tras BUG-006) |
| F08-H1 | navegador | no construido | abrir Navegador | pantalla explicativa | e2e | pasa |
| F09-H1 | motor | actualizar | hay versión nueva → Actualizar ahora | "Al día", aviso; Volver a la anterior | e2e + rust + gui | pasa |
| F09-N1 | | ocupado | actualizar con descargas en marcha | error claro, no se toca | e2e | pasa |
| F09-N2 | | suma incorrecta / binario roto / sin red | — | rechazado, el actual intacto | rust | pasa |
| S07-N1 | preferencias | valores inválidos | plantilla "../x", proxy "ftp//x" | error junto al campo, no se guarda | e2e | pasa |
| S07-H1 | | guardar | cambiar simultáneas y sesión del navegador | se guarda y se mantiene al volver | e2e | pasa |
| S07-H2 | | aviso al terminar | apagar el interruptor | se guarda | e2e | pasa |
| S07-E1 | | foco al cambiar | Espacio en "Avisar al terminar" | cambia y conserva el foco | e2e | pasa (tras BUG-012) |
| F01-E16 | bajar un video | recordar elección | elegir 720p MKV, recargar, pegar otro | 720p y MKV ya elegidos | e2e | pasa |
| F01-E17 | | elección guardada corrupta | localStorage con basura | diálogo con los valores por defecto, consola limpia | e2e | pasa |
| NAV-E1 | navegación | Esc sin foco | quitar el foco en S05 y pulsar Esc | vuelve a la lista | e2e | pasa (tras BUG-011) |
| NOT-H1 | notificaciones | ventana detrás | terminar una descarga sin foco | una notificación "Descarga terminada" con el título | e2e + gui (dunst) | pasa |
| NOT-E1 | | apagado | apagar en Preferencias y terminar una descarga | ninguna notificación | e2e | pasa |
| NOT-E2 | | ventana delante | terminar una descarga con foco | ninguna notificación | e2e | pasa |
| PAY / AUTH / EMAIL | — | — | — | no aplica: no hay pagos, cuentas ni emails | — | n/a |
