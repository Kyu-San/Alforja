# Bugs

Solo lo reproducido. Lo que "podría" fallar va en "Por comprobar", abajo.
Build de partida: d3de251. Entorno: Linux, Chromium 1.63 (Playwright) para la interfaz; app real (WebKitGTK) en Xvfb.

| ID | sev | título | estado |
| --- | --- | --- | --- |
| BUG-001 | S3 | Una descarga recién creada se queda en "En cola" mientras baja | arreglado en 9eb1335 |
| BUG-002 | S3 | La ventana principal no tiene `main`, `h1` ni regiones | arreglado en 57896aa |
| BUG-003 | S3 | Los selectores no incluyen el valor visible en su nombre accesible | arreglado en 76d5f50 |
| BUG-004 | S3 | Las filas son "opciones" con botones dentro | arreglado en 57896aa |
| BUG-005 | S3 | Abrir un menú oculta la ventana al lector de pantalla pero deja el foco dentro | arreglado en 57896aa |
| BUG-006 | S3 | "Mostrar en la carpeta" falla en Linux sin gestor de archivos D-Bus, con un error técnico en inglés | arreglado en 86a7acf |
| BUG-007 | S4 | Dos filas pueden apuntar al mismo archivo; borrar el archivo desde una deja la otra sin archivo | no se arregla de momento (ver abajo) |
| BUG-008 | S3 | El aviso de Smart Mode se repite al volver a la lista y se traga el Esc | arreglado en 55dc856 (antes de publicarse) |
| BUG-009 | S4 | Smart Mode activado no se ve en color de acento | arreglado en 55dc856 (antes de publicarse) |
| BUG-010 | S4 | La etiqueta "Frecuencia" descentra el selector en la cabecera de S05 | arreglado en 55dc856 + 0230030 (antes de publicarse) |
| BUG-011 | S3 | Esc no vuelve a la lista si el foco está en la página | arreglado en f7cbb22 |
| BUG-012 | S3 | En S05 y S07, cualquier cambio roba el foco del teclado | arreglado en bfaaff4 |

Ningún S1 ni S2. BUG-008 a BUG-010 aparecieron al construir Smart Mode y Suscripciones y se arreglaron antes de guardarlos.

### BUG-001: Una descarga recién creada se queda en "En cola" mientras baja

- Severity: S3
- Flow / case: F01 / F01-H1, F07-H2, F07-N1
- Screen: S01
- Build: d3de251  Browser / device: Chromium 1.63, 1040px

Steps
1. Pegar un enlace y pulsar Descargar.

Expected: la fila pasa a "descargando" con su barra.
Actual: la fila se queda en "En cola" (los bytes avanzan por debajo) hasta que termina.
Evidence: e2e `F07-H2` y `F07-N1` fallaban: `Expected "downloading", Received "queued"`.
Suspected cause: el comando devuelve la fila recién creada ("queued"); si el evento "downloading" llega antes que esa respuesta, la interfaz guardaba la respuesta encima del evento. Pasa con la capa simulada y puede pasar con la real (la cola arranca en paralelo).
Status: fixed in 9eb1335 (la respuesta solo se añade si la fila aún no existe).

### BUG-002: La ventana principal no tiene `main`, `h1` ni regiones

- Severity: S3
- Flow / case: F01 / F01-E13
- Screen: S01
- Build: d3de251  Browser / device: Chromium 1.63, 1040px

Steps
1. Abrir la app; pasar axe.

Expected: 0 violaciones.
Actual: `landmark-one-main`, `page-has-heading-one`, `region` (la barra, la lista y la barra de estado fuera de regiones). Un lector de pantalla no puede saltar a la lista.
Evidence: e2e `F01-H1` (axe en "S01 vacía").
Status: fixed in 57896aa (`header` con la barra dentro, `main` con un `h1` oculto "Descargas", `footer`).

### BUG-003: Los selectores no incluyen el valor visible en su nombre accesible

- Severity: S3
- Flow / case: F02 / F02-H2
- Screen: S03, S04, S07, S10
- Build: d3de251  Browser / device: Chromium 1.63, 1040px

Steps
1. Pegar un enlace, elegir "Solo audio"; pasar axe.

Expected: 0 violaciones.
Actual: `label-content-name-mismatch` (serious): el botón muestra "320 kbps" pero se llama solo "Calidad del audio". Con control por voz, decir "320 kbps" no hace nada.
Evidence: e2e `F02-H2` (axe en "S03 audio").
Status: fixed in 76d5f50 (`aria-labelledby` = etiqueta + el propio botón).

