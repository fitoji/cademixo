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
  moderno-bg: "#f4f4f5"
  moderno-card: "#ffffff"
  moderno-border: "#e4e4e7"
  moderno-text: "#18181b"
  moderno-primary: "#4f46e5"
  moderno-ring: "#6366f1"
  moderno-night-bg: "#18181b"
  moderno-night-card: "#232326"
  moderno-night-border: "#3f3f46"
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
    fontFamily: "Space Grotesk Variable, Avenir Next, Segoe UI Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 550
    lineHeight: 1.5
    letterSpacing: "-0.012em"
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
Fonts: Geist Variable (body, wordmark, menu, button, label); ui-monospace (data); Space Grotesk Variable (moderno-body); JetBrains Mono Variable (moderno-data); Arial (designator)
Spacing: xs 4px, sm 6px, md 8px, lg 12px, xl 16px
Radius: sm 4.2px, md 5.6px, lg 7px, xl 9.8px, 2xl 12.6px, pill 18.2px
North Star: "El plano de obra"
Elevation:
- Banda inferior: 0 1px 2px rgb(0 0 0 / 0.5), 0 4px 12px rgb(0 0 0 / 0.35)
- Banda superior: 0 -1px 2px …, 0 -4px 12px …
- Panel izquierdo: 1px 0 2px …, 4px 0 12px …
- Panel derecho: -1px 0 2px …, -4px 0 12px …
- Flotante: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)
Don't:
- Don't convertir esto en un dashboard SaaS: sin tarjetas flotantes, sin métricas grandes, sin gradientes, sin KPIs.
- Don't pintar un control de chrome con la tinta del dibujo, ni un cable con el gris del chrome.
- Don't pasar de 7px de radio en un control, ni usar píldoras fuera de las insignias contadoras.
- Don't agregar sombras fuera de las cinco direccionales documentadas, ni subir el blur de 12px.
- Don't usar mayúsculas fuera de los rótulos de 10px.
- Don't introducir violeta, glassmorphism, blur decorativo ni transparencias fuera de los `color-mix` de estado del lienzo.
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
Full: .impeccable/design-full.md (read a section when you need its detail)
