# Componentes

Tema oscuro, diseñado desde cero: no hay capturas del original, así que nada
está medido ni copiado. Del recon solo se toman los roles y los patrones
(barra de herramientas arriba, lista de descargas, diálogos de formato).

- **Iconos:** [Lucide](https://lucide.dev) (licencia ISC), `lucide-react`, trazo 1.75, tamaños 16 y 20.
- **Fuente:** Inter (licencia OFL), **empaquetada dentro de la app** (sin CDN: es una app local). Los números de progreso, tamaño y velocidad van con `font-variant-numeric: tabular-nums`, para que no bailen.
- **Base accesible:** Radix UI (Dialog, DropdownMenu, ContextMenu, Select, Checkbox, Switch, RadioGroup, Tooltip, Toast), con estilos propios de Tailwind.
- **Clases:** solo tokens (`bg-surface`, `text-muted`, `border-border-input`, `rounded-md`). Nada de hex sueltos. En Tailwind el color de texto principal es `text-text` y el secundario `text-muted`.
- **Textos:** todos propios y en español. Ninguno se copia del original.

Densidad: es una app de escritorio, así que la base es 14 px y los controles
miden 32 px. La ventana mínima es de 760×480.

---

```
Button
  variants  primary (bg accent, text on-accent), secondary (bg surface-raised, borde border, text text),
            ghost (transparente, text text; hover surface-hover), danger (bg danger, text on-danger),
            icon (cuadrado, ghost, icono 16/20)
  sizes     sm 28px (px-3, text sm), md 32px (px-4, text base), lg 40px (px-5, text md); icon: 28 / 32 / 36
  states    default, hover (primary → accent-hover; resto → surface-hover), active (translateY 1px),
            focus-visible (anillo 2px focus + 2px de separación del color de fondo), disabled (opacidad .45, sin hover),
            loading (spinner en lugar del icono; el texto se queda, aria-busy="true")
  tokens    radius md, text base/600, motion fast
  a11y      <button> real; botones de solo icono con aria-label y Tooltip; Enter y Espacio
  used on   todas
```

```
Toolbar (barra superior)
  layout    alto toolbar-height (52), bg surface, borde inferior border, padding x 12
            izquierda: [Pegar enlace] (primary md, icono ClipboardPaste) · Smart Mode (Toggle con icono Zap)
            derecha:   Suscripciones (icon, Rss) · Navegador (icon, Globe) · Preferencias (icon, Settings) · menú (icon, Ellipsis)
  states    Smart Mode activo: icono y etiqueta en accent, con un punto accent; el tooltip dice el preset ("MP4 · 1080p · Descargas")
  keyboard  Ctrl/Cmd+V fuera de un campo de texto = Pegar enlace; Ctrl/Cmd+, = Preferencias
  a11y      role="toolbar" con aria-label; flechas izquierda y derecha entre botones (roving tabindex)
  used on   S01
```

```
DownloadItem (fila de la lista)
  layout    alto row-height (64; compacto 48), grid: [miniatura 96×54, radius sm] [título + meta] [estado] [acciones]
            título text base/500, una línea con elipsis (title completo en tooltip)
            meta text sm muted: "MP4 · 1080p · 412 MB · canal" (durante la descarga: "128 / 412 MB · 6,2 MB/s · 0:47")
  states    queued       meta "En cola", icono Clock muted
            parsing      ProgressBar indeterminada, "Analizando…"
            downloading  ProgressBar determinada accent + %, botones Pausar y Cancelar
            processing   ProgressBar indeterminada, "Uniendo video y audio…"
            paused       barra en muted, "En pausa", botón Reanudar
            done         check success, tamaño final y calidad real obtenida; si es menor que la pedida: "1080p (no había 4K)" en warning
            error        icono CircleAlert danger, mensaje corto según error_code, botón Reintentar; detalles en tooltip
            cancelled    tachado ligero en muted, se puede quitar
            hover        bg surface-hover y aparecen las acciones; seleccionada: bg surface-raised con barra izquierda de 2px accent
  actions   doble clic o Enter: abrir (done) · clic derecho / Shift+F10 / tecla Menú: ContextMenu
  keyboard  la lista es un listbox: flechas, Inicio/Fin, Espacio = pausar/reanudar, Supr = quitar
  a11y      role="option" con aria-label "Título, estado, 45 %"; el % va en una región aria-live="polite"
            que como mucho anuncia cada 25 % (no en cada tick)
  used on   S01
```

```
ProgressBar
  variants  determinada, indeterminada (franja que se desplaza; con reduced motion: pulso de opacidad)
  sizes     4px dentro de las filas, 6px en diálogos
  tokens    pista progress-track, relleno accent (success al llegar a 100), radius pill, transición de anchura motion base
  a11y      role="progressbar", aria-valuenow/min/max; la indeterminada sin valuenow y con aria-valuetext "Analizando"
  used on   S01, S02, S11
```

```
Dialog (modal)
  sizes     md dialog-width (560), lg dialog-width-wide (720; playlist)
  layout    bg surface-raised, radius lg, shadow pop, padding 20; cabecera (título text lg + cerrar icon)
            cuerpo con scroll; pie fijo con [Cancelar ghost] [acción primary] a la derecha
  states    abierto (fade + escala .98→1, motion base), enviando (acción en loading y resto desactivado), error en línea
  keyboard  Esc cierra; Enter en el pie activa la acción; el foco empieza en el primer control y queda atrapado
  a11y      Radix Dialog: role="dialog", aria-labelledby; al cerrar, el foco vuelve a quien lo abrió
  used on   S03, S04, S08
```

```
DownloadOptions (cuerpo de S03; reutilizado en S04 y S08)
  layout    cabecera de medios: miniatura 160×90 + título + canal + duración
            RadioGroup segmentado: [Video] [Solo audio]
            QualityList
            fila: Select formato · Select pista de audio · Select subtítulos (multi) · Checkbox "Incrustar en el video"
            FolderPicker
            Checkbox "Usar siempre estos ajustes (Smart Mode)"
  states    sin 4K disponible: esas filas desactivadas con "no disponible"; sin subtítulos: Select desactivado, "Este video no tiene subtítulos"
  used on   S03, S04, S08
```

```
QualityList
  layout    lista de radios de 40px: etiqueta ("2160p 4K", "1080p", "320 kbps") a la izquierda; a la derecha
            tamaño estimado text sm muted (tabular-nums) y Badge "60 fps" / "HDR"
  states    default, hover surface-hover, seleccionada (borde 1px accent + punto accent), no disponible (muted, no seleccionable)
  a11y      RadioGroup de Radix, flechas arriba y abajo
  used on   S03, S04, S08
```

```
Select
  sizes     32px; trigger bg surface, borde border-input, radius md, icono ChevronDown
  states    default, hover (borde text-muted), open (borde accent), focus-visible (anillo focus), disabled
  a11y      Radix Select; con escritura rápida para saltar a una opción (idiomas)
  used on   S03, S04, S07, S08
```

```
TextField (campo de URL, búsqueda, proxy, plantilla)
  sizes     32px; bg surface, borde border-input, radius md, padding x 10
  states    default, hover, focus-visible (borde accent + anillo focus), error (borde danger + mensaje text sm danger debajo,
            aria-invalid + aria-describedby), disabled
  used on   S01 (búsqueda), S06 (dirección), S07
```

```
FolderPicker
  layout    TextField de solo lectura con la ruta (elipsis en el centro: "/Users/…/Videos/YouTube") + botón secondary "Cambiar…"
  states    válida, inválida (no existe o no se puede escribir: borde danger, "No se puede escribir en esta carpeta")
  a11y      la ruta completa está en title y en aria-label
  used on   S03, S07, S08
```

```
Checkbox / CheckList
  sizes     16px, radius sm, borde border-input; marcado: bg accent + check on-accent
  states    marcado, desmarcado, indeterminado (cabecera "Seleccionar todo"), focus-visible, disabled
  CheckList (S04) filas de 56px: casilla + miniatura 80×45 + título + duración; virtualizada (playlists de 1.000+)
            cabecera fija: "Seleccionar todo" + "12 de 240 seleccionados" + SearchField para filtrar
  a11y      un Tab entra en la lista y las flechas recorren las filas; Espacio marca o desmarca
  used on   S03, S04, S07
```

```
Toggle (Switch)
  sizes     36×20
  states    on (bg accent, bolita on-accent), off (bg progress-track, bolita text-muted), focus-visible, disabled
  a11y      Radix Switch, role="switch", siempre con su etiqueta visible
  used on   S01 (Smart Mode), S05, S07, S08
```

```
ContextMenu / DropdownMenu
  layout    bg surface-raised, radius md, shadow pop, padding 4; elementos de 32px con icono 16 y atajo text xs muted a la derecha
  items     Reproducir · Mostrar en la carpeta · Copiar enlace · ─ · Pausar/Reanudar · Reintentar · ─ · Quitar de la lista ·
            Quitar y borrar el archivo (danger, con confirmación)
  states    elemento hover/resaltado surface-hover; desactivado muted (según el estado de la descarga)
  a11y      Radix: flechas, Enter, Esc y escritura rápida
  used on   S09 (y el menú ⋯ de la Toolbar)
```

```
EmptyState
  layout    centrado; icono Lucide 40 en muted, título text md, una línea text base muted, acción primary opcional
  copy      S01: "Aún no hay descargas" / "Copia el enlace de un video y pulsa Pegar enlace (o Ctrl+V)." / [Pegar enlace]
            S05: "Sin suscripciones" / "Pega el enlace de un canal y elige Suscribirse: lo nuevo se descargará solo."
            búsqueda sin resultados: "Nada coincide con «…»"
  used on   S01, S05
```

```
Toast / notificación
  variants  info (borde izquierdo accent), success, warning, error (borde izquierdo de su color); bg surface-raised, shadow pop
  layout    abajo a la derecha, 360px de ancho, se apilan hasta 3; se cierran solos a los 5 s, los de error se quedan; acción opcional ("Reintentar", "Actualizar motor")
  extra     al terminar una descarga con la app en segundo plano: notificación del sistema (tauri-plugin-notification)
  a11y      Radix Toast: region aria-live (polite; assertive solo para errores); no se cierra mientras tiene foco o el ratón encima
  used on   todas
```

```
Badge
  variants  neutral (bg surface-hover, text muted), accent, success, warning, danger (texto de color sobre surface-hover)
  size      20px, text xs/500, radius pill, padding x 8
  used on   QualityList ("60 fps", "HDR"), S05 ("3 nuevos"), S11 ("Actualización disponible")
```

```
SearchField
  layout    TextField de 32px con icono Search a la izquierda y botón para limpiar (X) cuando hay texto
  keyboard  Ctrl/Cmd+F lo enfoca; Esc lo vacía
  used on   S01, S04
```

```
WebView (navegador integrado, S06)
  layout    ventana aparte: barra de 44px (atrás, adelante, recargar, TextField de dirección) + vista web;
            botón flotante "Descargar este video" (primary lg, abajo a la derecha), visible solo si la URL es de un video
  states    cargando (ProgressBar indeterminada de 2px bajo la barra), sin video (botón oculto), error de carga
  security  la página web no tiene acceso a los comandos de Tauri
  used on   S06
```

```
SettingsSection (S07)
  layout    navegación lateral de 200px (General, Descargas, Suscripciones, Red, Motor, Acerca de) + contenido con filas
            de 48px: etiqueta y ayuda (text sm muted) a la izquierda, control a la derecha
  states    los cambios se guardan solos; si un valor es inválido, error en línea (TextField) y no se guarda
  used on   S07, S10, S11
```

---

## Dónde va cada cosa (sin medir: decisión propia)

- Ventana: 1040×680 por defecto y 760×480 como mínimo. Una sola columna: Toolbar y lista a todo el ancho.
- La lista ocupa todo el alto bajo la Toolbar. Una barra de estado opcional de 28px abajo: "3 descargando · 6,2 MB/s".
- Espaciado con base 4: 4, 8, 12, 16, 20, 24, 32, 48.
- Radios: 4 (miniaturas, casillas), 8 (controles, menús), 12 (diálogos).
- Sombras: solo en lo que flota (diálogos, menús, toasts). Las filas no llevan sombra.
- Movimiento: 120 ms en hover y foco, 200 ms al abrir un diálogo o en el progreso. Con `prefers-reduced-motion` todo es instantáneo.
