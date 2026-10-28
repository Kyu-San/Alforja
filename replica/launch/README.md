# Lanzamiento

Alforja es para **uso personal** (decidido en el recon). Por eso esta carpeta no
tiene las cuatro piezas de una app que se vende:

| pieza | por qué no |
| --- | --- |
| `landing.md` (página de aterrizaje) | no hay a quién vendérsela; además, sin reseñas (`fixes.md`: 0) no hay ángulo con evidencia |
| `pricing.md` (precios, Stripe) | gratis y para ti |
| `listing.json` (ficha de tienda) | las tiendas no la aceptarían: la guía 5.2.3 de App Review de Apple prohíbe descargar contenido de terceros como YouTube sin autorización, y Google Play tampoco admite descargadores de YouTube |
| `launch-plan.md` | no hay lanzamiento público |

Lo que sí hay, para tu "lanzamiento" a tu propio equipo:

- **Instaladores**: `.github/workflows/release.yml` genera los de Windows, macOS
  (Apple Silicon e Intel) y Linux al subir una etiqueta `v*` a GitHub, en un
  borrador de release. Sin firmar.
- **Comprobaciones en cada push**: `.github/workflows/ci.yml` (tipos, pruebas de
  Rust con el motor real, Playwright con axe y la búsqueda de restos del original).
- **Guía de uso**: el `README.md` del proyecto (instalar, primer arranque, ffmpeg,
  uso, dónde están tus datos, desinstalar).
- **Comprobado aquí**: el `.deb` de Linux se compiló (8,4 MB), se instaló con sus
  dependencias (ffmpeg incluido) y la app instalada, con una carpeta de usuario
  nueva, bajó un video de prueba.
- **Sin comprobar**: los flujos de GitHub Actions (GitHub está bloqueado desde este
  entorno) y los instaladores de Windows y macOS.

Si algún día quisieras compartirla, el orden sería: reseñas reales en
`replica/reviews.csv` → `/replica-entrepreneur` (ángulo) → esta skill de nuevo
para la página. Sin el nombre del original en ningún sitio, y con un abogado
mirando el tema de los términos de los sitios.
