# Marca: Alforja

Fecha: 2026-10-28. Ángulo: aún sin evidencia (ver `fixes.md`: 0 reseñas, fuentes
bloqueadas). La app es para uso personal; el nombre se eligió por lo que hace
(guardar lo que quieres ver después), no contra el original.

## Nombre

**Alforja**: la bolsa doble que se cuelga del hombro o de la montura para llevar
lo tuyo de viaje. Pegas un enlace y el video va a tu alforja, para verlo cuando
quieras y sin conexión.

Candidatos (20), por estilo:

| estilo | candidatos |
| --- | --- |
| descriptivo | Bajaclip, Guardaclip, Copiaybaja, ClipFácil |
| compuesto | Tomaclip, Pegabaja, Bajalotodo, Archivaclip |
| inventado | Vidro, Kliko, Ondra, Tirela |
| metáfora | **Alforja**, **Despensa**, **Zurrón**, **Cántaro**, Hucha, Faro |
| verbo | **Atrapa**, Guarda |

Fuera por parecerse a la categoría o al original (cualquier cosa con "4K",
"Downloader", "Video" o "Saver"), por ser genéricos o difíciles de registrar
("Guarda", "Bajaclip") o por chocar con apps conocidas de otros sectores ("Hucha",
"Faro"). Quedaron 5; elegiste **Alforja**.

### Comprobaciones

Solo de cribado, no son un informe legal. Antes de gastar dinero en el nombre
(dominio, registro, diseño), que lo mire un abogado de marcas.

| comprobación | Alforja | Despensa | Zurrón | Cántaro | Atrapa |
| --- | --- | --- | --- | --- | --- |
| web: "nombre + app de video/descargas" | 2026-10-28: ninguna app de video con ese nombre en la primera página | 2026-10-28: ninguna de video; existe "Dispensa" (app de despensa, otra categoría) | 2026-10-28: ninguna | 2026-10-28: ninguna; "Cantara" (proyecciones de canciones) y "Cantina" (IA), nombres distintos | 2026-10-28: ninguna |
| marca EE. UU. (USPTO, clases 9 y 42) | por hacer | por hacer | por hacer | por hacer | por hacer |
| marca UE (EUIPO eSearch / TMview) | por hacer | por hacer | por hacer | por hacer | por hacer |
| marca España (OEPM, localizador) | por hacer | por hacer | por hacer | por hacer | por hacer |
| global (WIPO Global Brand Database) | por hacer | por hacer | por hacer | por hacer | por hacer |
| dominio (`whois alforja.app`, `.com`, `.es`) | por hacer | por hacer | por hacer | por hacer | por hacer |
| tiendas (Microsoft Store, Mac App Store) | por hacer | por hacer | por hacer | por hacer | por hacer |
| redes y GitHub | por hacer | por hacer | por hacer | por hacer | por hacer |

Todas las bases de marcas, los registradores de dominios, las tiendas y las redes
están bloqueadas desde el entorno donde se hizo esto: no se han ejecutado, y nada
de lo anterior significa "disponible". La búsqueda web fue una sola consulta por
nombre.

## Paleta

El rol `accent` pasa del azul lavanda provisional a **cobre** (el cuero de una
alforja). Los nombres de los roles no cambian (`replica/design/tokens.json`).

| rol | antes | ahora |
| --- | --- | --- |
| accent | `#7b93ff` | `#e8996e` |
| accent-hover | `#95a8ff` | `#f2b08c` |
| on-accent | `#0b0d12` | `#140d09` |
| focus | `#a9b8ff` | `#f5c6a8` |
| warning | `#efb54a` | `#e3c94f` (más amarillo, para no confundirse con el cobre) |

Fondo, superficies, texto, error y éxito no cambian. Contraste: **26 pares, 0
fallos AA** (`contrast.py`); el cobre sobre el fondo da 8,3:1, más que el azul
anterior. axe pasa en todas las pantallas.

Los colores de marca del original **no se conocen** (no hay capturas): `brand.json`
tiene `colors` vacío. Cuando haya capturas, añade sus colores ahí y repite la
comprobación.

## Logo (brief)

- **La idea:** una alforja vista de frente, con la solapa como una flecha hacia
  abajo: "lo que bajas, lo guardas".
- **Tipo:** símbolo + logotipo ("Alforja" en minúscula, Inter Semibold o una
  geométrica con carácter). El símbolo solo funciona como icono.
