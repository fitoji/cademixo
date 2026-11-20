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

- T1 — Drop de `.cad` sobre la app, con la guarda de cambios sin guardar. Spec S1. Inline. commit: —
- T2 — Botón central centra el proyecto (sin arrastre). Spec S2. Inline. commit: —
- T3 — Estrella de favoritos en Propiedades, con grupo de favoritos en la paleta. Spec S3. Inline. commit: —
- T4 — Giro del motor 1000 centrado sobre su eje al simular. Spec S4. Inline. commit: —
- T5 — `cuelume` (S5): bloqueado hasta decidir qué sonido y dónde suena. commit: —

## Log

- L1 — «cuando termines revisa @todo.md y aplica todo lo que puedas» (pedido
  original, 2026-11-20).
- L2 — El archivo `todo.md` ya marca como hechos: migrar a ui-sdk, hover y
  sombreado, mover Apariencia a Ver, paneles horizontales o verticales. No se
  reabren.
- L3 — S5 no se aplica a ciegas: `cuelume` es una biblioteca de sonidos de
  interacción y la app todavía no tiene audio. Instalar una dependencia sin uso
  definido es un cambio de entrega sin objetivo; queda pendiente de decisión.
