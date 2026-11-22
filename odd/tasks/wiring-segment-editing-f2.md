# wiring-segment-editing-f2 — arrastre de tramos y vértices fijos

**Objetivo:** F2 del plan de cableado profesional: arrastrar un tramo lo mueve de verdad (shift de sus dos vértices con codos de entrada/salida), en vez de insertar un codo nuevo en cada gesto. Se puede agarrar un tramo sin seleccionar el cable primero.
**Rama:** `feat/contraste-auditoria` (worktree actual).
**Runner:** `node --test` y `tsc --noEmit` desde `app/`.
**Estrategia de entrega:** commits por unidad de trabajo en la rama; push/PR decisión del usuario.

## Specs

- **S1 — "vamos con f2"**. Arrastrar un tramo **interior** desplaza sus dos vértices en la dirección perpendicular, insertando los codos necesarios en los tramos vecinos para que todo siga siendo ortogonal.
- **S2**. Arrastrar un tramo **extremo** inserta un codo sin mover el borne (comportamiento actual de `bend`, conservado). Doble-clic sobre un tramo inserta un waypoint (ya existe; se cubre con test de no regresión).
- **S3**. Se puede agarrar un tramo con un clic, sin seleccionar antes el cable. El gesto tiene preview, `Escape`/`pointercancel` cancelan y un gesto confirmado = **un solo undo**.
- **S4**. El número de cable y los waypoints fijos se conservan. Abrir y guardar sin editar sigue siendo byte a byte.
- **S5**. Sin `WiringDocument` persistente: la vista derivada de `wiring/types.ts` se usa para ubicar el tramo, pero los registros siguen siendo la fuente de verdad.

## Tasks

- T1 (S1, S4, S5): `moveSegment` + `writePolyline` en `state.ts`, con el patrón de shift perpendicular y codos de entrada/salida. DONE — 6 tests.
- T2 (S2, S3): `DragOp.kind='segment'`, `applyDrag`, gesto `startSegment` en el controller (preview/cancel/commit) y Canvas: arrastrar el cuerpo ya mueve el tramo. DONE — 3 tests de controller sumados a los existentes.
- T3 (S1-S5): tests de waypoints fijos, undo único y round-trip; doble-clic sigue insertando vértices. DONE — suite completa verde.

## Log

- **L1 (2026-11-22):** "vamos con f2" — autoriza F2 del plan aprobado.
- **L2:** Contexto: F0+F1 cerrados en `55f4d89`. Hoy arrastrar un tramo llama a `startBend` (`Canvas.tsx:605`), que inserta un vértice nuevo en cada gesto; el doble-clic ya inserta waypoints (`Canvas.tsx:676-683`). El patrón de referencia es `moveSegment` de Excalidraw: tramo interior = mover sus dos extremos; tramo extremo = insertar codo sin mover el borne.
- **L3:** Estado inicial: 673/673 tests verdes, `tsc --noEmit` limpio.
- **L5 (2026-11-22, auditoría):** defecto crítico encontrado en `writePolyline`: reutilizaba los ids viejos y los re-anexaba al final, violando el requisito de ids estrictamente crecientes del parser (`cade.ts:48-73`). Si el cable movido no era el último del archivo, el parser lo descartaba y fundía su texto dentro del `raw` del último registro: el cable desaparecía y el registro quedaba corrupto (reproducido: cable A ids 52-54, max 57 → A invisible y último raw de 90→154 chars). Fix: `polylineEdit` reescribe los tramos existentes **en su lugar** (mismo id e índice) y sólo anexa ids `max+1` para los tramos nuevos; allocador monotónico. Regresión en `wiring-polyline-ids.test.ts` (cable no-último, cable importado, reducción de tramos) y fuzz reforzado para detectar raws que absorben un registro de cable ajeno. Evidencia: 699/699 tests.
- **L4 (2026-11-22):** F2 completo. Evidencia: 681/681 tests (eran 673), `tsc --noEmit` limpio. Nota de implementación: `moveSegment` reutiliza `wirePathsOf`/`pathPoints` para ubicar el tramo en la polilínea derivada y `writePolyline` reescribe los registros del cable conservando número y estilo; el gesto extremo delega en `bendCable` para no mover el borne. Se corrigió el `cancel` del controller para que el gesto `segment` también emita el efecto de cancelación (Escape/pointercancel). Fuera de alcance (F3-F5): re-ruteo al mover componentes con anclas por identidad de pin, auto-uniones en T, draft ligero.
