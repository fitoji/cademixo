---
name: Electro-Simulador
description: Editor de esquemas eléctricos que abre y guarda archivos CADe_SIMU sin perder un byte.
colors:
  plano-bg: "#0e1116"
  plano-card: "#14181f"
  plano-popover: "#171c24"
  plano-border: "#232832"
  plano-text: "#e2e8f0"
  plano-text-soft: "#98a3b3"
  plano-primary: "#2c4a7c"
  plano-primary-ink: "#dce9ff"
  plano-secondary: "#24344d"
  plano-muted: "#1e2531"
  plano-select: "#5b9dff"
  plano-wire: "#3fbf8f"
  plano-wire-alt: "#35a89b"
  plano-warn: "#f0b429"
  plano-danger: "#ff6b6b"
  plano-ink: "#93a7c2"
  plano-grid: "#1a1f28"
  day-bg: "#f6f8fb"
  day-card: "#ffffff"
  day-border: "#d7dee8"
  day-text: "#16202c"
  day-text-soft: "#5d6a7a"
  day-primary: "#2f5c9e"
  day-wire: "#0f9d63"
  day-warn: "#b97d05"
  day-select: "#2f6fd0"
  moderno-bg: "#f6f6f7"
  moderno-card: "#ffffff"
  moderno-control: "#ececef"
  moderno-border: "rgb(24 24 27 / 0.08)"
  moderno-text: "#18181b"
  moderno-primary: "#4f46e5"
  moderno-ring: "#4f46e5"
  moderno-night-bg: "#18181b"
  moderno-night-card: "#242429"
  moderno-night-control: "#333338"
  moderno-night-border: "rgb(255 255 255 / 0.07)"
  moderno-night-primary: "#4f46e5"
typography:
  body:
    fontFamily: "Geist Variable, -apple-system, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  wordmark:
    fontFamily: "Geist Variable, -apple-system, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "-0.01em"
  menu:
    fontFamily: "Geist Variable, -apple-system, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "20px"
  button:
    fontFamily: "Geist Variable, -apple-system, system-ui, sans-serif"
    fontSize: "12.8px"
    fontWeight: 500
    lineHeight: "18.5px"
  label:
    fontFamily: "Geist Variable, -apple-system, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: "14.5px"
    letterSpacing: "0.5px"
  data:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: "16px"
    fontFeature: "tnum"
  moderno-body:
    fontFamily: "DM Sans Variable, Inter, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.006em"
  moderno-data:
    fontFamily: "JetBrains Mono Variable, ui-monospace, Cascadia Code, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: "16px"
    fontFeature: "tnum"
  designator:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontWeight: 600
    letterSpacing: "0.02em"
rounded:
  sm: "4.2px"
  md: "5.6px"
  lg: "7px"
  xl: "9.8px"
  2xl: "12.6px"
  pill: "18.2px"
# El mundo moderno corre un paso más blando: 8px es su radio de control.
moderno-rounded:
  sm: "4.8px"
  md: "6.4px"
  lg: "8px"
  xl: "11.2px"
  2xl: "14.4px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
