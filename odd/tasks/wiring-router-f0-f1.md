# wiring-router-f0-f1 — contrato de cableado y router ortogonal

**Objetivo:** F0 (adoptar `wiring/types.ts` como dominio vivo con invariantes y fixtures) y F1 (`wiring/router.ts`: rutas ortogonales con A* y ghost de dibujo), sin cambiar el formato CADe_SIMU.
**Rama:** `feat/contraste-auditoria` (worktree actual; no es la rama por defecto).
**Runner:** `node --test` y `tsc --noEmit` desde `app/`.
**Estrategia de entrega:** commits por unidad de trabajo en la rama; push/PR decisión del usuario.

## Specs

- **S1 — "adoptemos types.ts"**. `Anchor`, `WirePath`, `JunctionPoint` y `WiringDraft` dejan de ser scaffold sin consumidores: el router y el borrador de dibujo los usan de verdad. El tipo `routing: 'manual' | 'auto'` pasa a significar "waypoints del archivo" vs "ruta calculada".
- **S2 — "quiero un sistema de cables profesional!"**. Existe `wiring/router.ts` con una función pura que, dados dos extremos y las cajas de los símbolos, devuelve waypoints ortogonales que minimizan `longitud + λ·codos`, de forma determinista. Ningún tramo atraviesa una caja de símbolo. Los cables pueden cruzarse sin unión.
- **S3 — "quiero algo bien profesional y funcional y moderno"**. Dibujar un cable entre dos pines escribe una polilínea ortogonal de N registros 4xxx con el mismo número de cable, no un único segmento diagonal. El ghost sigue la ruta calculada durante el arrastre, con las dos variantes HV/VH como candidatos rápidos.
- **S4 — "quiero 100% compatibilidad con cadesimu"** (restricción registrada en `odd/tasks/wire-corner-rounding.md:25`). Abrir y guardar sin editar conserva el archivo byte a byte. Los waypoints presentes en un archivo importado se preservan: el router no los recalcula salvo petición explícita.
- **S5**. Sin `WiringDocument` persistente ni adapter completo: los registros siguen siendo la única fuente de verdad; el dominio de cableado es una vista derivada (`docs/WIRING_ARCHITECTURE_REVIEW.md:24-38`).

## Tasks

- T1 (S1, S4, S5): adoptar `wiring/types.ts` — `wirePathsOf`, `pathPoints`, `anchorPointOf` derivados de `Network`; `junctionPoints` ahora lleva `recordId`. DONE — 3 tests, round-trip verificado.
- T2 (S2): `wiring/router.ts` — grafo de visibilidad ortogonal + A* con heap binario, penalización de codos y tie-break determinista. DONE — 5 tests; bug del heap (bubble-up invertido) corregido en el camino.
- T3 (S2, S3): `addRoutedWire` escribe N registros 4xxx con número de cable nuevo y un solo undo. DONE — 4 tests.
- T4 (S3): ghost con la ruta calculada (`routeOrthogonal` en el useMemo del Canvas) y commit desde `App.onPlace` con las cajas de los símbolos como obstáculos. DONE — sin preview pesado nuevo.
- T5 (S1-S5): tests de aceptación, round-trip byte a byte y benchmark. DONE — 3 tests; 50 rutas/20 obstáculos en ~10 ms.

## Log

- **L1 (2026-11-22):** "quiero un sistema de cables profesional! busca alguna skill , algoritmos! quiero que funcione de 10".
- **L2 (2026-11-22):** "dale , hace una buena investigacion! y decime un plan para mejorar el sitema de cables y vertices!  quiero algo bien profesional y funcional y moderno".
- **L3 (2026-11-22):** "vamos con f0 + f1, adoptemos types.ts" — autoriza F0 y F1, con adopción explícita de `wiring/types.ts`.
- **L4:** Investigación previa: no hay skill de cableado recomendable; el algoritmo elegido es Orthogonal Connector Routing (Wybrow/Marriott/Stuckey 2009, `libavoid`) con heurísticas de Excalidraw. `router.ts` está propuesto en `docs/WIRING_ARCHITECTURE.md:127` y nunca implementado; PR1/PR2 del plan están hechos, PR3 parcial ( falta `commands.ts`).
- **L5:** Estado inicial: 658/658 tests verdes, `tsc --noEmit` limpio. El árbol trae cambios sin commitear de las iteraciones anteriores (limpieza de junctions 4001, ramales muertos y borrado de vértices) que se commitearán como unidad propia antes de F0 para dejar base limpia.
- **L6 (2026-11-22):** F0+F1 completos. Evidencia: 673/673 tests, `tsc --noEmit` limpio, round-trip byte a byte tras dibujar, registros originales intactos, benchmark 50 rutas/20 obstáculos ~10 ms (presupuesto 500 ms). Decisión técnica: los archivos comparten hunk entre el trabajo previo y F0/F1, así que se entregan en un único commit de work unit del subsistema de cableado en vez de partirlos con staging parcial frágil. Diferencia deliberada: el ghost usa el router completo (no sólo HV/VH) para que coincida exactamente con lo que se commitea; el coste medido es despreciable. Fuera de alcance (F2-F5 queda pendiente): re-ruteo al mover componentes, arrastre de tramos, anclas por identidad de pin, auto-uniones y draft ligero.