- **Tiene que funcionar** a 16 px (favicon, bandeja del sistema) y como icono de
  1024 px. A 16 px, solo la silueta: la bolsa y la flecha, sin costuras.
- **Color:** cobre `#e8996e` sobre el fondo oscuro `#0f1115`, o al revés. Una
  versión monocroma para la bandeja de macOS.
- **Entregables:** SVG; icono 1024×1024 sin transparencia; `.ico` (16–256) para
  Windows y `.icns` para macOS (`npx tauri icon` los genera desde el PNG de
  1024); imagen social de 1200×630 si algún día hay web.
- **No puede parecerse** a la marca del original: ni "4K" ni números, ni su forma,
  ni su par de colores. Ponla al lado de su icono y compruébalo a ojo antes de
  darla por buena.
- **Hoy:** `src-tauri/icons/` tiene un icono provisional generado aquí (cuadrado
  cobre con una solapa y una flecha). Sustitúyelo por el logo final.

## Voz

**Clara, cercana, breve.**

- **Clara, no técnica:** dice qué pasa y qué hacer. Los detalles del motor van
  plegados, para quien los quiera.
- **Cercana, no empalagosa:** de tú, sin diminutivos, sin exclamaciones, sin
  emojis.
- **Breve, no seca:** una frase si basta, sin perder el porqué ("sin preguntarte").

| sí | no |
| --- | --- |
| "Ese enlace no se pudo leer" | "¡Ups! Algo ha ido mal 😕" |
| "Es privado: conecta tu cuenta en Preferencias" | "Error 403: acceso denegado" |
| "Pega un enlace y se baja solo, sin preguntarte" | "Descarga instantánea con tecnología inteligente" |
| "Tu alforja está vacía" | "No se encontraron elementos" |
| "1080p (no había 2160p)" | "Calidad no disponible" |

### Los textos más vistos, reescritos

| dónde | antes | ahora |
| --- | --- | --- |
| lista vacía (título) | Aún no hay descargas | Tu alforja está vacía |
| lista vacía (texto) | …y pulsa Pegar enlace (o Ctrl+V). | …y pulsa Pegar enlace (Ctrl+V). Lo que bajes aparece aquí. |
| función de un clic | Smart Mode (el nombre del original) | Modo directo |
| aviso al pegar con modo directo | En la cola con Smart Mode | Directo a la cola |
| diálogo del modo directo | …Con Smart Mode activado, cada video que pegues se descarga así, sin preguntar… | …Con el modo directo encendido, cada video que pegues se baja así, sin preguntarte… |
| interruptor | Activar Smart Mode | Encender el modo directo |
| leyendo un enlace | Analizando el enlace… | Leyendo el enlace… |
| error al leer un enlace | No se pudo analizar | Ese enlace no se pudo leer |
| portapapeles sin enlace | El portapapeles no tenía un enlace. Pégalo aquí (Ctrl+V). | No había ningún enlace copiado. Pégalo aquí (Ctrl+V). |
| notificación al terminar | Descarga terminada | Ya está en tu alforja |
| suscripciones vacías | …cada video nuevo se descargará solo, con el formato que elijas. | …Cada video nuevo se bajará solo, como tú digas. |

"Pegar enlace", "Descargar" y "Listo" se quedan: son claros, cortos y nadie
tiene que aprenderlos.

## Barrido

`python3 ~/.claude/skills/replica-brand/sweep.py . --config replica/brand.json`
→ **limpio** (2026-10-28), después de:

- renombrar "Descargador" (nombre provisional) → "Alforja" en la app, el
  identificador (`app.alforja.desktop`), el paquete de Rust (`alforja`,
  `alforja_lib`), la base de datos (`alforja.sqlite3`), las variables de entorno
  (`ALFORJA_*`), la carpeta del proyecto y el README;
- renombrar la función "Smart Mode" (su nombre en el original) → "modo directo",
  también en el código (`direct_mode`, `directDownload`…) y en el esquema;
- quitar el nombre del original del comentario de la migración 0001 (va dentro
  del binario).

Ojo: `sweep.py` no salta `src-tauri/target` (la compilación de Rust). Si se pasa
con una compilación hecha en una carpeta que aún se llame como antes, da cientos
de falsos avisos: limpia con `cargo clean` antes.

Comprobado a ojo: título de la ventana y nombre del producto ("Alforja"), icono
(provisional, cobre). No hay favicon web, plantillas de email ni imagen social:
es una app de escritorio.
