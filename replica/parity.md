# Paridad: Descargador frente a 4K Video Downloader+

Fecha: 2026-10-27 (segunda pasada)  Build: 0230030  Plataforma probada: Linux

## Resumen

| medida | valor |
| --- | --- |
| **Paridad de funciones** | **87,3 / 100** (25 funciones puntuadas; antes 80,0) |
| Imprescindibles | **11 de 11** |
| Paridad de diseño | **sin medir**: no hay capturas del original en `replica/screens/` |
| Bugs abiertos | 0 S1, 0 S2, 0 S3, 1 S4 (BUG-007) |
| Pruebas | 36 en Rust (motor real) + 41 de interfaz con axe, estables en 3 pasadas seguidas |
| Puntuación global | 87,3 (solo funciones; el diseño no entra porque no se ha medido) |

**Veredicto: utilizable para uso personal en Linux.** Cumple las reglas de
"shippable" con margen (todas las imprescindibles, 87,3 de funciones, sin S1 ni
S2). Ya hace lo que define al original: Smart Mode y suscripciones. Quedan dos
reservas que pesan más que la cifra:

1. **Nunca se ha probado contra YouTube real.** YouTube y GitHub están bloqueados
   en el entorno donde se construyó; todo el motor se probó con MP4, HLS, RSS y
   páginas `<video>` servidos en local. Es lo primero que hay que hacer en tu equipo.
2. **Solo Linux.** Windows y macOS no se han ejecutado nunca.

Aún no es "mejor que el original": para eso falta `/replica-entrepreneur`.

## Funciones

### Parity: 87.3 / 100

features 87.3  (25 counted, must-haves 11 of 11 done)

### By area, weakest first
- navegador                      0.0  (1 features)
- preferencias                  50.0  (1 features)
- cuenta                        50.0  (1 features)
- fuentes                       50.0  (1 features)
- playlists                     85.7  (3 features)
- descarga                      90.5  (8 features)
- cola                          93.3  (6 features)
- subtítulos                   100.0  (2 features)
- smart mode                   100.0  (1 features)
- suscripciones                100.0  (1 features)

### Missing, in build order
- [should] descarga: Pista de audio original o de otro idioma, partial  (añadido en 25.1 / gratis desde 25.2 | selector ba[language^=xx] con caída; sin video local con varias pistas para probarlo)
- [should] playlists: Descargar un canal completo, partial  (la raíz de un canal (@nombre) sigue su pestaña de videos; probado solo con un JSON simulado de pestañas, nunca contra YouTube)
- [should] preferencias: Preferencias: carpeta / idioma / descargas simultáneas / proxy, partial  (carpeta, simultáneas, plantilla de nombre, proxy, sesión del navegador y aviso al terminar; falta idioma de la interfaz)
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
- Recordar la última elección del diálogo
- Notificación del sistema al terminar

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
| F01 bajar un video | Pegar → diálogo → Descargar: 2 clics; con Smart Mode, 1 | igual: 2 clics, o 1 con Smart Mode (también Ctrl+V) | hecho |
| F01 opciones del diálogo | sin comprobar si recuerda la última elección | recuerda la última elección (si el video no tiene esa calidad, la mejor que haya) | hecho |
| F01 calidad no disponible | reseñas: se queda en 1080p sin decirlo | baja la mejor por debajo y lo dice en la fila ("1080p (no había 2160p)") | dejar: mejor que el original |
| F01 errores | reseñas: errores "403", descargas atascadas | 12 errores con mensaje propio, detalle técnico plegado, Reintentar; aviso tras 3 fallos seguidos del motor | dejar |
| F01 al terminar | sin comprobar | notificación del sistema si la ventana no está delante (se puede apagar) | hecho |
| F03 listas | paywall: 10 videos por lista en el plan gratis | sin límite; lista virtualizada (2.000 sin problema), subcarpeta con el nombre | dejar |
| F03 canales | canal completo | la raíz `@nombre` sigue la pestaña de videos | hecho, **sin probar con YouTube** |
| F05 suscripciones | sí | sí: no baja lo que ya había, frecuencia de 1 h a 3 días, pausar, comprobar ahora | hecho |
| F07 cerrar a mitad | sin comprobar | al reabrir vuelve a la cola y continúa desde el `.part` | dejar |
| F09 motor | se actualiza con la app, oculto | actualización visible, verificada con SHA-256, con vuelta atrás | dejar: mejor que el original |
| límites | plan gratis: ~10 descargas al día, anuncios | ninguno (uso personal) | dejar |
| accesibilidad | sin comprobar (una guía de NVDA sugiere que es usable) | 0 violaciones de axe en todas las pantallas; todo el flujo con teclado | dejar |

## Lo siguiente, por orden

1. **Probarlo en tu equipo con YouTube de verdad**: un video, uno en 4K, una
   lista, un canal por su raíz (`@nombre`), uno con subtítulos y una suscripción.
   Lo que falle va a `replica/bugs.md`.
2. **Probarlo en Windows o macOS**, si lo vas a usar ahí: matar descargas en
   pausa (`taskkill`), rutas largas, el binario de yt-dlp descargado.
3. **Idioma de la interfaz** (lo único que falta en Preferencias).
4. **Pista de audio en otro idioma**: está hecha, falta un video con varias pistas para probarla.
5. **`/replica-entrepreneur`**: decidir qué hacer mejor que el original.

El navegador integrado (opcional) queda fuera a propósito por ahora: copiar el
enlace del navegador de siempre y pegarlo cubre lo mismo.
