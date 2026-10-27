# Paridad: Descargador frente a 4K Video Downloader+

Fecha: 2026-10-27  Build: 83a28cf + matriz actualizada  Plataforma probada: Linux

## Resumen

| medida | valor |
| --- | --- |
| **Paridad de funciones** | **80,0 / 100** (25 funciones puntuadas) |
| Imprescindibles | **11 de 11** |
| Paridad de diseño | **sin medir**: no hay capturas del original en `replica/screens/` |
| Bugs abiertos | 0 S1, 0 S2, 0 S3, 1 S4 (BUG-007) |
| Puntuación global | 80,0 (solo funciones; el diseño no entra porque no se ha medido) |

**Veredicto: utilizable para uso personal en Linux, justo en el límite.** Cumple las
reglas de "shippable" (todas las imprescindibles, 80+ de funciones, sin S1 ni S2),
pero por los pelos (80,0 exacto) y con tres reservas que pesan más que la cifra:

1. **Nunca se ha probado contra YouTube real.** YouTube y GitHub están bloqueados en
   el entorno donde se construyó; todo el motor se probó con MP4, HLS, RSS y páginas
   `<video>` servidos en local. Es lo primero que hay que hacer en tu equipo.
2. **Solo Linux.** Windows y macOS no se han ejecutado nunca.
3. **No es "mejor que el original"**: falta `/replica-entrepreneur`, y la función
   más característica del original (Smart Mode, descargar con un clic) no existe.

## Funciones

### Parity: 80.0 / 100

features 80.0  (25 counted, must-haves 11 of 11 done)

### By area, weakest first
- smart mode                     0.0  (1 features)
- suscripciones                  0.0  (1 features)
- navegador                      0.0  (1 features)
- preferencias                  50.0  (1 features)
- cuenta                        50.0  (1 features)
- fuentes                       50.0  (1 features)
- playlists                     85.7  (3 features)
- descarga                      90.5  (8 features)
- cola                          93.3  (6 features)
- subtítulos                   100.0  (2 features)

### Missing, in build order
- [should] smart mode: Smart Mode: guardar preferencias y descargar con un clic, no  (pantalla que explica que llega en la próxima versión)
- [should] suscripciones: Suscribirse a un canal o playlist y bajar lo nuevo automáticamente, no  (pantalla que explica que llega en la próxima versión)
- [should] descarga: Pista de audio original o de otro idioma, partial  (añadido en 25.1 / gratis desde 25.2 | selector ba[language^=xx] con caída; sin video local con varias pistas para probarlo)
- [should] playlists: Descargar un canal completo, partial  (la URL /videos de un canal funciona como lista; la raíz del canal (@nombre) devuelve pestañas y aún no se trata)
- [should] preferencias: Preferencias: carpeta / idioma / descargas simultáneas / proxy, partial  (carpeta, simultáneas, plantilla de nombre, proxy y sesión del navegador; falta idioma de la interfaz)
- [could] cola: Exportar / importar la lista de descargas, no
- [could] descarga: Videos 360° / VR y 3D, no
- [could] navegador: Navegador integrado para buscar y descargar, no  (pantalla que lo explica)
- [could] cuenta: Usar tu propia sesión del navegador para tus playlists privadas o Ver más tarde, partial  (solo tu propia cuenta (yt-dlp --cookies-from-browser) | ajuste guardado y pasado a yt-dlp (--cookies-from-browser); sin probar con un perfil real)
- [could] fuentes: Otros sitios además de YouTube (Vimeo / TikTok / etc.), partial  (lo que soporte yt-dlp | lo que soporte yt-dlp; probado solo con MP4, HLS y RSS locales (YouTube está bloqueado en este entorno))

### Left out on purpose (not scored)
- Herramientas de audio con IA (quitar voces / reducir eco): fuera del bucle principal; añadido en 2026
- Recomendaciones de videos similares en la app: no aporta para uso personal
- Sistema de licencias / planes / activación por dispositivo: es uso personal: no hay nada que vender
- Límites del plan gratuito y anuncios: es su modelo de negocio; no es una función
- Saltarse protecciones de login de YouTube: elusión de medidas técnicas: no se construye

### Yours, not in the original (not scored)
- Actualizar yt-dlp desde la app

