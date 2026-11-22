# wiring-performance-f5 — draft ligero, fuzz y cierre del plan

**Objetivo:** F5 final: medir y abaratar el preview del arrastre (hoy `App.tsx:557-560` recalcula un proyecto entero con `applyDrag` en cada movimiento), añadir property tests/fuzz de round-trip y cerrar el plan de cableado profesional.
**Rama:** `feat/contraste-auditoria` (worktree actual).
**Runner:** `node --test` y `tsc --noEmit` desde `app/`.
**Estrategia de entrega:** commits por unidad de trabajo en la rama; push/PR decisión del usuario.

## Specs

- **S1 — "vamos con f5"**. El preview del arrastre no recompila el documento completo en cada evento de puntero: se mide el coste actual y se decide con evidencia si hace falta un draft ligero.
- **S2 — "quiero que funcione de 10"**. Fuzz de operaciones (agregar, mover vértice/tramo/componente, borrar unión, merge) sobre circuitos reales: después de cada operación el texto hace round-trip byte a byte y la red sigue siendo coherente.
- **S3**. Benchmark de router y de preview sobre circuitos reales, con presupuesto explícito.
- **S4**. Sin cambios de formato ni modelo paralelo; undos y selección se mantienen.

## Tasks

- T1 (S1, S3): benchmark del preview (`applyDrag` + `projectOf`) sobre el fixture real. DONE — ~1,4 ms/evento; presupuesto 2,5 ms. El router ya tenía su propio benchmark (~10 ms/50 rutas).
- T2 (S1): **draft ligero descartado con evidencia**: 1,4 ms por evento cabe en el presupuesto de 120 Hz (8,3 ms). No se agregó complejidad innecesaria.
- T3 (S2, S4): fuzz determinista de 60 operaciones (add, routed-add, junctions, move, segment, delete, moveSelection) con round-trip, ids únicos y crecientes; reproducibilidad por seed. DONE — cierre del plan.

## Log

- **L1 (2026-11-22):** "vamos con f5" — autoriza F5, cierre del plan de cableado profesional.
- **L2:** Contexto: F0 (`55f4d89`), F1 (`55f4d89`), F2 (`b8bb184`), F3 (`04df198`) y F4 (`3fe2762`) completos; 692/692 tests. `App.tsx:557-560` calcula `projectOf(applyDrag(state, preview))` en cada movimiento. El router ya tiene benchmark propio (50 rutas/20 obstáculos ~10 ms).
- **L3:** Estado inicial: 692/692 tests verdes, `tsc --noEmit` limpio.
- **L4 (2026-11-22):** F5 completo y plan cerrado. Evidencia: 695/695 tests (eran 692), `tsc --noEmit` limpio. Medición real del preview sobre `arranque-paro-motor-3f.cad`: `move` 0,65 ms, `bend` 0,96 ms, `segment` 0,94 ms, con `projectOf` incluido; test de presupuesto 120 eventos < 2,5 ms/evento. Decisión: no construir draft ligero (el coste ya es ~1/6 del frame de 120 Hz). Fuzz: 60 operaciones con seed 20261122, round-trip e ids estrictamente crecientes tras cada una; segundo test verifica reproducibilidad por seed.

## Cierre del plan

F0+F1 (`55f4d89`) → router ortogonal y cables multi-tramo. F2 (`b8bb184`) → arrastre de tramos. F3 (`04df198`) → anclas por borne. F4 (`3fe2762`) → uniones T automáticas y limpieza de huérfanas. F5 (este commit) → benchmark, fuzz y cierre. Sin cambios de formato CADe_SIMU en ninguna fase.
