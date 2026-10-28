# Qué arreglar frente a 4K Video Downloader+

**Estado: sin reseñas todavía. No hay listas, ni plan de arreglos, ni ángulo.**

Esta parte se basa solo en reseñas reales, copiadas literalmente y con su enlace.
Desde el entorno donde se construyó la app no se pudo leer ninguna fuente:

| fuente | resultado |
| --- | --- |
| Hacker News (API de Algolia, `hn.algolia.com`) | bloqueada por la red de la sesión |
| Trustpilot (`www.trustpilot.com`) | bloqueada |
| G2 (`www.g2.com`), Capterra (`www.capterra.com`), Software Advice | bloqueadas |
| Reddit (`www.reddit.com`, `old.reddit.com`) | bloqueadas |
| Apple (`itunes.apple.com`, `apps.apple.com`) | bloqueadas |
| AlternativeTo, SourceForge | bloqueadas |
| Búsqueda web | funciona, pero devuelve resúmenes, no el texto de cada reseña: no sirve como cita |

Muestra: **0 reseñas.** Nada de lo que sigue es evidencia.

## Cómo llenarlo

**Opción A: abrir la red de la sesión.** En la configuración del entorno (menú del
entorno en la barra de título → Edit → Network access), añadir a los dominios
permitidos al menos `hn.algolia.com`, `www.trustpilot.com`, `www.g2.com`,
`www.capterra.com` y `www.reddit.com`. Pasos:
https://code.claude.com/docs/en/cloud-environments#network-access
Después, volver a pasar `/replica-entrepreneur`: leo las páginas como una persona,
copio las reseñas a `replica/reviews.csv` y genero todo con sus enlaces.

**Opción B: copiarlas tú.** Abre estas páginas en tu navegador, copia cada reseña
tal cual (también las de 3 y 4 estrellas) y pégalas en `replica/reviews.csv`,
una por fila: `source,url,date,rating,text`. Con 30 ya se ve una dirección;
con 100 o más, un orden fiable.

- G2: https://www.g2.com/products/4k-video-downloader-plus/reviews
- Capterra: https://www.capterra.com/p/10038360/4K-Video-Downloader-Plus/reviews/
- Trustpilot: https://www.trustpilot.com/review/4kdownload.com
- Reddit: busca "4k video downloader" junto a "alternative", "stopped working", "limit", "license"
- Hacker News: https://hn.algolia.com/?q=4k%20video%20downloader
- Su propio blog de versiones, para no "arreglar" lo que ya arreglaron: https://www.4kdownload.com/blog/

Luego:

```bash
python3 ~/.claude/skills/replica-entrepreneur/reviews.py replica/reviews.csv --themes replica/themes.json --out replica/feedback.md
```

`replica/themes.json` ya tiene, además de los 16 temas genéricos, 12 propios de un
descargador (calidad que se queda en 1080p, descargas atascadas, 403 y "dejó de
funcionar", límites del plan gratis, licencias, anuncios, antivirus, velocidad,
audio, subtítulos, listas y canales, videos privados), con patrones en inglés y
español, probados con datos de prueba.

## Lo que ya sospechamos (no es evidencia)

Durante el recon, artículos de reseñas de terceros (no reseñas de usuarios, y
leídos solo a través de resúmenes de búsqueda) mencionaban: que a veces no pasa
de 1080p, descargas atascadas o errores 403, límites del plan gratis y anuncios.
La app ya responde a varias cosas así por diseño (dice la calidad real obtenida,
errores claros con Reintentar, actualiza el motor sola, sin límites). **No cuenta
como arreglo "basado en usuarios" hasta que las reseñas lo confirmen**, y puede
que lo que más molesta sea otra cosa.

## Nota sobre el uso

La app es para uso personal, así que el "ángulo" de venta (para quién, contra qué)
importa poco. Las listas de "qué odian" y "qué falta" sí sirven: dicen qué mejorar
para ti. Si algún día la compartieras, el ángulo saldría de aquí y no se usaría
el nombre del original.