## Diseño (layout)

Sin medir. `imgdiff.py` necesita una captura del original y otra del clon de la
misma pantalla, al mismo tamaño y en el mismo estado. Las del clon están en
`replica/clone-screens/` (S01–S11, 1040×680, más 760 y 1440 de S01). Las del
original no existen: el sitio estaba bloqueado durante el recon y no hay un
navegador conectado a tu equipo.

Para medirlo: abre 4K Video Downloader+ en tu equipo, haz capturas de la ventana
principal con descargas, el diálogo de descarga, el de lista y las preferencias,
guárdalas como `replica/screens/S01.png`, `S03.png`, `S04.png` y `S07.png`, y
vuelve a pasar `/replica-diff`. Recuerda que la meta es la misma **estructura**,
no el mismo aspecto: el clon ya tiene su propio tema oscuro a propósito.

## Comportamiento

Comparado con lo que dicen las fuentes públicas del recon (no se usó el original
a mano). "Sin comprobar" = las fuentes no lo dicen.

| flujo | el original | el clon | arreglar o dejar |
| --- | --- | --- | --- |
| F01 bajar un video | Pegar → diálogo → Descargar: 2 clics; con Smart Mode, 1 | Pegar → diálogo → Descargar: 2 clics (o Ctrl+V + Intro). Sin Smart Mode | **arreglar**: Smart Mode |
| F01 opciones del diálogo | sin comprobar si recuerda la última elección | **no recuerda**: cada vez vuelve a "la mejor, MP4" | **arreglar**: recordar la última elección |
| F01 calidad no disponible | reseñas: se queda en 1080p sin decirlo | baja la mejor por debajo y lo dice en la fila ("1080p (no había 2160p)") | dejar: mejor que el original |
| F01 errores | reseñas: errores "403", descargas atascadas | 12 errores con mensaje propio, detalle técnico plegado, Reintentar; aviso tras 3 fallos seguidos del motor | dejar |
| F01 al terminar | sin comprobar | solo un aviso dentro de la app si estaba en segundo plano; **sin notificación del sistema** (el ajuste existe, no se usa) | **arreglar** |
| F03 listas | paywall: 10 videos por lista en el plan gratis | sin límite; lista virtualizada (2.000 sin problema), subcarpeta con el nombre | dejar |
| F03 canales | canal completo | la pestaña `/videos` sí; la raíz `@nombre` no | **arreglar** |
| F05 suscripciones | sí | no (pantalla que lo explica) | **arreglar** |
| F07 cerrar a mitad | sin comprobar | al reabrir vuelve a la cola y continúa desde el `.part` | dejar |
| F09 motor | se actualiza con la app, oculto | actualización visible, verificada con SHA-256, con vuelta atrás | dejar: mejor que el original |
| límites | plan gratis: ~10 descargas al día, anuncios | ninguno (uso personal) | dejar |
| accesibilidad | sin comprobar (una guía de NVDA sugiere que es usable) | 0 violaciones de axe en todas las pantallas; todo el flujo con teclado | dejar |

## Lo siguiente, por orden

1. **Probarlo en tu equipo con YouTube de verdad** (no es construir, pero va
   primero): un video, uno en 4K, una lista, uno con subtítulos. Lo que falle
   va a `replica/bugs.md`.
2. **Smart Mode** (debería): elegir formato, calidad, subtítulos y carpeta una vez
   y descargar cada enlace pegado sin diálogo. Ya existen la tabla `presets`, el
   índice "solo un Smart Mode" y la pantalla S08 que lo explica.
3. **Recordar la última elección del diálogo y notificar al terminar**: pequeño y
   se nota en cada uso (`tauri-plugin-notification`; el ajuste `notify_on_finish` ya existe).
4. **Suscripciones** (debería): la tabla, el índice que evita duplicados y la
   comprobación periódica ya están diseñados en `architecture.md`.
5. **La raíz de un canal (`@nombre`)**: seguir la pestaña "Videos" cuando yt-dlp
   devuelve pestañas en vez de videos.

Con 2 y 4 la paridad pasaría de 80 a unos 87 (48 de 55 puntos ponderados); con el 5, a 89. Los puntos 1 y 3 no suben la cifra, pero son los que más se notan al usarla.