components:
  chrome-header:
    backgroundColor: "{colors.plano-card}"
    textColor: "{colors.plano-text}"
    height: "46px"
    padding: "0 {spacing.lg}"
    rounded: "0px"
  chrome-footer:
    backgroundColor: "{colors.plano-card}"
    textColor: "{colors.plano-text-soft}"
    height: "26px"
    padding: "0 {spacing.lg}"
    typography: "{typography.data}"
    rounded: "0px"
  panel-side:
    backgroundColor: "{colors.plano-card}"
    textColor: "{colors.plano-text}"
    width: "232px"
    padding: "0px"
    rounded: "0px"
  button-primary:
    backgroundColor: "{colors.plano-primary}"
    textColor: "{colors.plano-primary-ink}"
    height: "28px"
    padding: "0 10px 0 6px"
    rounded: "{rounded.md}"
    typography: "{typography.button}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.plano-text}"
    height: "28px"
    padding: "0 10px 0 6px"
    rounded: "{rounded.md}"
    typography: "{typography.button}"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.plano-text}"
    size: "28px"
    rounded: "{rounded.md}"
  menubar-trigger:
    backgroundColor: "transparent"
    textColor: "{colors.plano-text}"
    height: "24px"
    padding: "2px 6px"
    rounded: "{rounded.sm}"
    typography: "{typography.menu}"
  menu-surface:
    backgroundColor: "{colors.plano-popover}"
    textColor: "{colors.plano-text}"
    width: "144px"
    padding: "4px"
    rounded: "{rounded.lg}"
  menu-item:
    backgroundColor: "transparent"
    textColor: "{colors.plano-text}"
    height: "28px"
    padding: "4px 6px"
    rounded: "{rounded.md}"
    typography: "{typography.menu}"
  badge-counter:
    backgroundColor: "transparent"
    textColor: "{colors.plano-text-soft}"
    height: "20px"
    padding: "2px 4px"
    rounded: "{rounded.pill}"
    typography: "{typography.data}"
  input-text:
    backgroundColor: "transparent"
    textColor: "{colors.plano-text}"
    height: "32px"
    padding: "0 10px"
    rounded: "{rounded.lg}"
---

# Design System: Electro-Simulador

<!-- impeccable:design-map -->
Name: Electro-Simulador
Colors: primary: plano-primary #2c4a7c; secondary: plano-secondary #24344d; tertiary: plano-warn #f0b429; neutral: plano-bg #0e1116; primary: plano-primary-ink #dce9ff; primary: plano-select #5b9dff (+20 more in the sidecar)
Fonts: Geist Variable (body, wordmark, menu, button, label); ui-monospace (data); DM Sans Variable (moderno-body); JetBrains Mono Variable (moderno-data); Arial (designator)
Spacing: xs 4px, sm 6px, md 8px, lg 12px, xl 16px
Radius: clásico sm 4.2px, md 5.6px, lg 7px, xl 9.8px, 2xl 12.6px, pill 18.2px · moderno sm 4.8px, md 6.4px, lg 8px, xl 11.2px, 2xl 14.4px, pill 9999px
North Star: "El plano de obra" en el mundo clásico; "charcos y bordes" en el moderno
Elevation:
- Banda inferior: 0 1px 2px rgb(0 0 0 / 0.5), 0 4px 12px rgb(0 0 0 / 0.35)
- Banda superior: 0 -1px 2px …, 0 -4px 12px …
- Panel izquierdo: 1px 0 2px …, 4px 0 12px …
- Panel derecho: -1px 0 2px …, -4px 0 12px …
- Flotante: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)
- Bandas del chrome, mundo moderno: none — las separa el borde
- Flotante del lienzo, mundo moderno: 0 2px 6px rgb(0 0 0 / 0.5), 0 10px 28px rgb(0 0 0 / 0.4)
Don't:
- Don't convertir el mundo clásico en un dashboard SaaS: sin tarjetas flotantes, sin métricas grandes, sin gradientes, sin KPIs.
- Don't pintar un control de chrome con la tinta del dibujo, ni un cable con el gris del chrome. Vale en los dos mundos.
- Don't pasar de 7px de radio en un control del mundo clásico; en el moderno el techo son 8px, y las píldoras siguen reservadas a las insignias contadoras.
- Don't agregar sombras fuera de las documentadas: cuatro bandas direccionales más el flotante en el clásico; ninguna en el chrome del moderno, donde sólo flota el chrome del lienzo.
- Don't usar mayúsculas fuera de los rótulos de 10px.
- Don't introducir violeta ni glassmorphism en el mundo clásico. El moderno sí escalona superficies de control (`#333338`) y baja el borde a blanco al 7%; nunca usa blur decorativo.
- Don't ocultar un ítem deshabilitado: se muestra al 50% para que la acción siga siendo descubrible.
Do:
- Do separar zonas con 1px de `{colors.plano-border}` antes de recurrir a una sombra.
- Do cargar la paleta arriba en clásico y al costado en moderno: el estilo elige la orientación.
- Do reservar el verde, el ámbar y el rojo para lo que pasa dentro del plano.
- Do usar mono de 11px con `tabular-nums` para cualquier cifra que se compare verticalmente.
- Do mantener el header en 46px y el footer en 26px: son las dos cotas que fijan la densidad.
- Do limitar el botón primario a una sola instancia visible por pantalla.
- Do nombrar las acciones con palabras en los menús, con el atajo en mono a la derecha.
- Do dejar el foco visible con borde de anillo más halo de 3px, en ambos temas.
- Do cambiar de estilo sin cambiar el significado del esquema: la tinta del dibujo, el archivo y el round-trip no dependen del mundo visual.

