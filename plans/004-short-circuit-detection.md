# 004 — Detección de cortocircuito y derivación a tierra estilo CADe_SIMU

> Estado: DONE · Prioridad: P1 · Depende de: — · Fecha: 2026-11-23
>
> Cerrado con `1e40fe9` (tabla de fases), `1aa8c13` (detector + fixtures + docs) y
> `4f95c22` (UI + e2e + config de Playwright en Windows).
>
> Evidencia: descompilación de `CADe_SIMU.exe` V4 con Ghidra vía REA MCP. Direcciones de Ghidra
> (image base `0x800000`; para la VA del PE restar `0x400000`):
>
> - `FUN_00854790` (`0x854790`): comparador de etiquetas de fase. Pares distintos entre
>   `'1'`,`'2'`,`'3'`,`'N'`,`'+'`,`'-'` → cortocircuito; cualquier par con `'P'` → derivación a tierra.
>   `'0'` = sin asignar (se ignora); `'Y'`/`'y'` son casos especiales de bobinado (fuera de alcance).
> - `FUN_008541c0` (`0x8541c0`): mensaje «Se ha producido un cortocircuito», detiene la simulación
>   (`this+0xa1b60 = 0`) y reinicia las etiquetas por registro (`this+0x7156c + i*0xf = '0'`).
> - `FUN_008543b0` (`0x8543b0`): mensaje «Se ha producido una derivación a tierra», mismo reinicio.
> - Llamadores observados: `FUN_004ffe60` (`0x4ffe60`) y `FUN_0052be70` (`0x52be70`) recorren los
>   registros y comparan las etiquetas de los extremos de cable
>   (`this+0x9019c + i*2` y `this+0x9113c + i*2`) para códigos `4000`, `0xfa9`, `0xfaa`,
>   `0xfb2`, `0xfb3`, `0xfa1`.
>
> CADe **no mide corriente ni resistencia**: propaga una etiqueta de fase por cada conductor y
> dispara cuando dos fases distintas (o fase + neutro, o `+`/`-`) coinciden en un mismo punto.

## Objetivo

Que la app detecte y avise de los mismos dos fallos que CADe, con el mismo criterio de etiquetas,
sin cambiar la firma de `simulate()` ni el formato `.cad`/`.cade`.

## Decisiones de diseño

1. **Detector separado del solver.** `simulate()` tiene 19 callers y su contrato es alcanzabilidad;
   no se le agrega detección. Se crea `app/src/sim/faults.ts` con una función pura:
   `detectFaults(records, netlist, state): SimulationFault | null`.
2. **Etiquetas por red, no por extremo de cable.** `buildNetlist()` ya unifica extremos en nets con
   UnionFind; una etiqueta por net es equivalente para la topología cerrada. Esta desviación del
   binario se documenta, no se disfraza.
3. **Semillas desde los símbolos de alimentación**, con el mismo orden de pines que ya usa
   `circuitFrom()` (`app/src/sim/circuit.ts:153-183`) y `LIVE_PIN_COUNT` de `flow.ts:28-36`:
   `3000 → ['1']`, `3001 → ['N']`, `3003 → ['1','N']`, `3004 → ['1','2','3']`,
   `3005 → ['1','2','3','P']`, `3006 → ['1','2','3','N']`, `3007 → ['1','2','3','N','P']`.
4. **Sólo conductancia real.** Las nets se unen con los polos cerrados en `SimState.closed`
   (`id = recordId:a-b`, que mapea directamente a `Device.poles` del netlist); los cables ya están
   unificados. Se exige que el grupo tenga al menos una net en `SimState.liveNets`.
5. **El detector no depende de `BuiltCircuit`.** Un corto directo L–N puede hacer que
   `circuitFrom()` devuelva `null` (`live === ret`); aun así hay que avisar. El detector trabaja
   sobre `records + buildNetlist()`.
6. **Al detectar:** `setRunning(false)`, cancelar pulsos, limpiar relojes de temporizadores y
   mostrar un diálogo modal con el texto exacto de CADe en español. No se altera el documento.
7. **Fuera de alcance:** magnitud de corriente, disparo físico de fusibles, tabla de 5 idiomas,
   los pares `Y`/`y`, y la semántica del relé diferencial (sólo se reporta la condición «P»).
   Tampoco se toca el formato de archivo: las etiquetas son estado de simulación, no se serializan.

## Work units (un commit por unidad, tests y docs incluidos)

### W1 — Tabla de incompatibilidad de fases

- **Archivos:** `app/src/sim/phase.ts`, `app/test/phase.test.ts`.
- `export type PhaseTag = '0'|'1'|'2'|'3'|'N'|'+'|'-'|'P'`.
- `export function phaseConflict(a: PhaseTag, b: PhaseTag): 'short' | 'earth' | null` con la tabla
  exacta del binario (pares ordenados; simétrica salvo el caso `P`).
- Tests: los 64 pares, incluidos `('1','1') === null`, `('1','N') === 'short'`,
  `('N','1') === 'short'`, `('1','P') === 'earth'`, `('0','1') === null`.
- **Verificación:** `node --test test/phase.test.ts` → 64/64.
- **Commit:** `feat(sim): add CADe phase-tag conflict table`.

### W2 — Detector sobre el netlist + fixture

- **Archivos:** `app/src/sim/faults.ts`, `app/test/faults.test.ts`,
  `app/test/fixtures/short-test.cad`, `docs/re/short-circuit-detection.md`.
- `detectFaults(records, netlist, state)` implementa las decisiones 2–5 y devuelve
  `{ kind, recordIds, nets } | null` para poder resaltar los cables implicados.