### BUG-004: Las filas son "opciones" con botones dentro

- Severity: S3
- Flow / case: F01 / F01-E13
- Screen: S01
- Build: d3de251  Browser / device: Chromium 1.63, 1040px

Steps
1. Tener una descarga en la lista; pasar axe.

Expected: 0 violaciones.
Actual: `nested-interactive` (serious): `role="option"` con botones Pausar/Cancelar dentro (los lectores de pantalla no los anuncian); `label-content-name-mismatch` por el `aria-label` de la fila.
Evidence: e2e `F01-H1` (axe en "S01 con una descarga").
Status: fixed in 57896aa (la lista es un `grid` con filas y celdas; mismo teclado: flechas, Espacio, Intro, Supr).

### BUG-005: Abrir un menú oculta la ventana al lector de pantalla pero deja el foco dentro

- Severity: S3
- Flow / case: F07 / F07-N1
- Screen: S09
- Build: d3de251  Browser / device: Chromium 1.63, 1040px

Steps
1. Clic derecho en una fila; pasar axe con el menú abierto.

Expected: 0 violaciones.
Actual: `aria-hidden-focus` (serious): el menú modal pone `aria-hidden` en la barra y la lista, que siguen teniendo elementos enfocables; además desaparecen `main` y `h1`.
Evidence: e2e `F07-N1` (axe en "S09").
Status: fixed in 57896aa (menú contextual y menú ⋯ no modales; se cierran igual con Esc o clic fuera).

### BUG-006: "Mostrar en la carpeta" falla en Linux sin gestor de archivos D-Bus

- Severity: S3
- Flow / case: F07 / F07-N2
- Screen: S01, S09
- Build: 5636673^  Browser / device: app real, WebKitGTK, Xvfb sin sesión D-Bus

Steps
1. En la app real, pulsar el icono de carpeta de una descarga terminada.

Expected: se abre el gestor de archivos en esa carpeta.
Actual: aviso "No se pudo mostrar: Failed to connect to address `unix:path=/run/user/0/bus`…" (en inglés y técnico). Abrir el archivo (doble clic) sí funcionaba.
Evidence: `replica/bugs/BUG-006.png`; el `xdg-open` de prueba no recibía nada.
Suspected cause: en Linux el plugin solo usa `org.freedesktop.FileManager1` o el portal de escritorio; algunos escritorios no tienen ninguno.
Status: fixed in 86a7acf (si no se puede señalar el archivo, se abre su carpeta; comprobado en la app real: `xdg-open` recibe la carpeta).

### BUG-007: Dos filas pueden apuntar al mismo archivo

- Severity: S4
- Flow / case: F01 / F01-E11
- Screen: S01
- Build: 5636673

Steps
1. Bajar un video. 2. Pegar el mismo enlace y bajarlo otra vez. 3. En una de las dos filas, "Quitar y borrar el archivo".

Expected: discutible: avisar de que ya está bajado, o no duplicar la fila.
Actual: las dos filas apuntan al mismo archivo (yt-dlp no lo vuelve a bajar); tras borrarlo desde una, "Abrir" en la otra dice "El archivo ya no está en su carpeta".
Evidence: prueba `f01_e11_already_downloaded_finishes_with_the_same_file` (mismo `output_path`).
Status: won't fix por ahora: el archivo lo borra el usuario a propósito y la otra fila lo explica bien. Mejor solución para más adelante: avisar al pegar un enlace ya descargado.

### BUG-008: El aviso de Smart Mode se repite al volver a la lista

- Severity: S3
- Flow / case: F04 / F04-E3
- Screen: S01
- Build: sin publicar (segunda pasada de /replica-build)  Browser / device: app real (WebKitGTK) y Chromium 1.63

Steps
1. Con Smart Mode, pegar un video. 2. Ir a Suscripciones. 3. Volver con Esc.

Expected: el aviso "En la cola con Smart Mode" sale una vez, al pegar.
Actual: vuelve a salir, dos veces, cada vez que se vuelve a la lista; mientras está abierto, el primer Esc lo cierra a él en vez de cambiar de pantalla.
Evidence: captura de la app real en Xvfb; e2e `F04-E3`.
Suspected cause: el aviso se lanzaba desde un efecto de la ventana principal, que se repite al montarse (y dos veces en modo de desarrollo).
Status: fixed in 55dc856 (se avisa desde una suscripción al estado, solo cuando cambia).