## Los dos mundos

El estilo no es un tema: son dos mundos visuales que comparten la misma tinta de
dibujo, el mismo archivo y el mismo contrato de round-trip.

| | Clásico | Moderno |
|---|---|---|
| North Star | El plano de obra | Charcos y bordes |
| Tipografía | Geist 13px | DM Sans 13px |
| Radio de control | 7px | 8px |
| Separación | Borde 1px + sombra direccional | Charcos de superficie + borde al 7% |
| Paleta | Sobre el header | Al costado |
| Chrome del lienzo | Barras del editor | Flotante: zoom a la izquierda, herramientas al centro |

Reglas que valen en los dos: la tinta del esquema (`--wire`, `--warn`, `--ink`,
`--grid-*`) no se reescribe nunca; el estilo cambia el chrome, no el dibujo. El
mundo moderno toma sus valores de Codia Studio -tres charcos, borde al 7%, radio
de 8px, DM Sans- y los aplica sólo al chrome.

El inspector pliega únicamente los grupos secundarios -vértice, bornes, avisos-.
Lo que describe al componente o a la selección se lee sin abrir nada: es el
motivo por el que el inspector está abierto.

## Contraste

`app/test/contraste.test.ts` resuelve los tokens de `index.css` para los cuatro
mundos y calcula ratios WCAG. Si un token se mueve y deja de cumplir, el test lo
dice con el par y el número en la mano. No se estima a ojo: un texto puede verse
bien en una captura y estar en 3.9:1.

Medido al cierre de este trabajo:

| Qué | Clásico día | Clásico noche | Moderno día | Moderno noche | Mínimo |
|---|---|---|---|---|---|
| Texto sobre panel | 16.44 | 14.43 | 17.72 | 13.22 | 4.5 |
| Texto secundario sobre panel | 5.51 | 6.97 | 6.61 | 5.60 | 4.5 |
| Botón primario | 6.21 | 7.21 | 6.29 | 6.29 | 4.5 |
| Destructivo sobre panel | 5.46 | 6.41 | 4.83 | 5.74 | 4.5 |
| Foco | 4.88 | 6.53 | 6.29 | 5.18 | 3 |
| Borde de campo | 1.51 | 1.38 | 3.00 | 3.16 | 3 |

### Dos excepciones declaradas

1. **El borde de campo del clásico queda bajo 3:1 a propósito.** Cumplirlo obliga
a un contorno muy visible que rompe el look de CADe_SIMU, y ese look es un
contrato del mundo clásico. Es una deuda conocida y medida, no un descuido: si
se decide pagarla, se cambia el token `--input` del clásico y el test se extiende
a ese mundo.
2. **`--border` no llega a 3:1 y no tiene por qué.** WCAG 1.4.11 pide contraste
para lo que identifica un componente; un separador separa zonas. Por eso el
moderno puede tener zonas de 7% y campos de 35%: son dos trabajos distintos y
ahora usan tokens distintos.
Full: .impeccable/design-full.md (read a section when you need its detail)