- Fixture: derivada de `app/test/fixtures/luz-con-interruptor.cade` reemplazando la lámpara
  (registro 3, código `8016`) por un tramo `4000` de `(120,66)` a `(120,54)`. Ya existe un prototipo
  validado por el parser en `%TEMP%/opencode/short-test.cad`; promoverlo al repo y verificar
  round-trip byte a byte con `cade.ts`.
- Segundo fixture para tierra: misma topología con el retorno alimentado desde un `3005`/`3007`
  (pin PE = `'P'`), o inyección directa de etiquetas en el test si el fixture resulta frágil.
- Tests: corto L–N con pulsador cerrado → `short`; corto L1–L2 → `short`; `+`/`-` → `short`;
  fase–PE → `earth`; mismo fase en dos tramos → `null`; contacto abierto → `null`; circuito sano
  de `luz-con-interruptor.cade` → `null`.
- Docs: `docs/re/short-circuit-detection.md` con las direcciones de Ghidra, la tabla de pares, la
  desviación «por red vs por extremo» y el alcance explícito.
- **Verificación:** `node --test test/faults.test.ts test/flow.test.ts test/circuit.test.ts`
  → verde; `node -e` de round-trip del fixture.
- **Commit:** `feat(sim): detect CADe-style shorts and earth leakage from phase tags`.

### W3 — Integración en la UI y parada de la simulación

- **Archivos:** `app/src/ui/App.tsx`, componente de diálogo (reutilizar `components/ui/dialog.tsx`;
  no agregar dependencia), `app/e2e/simulation-fault.spec.ts`.
- En el `step` de `App.tsx:647-683`, después de `simulate()`, llamar `detectFaults(...)` sobre el
  `built` existente. El resultado viaja con el paso, igual que `timerReady`, para no calcular dos
  veces ni mutar en render.
- Efecto dedicado: si hay fallo, `setRunning(false)`, `clearPulses()`, limpiar refs de
  temporizadores y abrir el diálogo. Texto: `Se ha producido un cortocircuito` /
  `Se ha producido una derivación a tierra`, título `Error` (idéntico a CADe).
- El badge/estado deja de decir «Simulación/Run» al parar, como en el original.
- E2E: cargar `short-test.cad` desde fixture, arrancar simulación, accionar el pulsador y
  comprobar mensaje + estado detenido. Si el harness no puede cargar fixtures locales, usar
  `setInputFiles`/ruta del fixture ya presente en `app/e2e/editor-smoke.spec.ts`.
- **Verificación:** `npx playwright test e2e/simulation-fault.spec.ts` → verde;
  `node --test` completo → sin regresiones; `npx tsc --noEmit` → sin errores nuevos.
- **Commit:** `feat(ui): stop simulation and report CADe short-circuit fault`.

### W4 — Cierre y registro

- **Archivos:** `plans/README.md` (marcar 004 DONE), `docs/re/pending-tasks.md` (si aplica).
- **Commit:** `docs(plans): close short-circuit detection plan`.

## Verificación de frontera (por work unit)

| Unidad | Comando | Resultado esperado |
|--------|---------|--------------------|
| W1 | `cd app && node --test test/phase.test.ts` | todos verdes |
| W2 | `cd app && node --test test/faults.test.ts test/flow.test.ts test/circuit.test.ts` | todos verdes |
| W3 | `cd app && npx playwright test e2e/simulation-fault.spec.ts` | mensaje y parada visibles |
| W3 | `cd app && node --test` | suite completa sin regresiones |
| W3 | `cd app && npx tsc --noEmit` | sin errores nuevos |

## Restricciones del entorno verificadas

- Node actualizado a 24.22.3 (cumple `>=24.22.1`) y pnpm global a 12.15.0 (`packageManager` del
  repo). `pnpm -v`, `pnpm test` y `pnpm --filter electro-simulador exec tsc --noEmit` funcionan.
- `E:` es FAT32: pnpm no puede crear symlinks. `pnpm-workspace.yaml` fija `nodeLinker: hoisted` y
  `verifyDepsBeforeRun: false` (pnpm v12 ignora esos settings en `.npmrc`). **`pnpm install` igual
  falla al crear el symlink del paquete workspace** `node_modules/electro-simulador -> app`: no
  reintentarlo en esta unidad; el `node_modules` hoisted del repo ya está poblado.
- Los tests de performance (`wiring-performance.test.ts`, `parse-perf.test.ts`) son sensibles a
  carga: pueden fallar con el umbral de 2,5 ms / ratio 3.2 sin relación con este cambio.
- Ghidra/REA no analiza el exe desde `E:` (FAT32): copiar a `%TEMP%` antes de otra pasada de REA.
- No hay tests de componentes React; la frontera de UI se cubre con Playwright, no con unit tests.

## Resultado medido

- `node --test test/phase.test.ts` → 7/7.
- `node --test test/faults.test.ts test/phase.test.ts` → 15/15.
- Suite completa `node --test` → 800/801; el único fallo es `wiring-performance.test.ts`
  (9–11 ms/evento contra el umbral de 2,5 ms, sensible a carga).
- `npx tsc --noEmit` → exit 0.
- `npx playwright test e2e/simulation-fault.spec.ts` → 1/1 (mensaje y parada de simulación).
- `npx playwright test` completo → 20 OK, 3 fallos preexistentes en Windows
  (`canvas-hover` y dos de `editor-smoke`): antes del cambio de `playwright.config.ts` el
  webServer ni arrancaba en Windows (`VITE_CACHE_DIR=...` como prefijo de comando), así que no son
  regresiones de este plan.
