# Backlog de `todo.md` — drop, botón central, favoritos, motor 1000, sonidos

Items pendientes del archivo personal `todo.md` del usuario, aplicados en un
lote. El origen de cada spec es la línea textual de ese archivo.

## Specs

- **S1** — `hacer drop de un archivo .cad en app y cargarlo, si el archivo que estaba tiene alguna modificacion, preguntar guardar proyecto tal antes de cargar el que se dropeo.`
- **S2** — `click con boton central (el de zoom) centrar proyecto`
- **S3** — `en propiedades de componente , estrella icono para poder agregar a favoritos`
- **S4** — `revisar componente 1000 al simular motor giro no centrado`
- **S5** — `biblioteca de sonidos: pnpm add cuelume`

## Tasks

- T1 — Drop de `.cad` sobre la app, con la guarda de cambios sin guardar. Spec S1. Inline. commit: 7c87cf6
- T2 — Botón central centra el proyecto (sin arrastre). Spec S2. Inline. commit: c6eec0a
- T3 — Estrella de favoritos en Propiedades, con grupo de favoritos en la paleta. Spec S3. Inline. commit: 330cf74
- T4 — Giro del motor 1000 centrado sobre su eje al simular. Spec S4. Inline. commit: 3273bbd
- T5 — `cuelume` (S5): pendiente de decisión. commit: —

## Log

- L1 — «cuando termines revisa @todo.md y aplica todo lo que puedas» (pedido
  original, 2026-11-20).
- L2 — El archivo `todo.md` ya marca como hechos: migrar a ui-sdk, hover y
  sombreado, mover Apariencia a Ver, paneles horizontales o verticales. No se
  reabren.
- L3 — S5 no se aplica a ciegas: `cuelume` es una biblioteca de sonidos de
  interacción y la app todavía no tiene audio. Instalar una dependencia sin uso
  definido es un cambio de entrega sin objetivo; queda pendiente de decisión.
- L4 — El usuario confirma en la app que el drop funciona, **incluido el camino
  donde acepta guardar antes de abrir**: el único que la automatización no podía
  alcanzar, porque sin handle de archivo abre el selector nativo del sistema.
  S1 queda verificado de punta a punta y sin deuda de verificación.
- L5 — S5 sigue abierta y no está bloqueada por código: se aplica cuando se
  defina qué evento suena y con qué dispositivo del catálogo (los candidatos son
  el timbre 9010/9012/9013 y el pulsador). Instalarla antes deja una dependencia
  muerta en `package.json`.
