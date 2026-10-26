# Backend

App de escritorio local, de un solo usuario y para uso personal. El "backend"
es el proceso de Rust de Tauri: SQLite en la carpeta de datos de la app, el
motor (yt-dlp + ffmpeg) y una cola de descargas. **No hay servidor, cuentas,
pagos ni emails**, así que no hay claves que crear ni `.env.local` que rellenar.

## Lo que pide la skill y cómo queda aquí

| tema | estado | por qué |
| --- | --- | --- |
| Auth (registro, sesiones, OAuth, roles, borrar cuenta) | no aplica | un solo usuario en su propio equipo; no hay cuentas |
| Base de datos: migraciones versionadas | hecho | `src-tauri/migrations/0001–0003`, aplicadas al arrancar con `pragma user_version` (`db.rs`) |
| Reglas de acceso por fila | no aplica | un solo usuario. La frontera es la capa de comandos de Tauri: la ventana solo puede llamar a los comandos listados y a `dialog:allow-open` + `clipboard-manager:allow-read-text` (`capabilities/default.json`); sin shell ni disco libre |
| Datos de prueba | hecho | capa simulada (`src/api/fake.ts`) con `?seed=empty / long`; servidor local de videos (`scripts/test_server.py`) |
| Copias de seguridad | no aplica | la base de datos solo guarda la lista de descargas; los archivos son del usuario |
| Pagos (Stripe) | no aplica | uso personal, nada que vender |
| Email | no aplica | — |
| Tareas programadas | parcial | recuperación al arrancar y comprobación diaria del motor, hechas. Suscripciones: con la función (aún no). Limpieza de `.part` huérfanos: **descartada** (ver abajo) |
| Integraciones | hecho | una sola: releases de yt-dlp en GitHub (abajo) |

## Integración: actualizar yt-dlp (F09)

- **API:** `GET https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest` (pública, sin clave) y los archivos que publica yt-dlp en esa release.
- **Permisos/OAuth:** ninguno. **Revisión del proveedor:** ninguna.
- **Límite:** 60 consultas por hora e IP sin cuenta. La app pregunta como mucho una vez al día al arrancar (y cuando pulsas Buscar). Un 403/429 se muestra como "GitHub limita las consultas; prueba más tarde".
- **Verificación:** el binario se descarga entero en memoria (máx. 200 MB), su SHA-256 tiene que coincidir con la línea de `SHA2-256SUMS` de la misma release, y tiene que responder a `--version` en menos de 60 s. Si algo falla, el motor actual no se toca.
- **Sustitución:** `bin/yt-dlp.new` → prueba → el actual pasa a `bin/yt-dlp.prev` → el nuevo a `bin/yt-dlp`. "Volver a la anterior" intercambia los dos.
- **Cuándo:** si no hay motor al arrancar, se instala solo. Con "Actualizar solo" activado, una vez al día. **Nunca con descargas en marcha** (en Windows el ejecutable en uso no se puede sustituir): espera y lo ofrece en la interfaz.
- **Prioridad del motor:** `DESCARGADOR_YTDLP` > el instalado por la app > el del sistema (PATH). Con la variable puesta, la app no lo cambia.
- **Binario por sistema:** `yt-dlp.exe` / `yt-dlp_x86.exe` / `yt-dlp_arm64.exe` (Windows), `yt-dlp_macos`, `yt-dlp_linux` / `_aarch64` / `_armv7l`.
- **Probado:** 4 pruebas de integración contra una "GitHub" local (instalar, actualizar y volver atrás, suma incorrecta, binario que no arranca, sin red) y en la app real: al arrancar detectó la versión nueva, la instaló y la siguiente descarga funcionó con ella.

## Limpieza de temporales: descartada

La arquitectura proponía borrar al arrancar los `.part` de más de 7 días. No se
hace: la app no sabe con certeza qué `.part` son suyos, y la carpeta de
Descargas comparte nombres con los navegadores (Firefox también usa `.part`).
Los temporales de una descarga se borran al cancelarla o quitarla de la lista.

## Lista de seguridad

- [x] secretos solo en variables de entorno, `.env*` en `.gitignore`; no hay secretos (no hay claves)
- [x] entrada validada en el servidor (Rust) en cada comando: URLs solo http(s) y detrás de `--`, plantillas sin `..` ni rutas absolutas, carpetas absolutas y escribibles, idiomas `[A-Za-z0-9_-]{1,20}`, formatos según el tipo, ajustes dentro de rango; la base de datos repite las restricciones con `check`
- [x] procesos sin shell: `Command` con argumentos separados; nunca `--exec`
- [x] borrar un archivo solo si está dentro de la carpeta de su descarga (tras `canonicalize`)
- [x] actualizaciones del motor verificadas con SHA-256 antes de ejecutarlas
- [x] la ventana web (CSP) no carga nada de fuera salvo miniaturas `https:`; sin acceso a shell ni disco desde la interfaz
- [~] autorización con un segundo usuario: no aplica (un solo usuario local)
- [~] límites de tasa: no aplica a auth; las peticiones a GitHub van como mucho una vez al día
- [~] webhooks / subidas: no hay
- [x] sin datos del usuario en los registros: solo ids internos y errores del motor (las URLs y títulos no se registran)
- [x] dependencias auditadas: `npm audit` 0 vulnerabilidades; `cargo audit` 0 vulnerabilidades y 5 avisos de mantenimiento en la pila de Linux de Tauri (gtk-rs 0.18, zbus), que no dependen de nosotros
- [x] privacidad: ningún procesador de datos. La app solo habla con los sitios de los enlaces que pegas (vía yt-dlp) y con GitHub para actualizar el motor
- [ ] **pendiente:** un proxy con usuario y contraseña (`http://usuario:clave@…`) se pasa a yt-dlp como argumento y se ve en la lista de procesos del equipo. Para uso personal en tu propio equipo es aceptable; si hiciera falta, pasarlo por variable de entorno