### BUG-009: Smart Mode activado no se ve en color de acento

- Severity: S4
- Flow / case: F04 / F04-E4
- Screen: S01
- Build: sin publicar

Steps
1. Activar Smart Mode.

Expected: el botón de la barra en color de acento (y con el rayo relleno).
Actual: el rayo se rellena, pero el texto sigue blanco: el color de la variante "ghost" ganaba a la clase añadida.
Evidence: e2e `F04-E4` (`Received: rgb(233, 235, 239)`).
Status: fixed in 55dc856.

### BUG-010: La etiqueta "Frecuencia" descentra el selector en la cabecera de S05

- Severity: S4
- Flow / case: F05 / F05-E3
- Screen: S05
- Build: sin publicar

Steps
1. Abrir Suscripciones.

Expected: el selector centrado en la barra, como los botones.
Actual: la etiqueta visible lo empuja 9,5 px hacia abajo y queda pegada al borde superior.
Evidence: e2e `F05-E3`; captura de la app real.
Status: fixed in 55dc856 + 0230030 (etiqueta solo para lectores de pantalla en barras).

### BUG-011: Esc no vuelve a la lista si el foco está en la página

- Severity: S3
- Flow / case: navegación / NAV-E1
- Screen: S05, S06, S07
- Build: d3de251 en adelante

Steps
1. Abrir Suscripciones, Navegador o Preferencias. 2. Dejar el foco en la página (por ejemplo, tras pulsar un botón que desaparece). 3. Pulsar Esc.

Expected: vuelve a la lista.
Actual: no pasa nada: el Esc se escuchaba en el contenedor de la pantalla y no llega si el foco está en `<body>`.
Evidence: e2e `NAV-E1` (fallaba siempre antes del arreglo).
Status: fixed in f7cbb22 (se escucha en la ventana; sigue sin actuar si hay un diálogo, menú o lista abiertos).

### BUG-012: En S05 y S07, cualquier cambio roba el foco del teclado

- Severity: S3
- Flow / case: F05 / F05-E6; S07 / S07-E1
- Screen: S05, S06, S07
- Build: 5f290ed  Browser / device: Chromium 1.63, 1040px

Steps
1. Abrir Suscripciones (o Preferencias) y llegar con Tab a un interruptor.
2. Pulsar Espacio.
3. Pulsar Tab.

Expected: el interruptor cambia y conserva el foco; Tab lleva al siguiente control ("Comprobar ahora").
Actual: tras el cambio, el foco salta al contenedor `<main>` y Tab vuelve al principio de la fila. Quien usa el teclado pierde su sitio con cada ajuste.
Evidence: e2e `F05-E6` y `S07-E1` (fallaban siempre antes del arreglo); traza: tras Espacio, `document.activeElement` = `MAIN`.
Suspected cause: `Screen` enfocaba `<main>` con un `ref` en línea; React lo vuelve a llamar en cada render, así que cualquier actualización de la pantalla movía el foco.
Status: fixed in bfaaff4 (se enfoca una sola vez, al entrar).

## Por comprobar (no reproducido)

- **YouTube de verdad.** Todo el motor se probó con MP4, HLS, RSS y páginas `<video>` locales; YouTube y GitHub están bloqueados en este entorno.
- **Windows y macOS.** Matar el árbol de procesos en Windows (`taskkill /T`), rutas de más de 260 caracteres, permisos de macOS para el binario descargado. Solo se probó Linux.
- **La raíz de un canal (`@nombre`)** devuelve pestañas, no videos (ya en features.csv como parcial).
- **Disco lleno** a mitad de descarga: clasificado (`disk_full`) pero no provocado.
- **Proxy con usuario y contraseña** visible en la lista de procesos (anotado en backend.md).
- **Borrar una suscripción mientras se comprueba**: las descargas que intente crear esa comprobación fallarían por la clave ajena y se registraría un error; no se pudo provocar el cruce.
- **El temporizador de comprobación en segundo plano** (cada 10 minutos, 20 s tras arrancar): la lógica de "a cuáles les toca" está probada, el bucle en sí no.
- **Notificaciones en Windows y macOS**: probadas solo en Linux con dunst.
- **El modo de desarrollo arranca en blanco** si la app abre antes que el servidor de Vite (visto en Xvfb). Solo afecta a `npm run tauri dev` sin esperar; la app compilada carga de `dist/`.
