# wiring-junctions-f4 — uniones automáticas y ciclo de vida de junctions

**Objetivo:** F4 del plan de cableado profesional: al soltar un cable sobre el interior de otro se crea el `4001` automáticamente; se extiende la limpieza de uniones huérfanas a add/delete/merge; y el Inspector ofrece quitar la unión huérfana que reporta el validator.
**Rama:** `feat/contraste-auditoria` (worktree actual).
**Runner:** `node --test` y `tsc --noEmit` desde `app/`.
**Estrategia de entrega:** commits por unidad de trabajo en la rama; push/PR decisión del usuario.

## Specs

- **S1 — "vamos con f4"**. Dibujar un cable con un extremo sobre el interior de otro cable crea el registro `4001` en ese punto, en el mismo commit y con un solo undo. Desaparece el aviso `tee-without-junction`.
- **S2**. Un cruce **sin** extremo que caiga sobre el otro cable no crea unión: seguir sin conectar.
- **S3**. La limpieza de `4001` huérfanos corre también en `addWire`, `addRoutedWire`, `deleteSelection` y `mergeVertex`, no sólo en los tres caminos de movimiento.
- **S4**. El Inspector muestra "Quitar unión" en los findings `orphan-junction`, con una acción que borra el registro apuntado por `f.ids`.
- **S5**. Round-trip byte a byte; sin cambios de formato ni modelo paralelo.

## Tasks

- T1 (S1, S2, S5): `teeJunctionRaws` detecta extremos sobre el interior de otro tramo (proyección con `t` estricto) y agrega los `4001`; integrado en `addWire` y `addRoutedWire` con el mismo asignador de ids. DONE — 4 tests.
- T2 (S3): `pruneOrphanJunctions` en add/addRouted/deleteSelection/mergeVertex. DONE — test de borrado con empalme.
- T3 (S4): `removeJunction` + botón "Quitar unión" en el Inspector (con `stopPropagation`) y cableado en App; `onPlace` pasa `JUNCTION_TEMPLATE`. DONE — test de borrado puntual.

## Log

- **L1 (2026-11-22):** "vamos con f4" — autoriza F4 del plan aprobado.
- **L2:** Contexto: F0+F1 (`55f4d89`), F2 (`b8bb184`) y F3 (`04df198`) completos, 686/686 tests. `validate()` ya reporta `tee-without-junction` y `orphan-junction`; el Inspector ya ofrece "Crear unión" para el primero. `buildNetwork` usa `onSegmentInterior` para conectar un extremo que cae dentro de otro tramo.
- **L3:** Estado inicial: 686/686 tests verdes, `tsc --noEmit` limpio.
- **L4 (2026-11-22):** F4 completo. Evidencia: 692/692 tests (eran 686), `tsc --noEmit` limpio. Causa raíz de tres fallos intermedios: `teeJunctionRaws` pedía ids con `nextId(project)` por separado y colisionaba con el id del cable recién creado; se unificó en un asignador compartido (mismo patrón que F3). Detalle: `t > 0.01 && t < 0.99` distingue T de extremo compartido, así que un cruce sin extremo no genera unión. El botón del Inspector detiene la propagación para no disparar "ir al aviso".
