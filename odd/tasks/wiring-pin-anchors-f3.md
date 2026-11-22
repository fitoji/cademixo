# wiring-pin-anchors-f3 — anclas por identidad de pin y re-ruteo incremental

**Objetivo:** F3 del plan de cableado profesional: reemplazar la regla de caja ±4 de `moveSelection` por identidad de borne real, y re-rutear sólo los cables cuyo extremo está anclado a un componente movido, conservando los waypoints fijos.
**Rama:** `feat/contraste-auditoria` (worktree actual).
**Runner:** `node --test` y `tsc --noEmit` desde `app/`.
**Estrategia de entrega:** commits por unidad de trabajo en la rama; push/PR decisión del usuario.

## Specs

- **S1 — "continua con f3"**. Mover un componente hace que los extremos de cable **anclados a sus bornes** sigan exactamente al pin (identidad `componentId + pinIndex`), no por proximidad de caja (`state.ts:282-285`).
- **S2**. Un cable que sólo pasa cerca o atraviesa la caja de un componente movido **no se mueve**.
- **S3**. El re-ruteo es incremental: sólo se mueven los extremos de los cables afectados y los vértices interiores (waypoints fijos) quedan intactos. La inserción automática de codos al re-rutear se difiere: F2 ya expone `moveSegment` para enderezar el tramo resultante.
- **S4**. Un gesto de movimiento = un solo undo. El número de cable, el estilo de los registros y el round-trip byte a byte se conservan.
- **S5**. Sin `WiringDocument` persistente: la identidad del borne sale de la vista derivada (`wiring/types.ts`), no de un modelo paralelo.

## Tasks

- T1 (S1-S5): `moveSelection` usa `path.from`/`path.to` de `wirePathsOf` para decidir qué cables re-rutear; helper `shiftedPolyline` para mover extremos e insertar codos; reutilizar el reescritor de polilínea de F2. Tests. Route: inline. Commit: —
- T2 (S1-S5): tests de no regresión (cable que pasa cerca, waypoints fijos, undo, round-trip, bornes compartidos) y cierre del feature. Route: inline. Commit: —

## Log

- **L1 (2026-11-22):** "continua con f3" — autoriza F3 del plan aprobado.
- **L2:** Contexto: F0+F1 (`55f4d89`) y F2 (`b8bb184`) completos, 681/681 tests. `wiring/types.ts` ya resuelve `Anchor` de tipo `pin` con `componentId`/`pinIndex` y `keyboard.ts` define `PinRef` con la misma identidad. Hoy `moveSelection` usa `boundsOf` con margen ±4 (`state.ts:291-330`).
- **L3:** Estado inicial: 681/681 tests verdes, `tsc --noEmit` limpio.
- **L4 (2026-11-22):** F3 completado con un alcance técnico ajustado. Se mantuvo la estructura original de `moveSelection` y se reemplazó el margen ±4 por un conjunto exacto de coordenadas de borne derivado de `attachPoints` para los componentes seleccionados. El primer intento (re-ruteo completo con `polylineEdit` por cable) produjo ids duplicados al clonar y rompió cables; se descartó por frágil. Consecuencia: los extremos siguen al pin y los waypoints interiores no se tocan, pero no se inserta un codo automático (S3 ajustado). Evidencia: 686/686 tests, `tsc --noEmit` limpio. Descubrimiento: `attachPoints` considera pin cualquier extremo de cable dentro de la caja, así que "no anclado" sólo puede ser un punto fuera de ella.
