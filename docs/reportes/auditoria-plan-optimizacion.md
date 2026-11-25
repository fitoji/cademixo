# Auditoría del plan de optimización del editor

**Documento auditado:** [astra-optimizacion.md](../astra-optimizacion.md)
**Fecha:** 2026-11-25 (revisión 4)
**Rama:** `astra-perfo`
**Tipo:** auditoría de solo lectura sobre el editor. El benchmark agregado no modifica código de producción.

> **Revisión 4.** Incorpora el benchmark integrado de la etapa 0 (`app/bench/`), que mide mover y soltar por separado sobre hojas cableadas, y corrige tres conclusiones de la revisión 3: no hay base para hablar de FPS, el total de "soltar" no estaba medido de forma consistente, y el índice de hit-test se posterga en lugar de descartarse. Ver «Historial de correcciones».

## Resumen ejecutivo

1. **El diagnóstico del plan es correcto.** Se verificaron sus siete afirmaciones sobre `App.tsx` y `Canvas.tsx`: el preview de arrastre reconstruye el documento y la identidad de `records` invalida bornes, red del lienzo, snap, hit-test y rutas.
2. **La etapa 0 ya tiene herramienta.** `pnpm bench` mide, sobre hojas cableadas de 1.000/5.000/10.000 registros, el costo de JavaScript de **mover** y de **soltar** por separado. No mide render de React ni presentación en el navegador: sus totales **no son FPS**.
3. **En ambas fases domina la operación de estado, `applyDrag`.** A 9.787 registros: mover 2.707 ms (applyDrag 1.875) y soltar 3.850 ms (applyDrag 1.924). La causa es estructural: cada edición ejecuta `pruneDeadStubs` y `pruneOrphanJunctions`, y cada uno hace `parse + buildProject + 2 × buildNetwork` (`state.ts:141-178, 356-358, 680-682`): **~4 reconstrucciones completas de red por edición**.
4. **`buildNetwork` es el primitivo que se repite en todo el camino.** Además de las 4 de `applyDrag`, lo llaman la cadena del lienzo (`Canvas.tsx:321`), `validate` (`network.ts:224`) y `buildNetlist` (`netlist.ts:179`), que a su vez es el motor de `circuitFrom`. Son ~5 reconstrucciones por movimiento y ~7 por confirmación.
5. **Segundo costo del movimiento: la cadena del lienzo** (~740 ms a 10k: `buildNetwork` 408, `attachPoints` 148, `snapContext` 150, `wireCornerPaths` 30). En la confirmación, detrás de `applyDrag`: `circuitFrom` 884 ms, `validate` 628 ms, `buildNetwork` 428 ms. Todos comparten el mismo primitivo.
6. **`hitContext` cuesta 0,4 ms a 10k, pero eso mide construcción de contexto, no consulta.** La consulta de hit-test recorre candidatos por evento. **Se posterga** el índice hasta medirla; no se descarta.
7. **La premisa de escala sigue sin evidencia de uso real.** No hay conteo de registros por hoja en proyectos reales. El benchmark demuestra cuánto cuesta cada tamaño, no que esos tamaños existan.

## 1. Alcance y método

- Lectura del código en los puntos citados por el plan, más `state.ts`, `network.ts`, `pins.ts`, `wiring/`, `sim/netlist.ts`, `sim/circuit.ts` y los tests de performance existentes.
- **Benchmark integrado (etapa 0):** `app/bench/wired-sheet.ts` genera la hoja cableada replicando un bloque real (`test/fixtures/arranque-paro-motor-3f.cad`: 12 componentes, 27 cables, con uniones) con ids nuevos y desplazamiento de 400 unidades por bloque, en una sola hoja. `app/bench/editor-preview.ts` mide, por tamaño: movimiento (applyDrag + `projectOf` + cadena del lienzo completa) y confirmación (applyDrag + `projectOf` + `buildNetwork` + `validate` + `circuitFrom`).
- Protocolo: calentamiento implícito por la primera corrida, mediana de 7 corridas para movimiento y 3 para confirmación, GC forzado antes de cada muestra (`--expose-gc`). La hoja generada se valida antes de medir: re-parsea completo, tiene cables y uniones, y la operación de arrastre **cambia el texto** (si no, el benchmark aborta).
- **Límites explícitos:** no se mide render de React, entrega de cuadros ni pintura SVG. La densidad del fixture generado es alta (63 % de los registros son cables); una hoja más rala costaría menos. Los milisegundos absolutos dependen del equipo; las razones de escala son la evidencia transferible.
- Equipo: macOS, Node 24.16.0.

## 2. Benchmark de referencia

```bash
pnpm bench                                  # 1.000 / 5.000 / 10.000 registros
pnpm bench --sizes=1000 --runs=3            # subconjunto rápido
pnpm bench -- --json                        # salida apta para comparar antes/después
```

Mediana en milisegundos, una hoja cableada:

| ~Registros | Fase | Total | applyDrag | projectOf | attachPoints | buildNetwork | snapContext | hitContext | wireCornerPaths | validate | circuitFrom |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1.009 (288 comp · 648 cables) | mover | 67,2 | 48,4 | 2,5 | 4,1 | 8,0 | 3,9 | 0,1 | 1,2 | — | — |
| 1.009 | soltar | 87,5 | 45,8 | 2,4 | — | 8,2 | — | — | — | 10,8 | 19,5 |
| 4.915 (1.404 comp · 3.159 cables) | mover | 785,0 | 573,0 | 9,9 | 37,6 | 105,5 | 39,5 | 0,2 | 15,1 | — | — |
| 4.915 | soltar | 1.066,4 | 532,9 | 9,8 | — | 129,2 | — | — | — | 164,8 | 227,0 |
| 9.787 (2.796 comp · 6.291 cables) | mover | **2.706,7** | **1.874,5** | 22,6 | 148,3 | 407,9 | 150,2 | 0,4 | 29,5 | — | — |
| 9.787 | soltar | **3.850,1** | **1.924,0** | 22,3 | — | 428,3 | — | — | — | 628,2 | 883,8 |

**Lectura:**

- `applyDrag` es el 69 % del movimiento y el 50 % de la confirmación. No es el arrastre del usuario: es la operación de estado que hoy se ejecuta una vez por evento de preview.
- `applyDrag` crece muy por encima de lo lineal (48 → 573 → 1.875 ms para ×5 y ×2 registros) porque su costo está dominado por las reconstrucciones completas de red de `pruneDeadStubs` y `pruneOrphanJunctions`, no por el tamaño de lo movido.
- La cadena del lienzo es el segundo costo del movimiento y escala de forma parecida: su `buildNetwork` es el mismo primitivo.
- En la confirmación, `circuitFrom` (884 ms) y `validate` (628 ms) quedan detrás de `applyDrag`; ambos vuelven a reconstruir la red por dentro (`netlist.ts:179`, `network.ts:224`).

## 3. Verificación de las afirmaciones del plan

| Afirmación | Resultado | Evidencia |
|---|---|---|
| Cada preview ejecuta `projectOf(applyDrag(state, preview))` | Cierto | `app/src/ui/App.tsx:865-868` |
| Los registros se recortan por hoja con `slice` | Cierto | `app/src/ui/App.tsx:870-874` |
| La identidad de `records` gobierna bornes, red, snap y rutas | Cierto | `app/src/ui/Canvas.tsx:320-342, 349-378` |
| El puntero actualiza objetivo magnético y gesto | Cierto | `app/src/ui/Canvas.tsx:677-697` |
| El render recorre registros y nodos | Cierto | `app/src/ui/Canvas.tsx:811-849` |
| Los cables seleccionados se filtran en cada render | Cierto | `app/src/ui/Canvas.tsx:763` |
| Las uniones se materializan y filtran todos los nodos | Cierto | `app/src/ui/Canvas.tsx:843-849` |
| "Red visual" y "red del proyecto" no son intercambiables | Cierto, y hay dos `buildNetwork` | `App.tsx:891` (proyecto) y `Canvas.tsx:321` (hoja) |

**Verificado además, y no está en el plan:**

- **No hay un solo `React.memo` en `app/src/ui`**: cada render recompone todos los `<Wire>` y `<Component>`.
- `App.tsx:891-892` y `909-918` calculan `buildNetwork`, `validate` y `circuitFrom` sobre `project`, cuya dependencia es `[state]` (`App.tsx:863`). **No se recalculan durante el arrastre**; sí al abrir, confirmar, deshacer o cambiar de hoja.
- `projectOf` cachea el proyecto **en un solo slot por identidad de texto** (`state.ts:116-121`). Durante un arrastre real el texto cambia en cada evento, así que el cache no ayuda; un preview por delta lo protege de forma natural.
- `state.ts:4-12` declara que **la fuente de verdad es el texto** y que cada operación produce un texto nuevo. El plan propone saltear ese camino durante el preview: es correcto, pero debe quedar documentado como excepción explícita del invariante.

## 4. Dónde se repite `buildNetwork`

Una sola confirmación de edición a ~10k registros reconstruye la red aproximadamente siete veces:

| Origen | Veces | Evidencia |
|---|---|---|
| `pruneDeadStubs` (antes y después) | 2 | `state.ts:141-145` |
| `pruneOrphanJunctions` (antes y después) | 2 | `state.ts:178-182` |
| `Canvas` sobre registros provisionales | 1 | `Canvas.tsx:321` |
| `validate` | 1 | `network.ts:224` |
| `buildNetlist` → `circuitFrom` | 1 | `netlist.ts:179` |

`buildNetlist` suma además un lazo anidado `segmentos × nodos` (`netlist.ts:187-194`).

## 5. Hallazgos que el plan no contempla

1. **La redundancia de `buildNetwork` es el costo raíz**, y está en el camino de edición, no solo en el render. Cualquier estrategia que no la reduzca deja intacto el 50-70 % del costo de ambas fases.
2. **La red del lienzo se reconstruye por preview** (`Canvas.tsx:320-321`): 408 ms de `buildNetwork` + 148 de `attachPoints` + 150 de `snapContext` a 10k.
3. **`validate` y `circuitFrom` reconstruyen red por dentro**, así que "validate cuadrático" era una lectura parcial: el cuadrático de superposiciones (`network.ts:292-308`) explica el caso sin cables, pero con cableado el costo lo domina `buildNetwork`.
4. **`hitContext` barato no decide nada**: mide construcción de contexto. La consulta por evento no se midió; el índice se posterga.
5. **El orden del plan sigue siendo poco rentable**: la etapa de capas estables solo mejora el paneo; el arrastre depende del camino de estado.
6. **Fixtures sin conectividad miden otra cosa** (esto explica dos conclusiones erróneas de las revisiones 1 y 2).
7. **Premisa de escala sin evidencia**: falta contar registros por hoja en proyectos reales.
8. **Invariante del texto.** La excepción del preview debe quedar escrita en `state.ts` o la próxima persona lo va a "corregir" volviendo a serializar.

## 6. Riesgos por etapa

| Etapa | Riesgo | Motivo |
|---|---|---|
| Reducir reconstrucciones de red en el camino de edición | Medio | Toca `prune*`, `validate` y `buildNetlist`; un cambio de conectividad es regresión aunque el benchmark mejore. La forma de menor riesgo es compartir una red ya construida por versión del documento, no reescribir las reglas. |
| Preview por delta | Alto | Duplica geometría que hoy vive en una sola función compartida con el commit; divergencia preview/commit es el fallo esperado. |
| Capas estables + memo | Bajo-medio | Puede romper foco de borne, orden de superposición y hover si el comparador ignora props reales. |
| Índice de consulta de hit-test | Medio | Debe preservar prioridades, distancias y desempates exactos; solo con medición de la consulta. |

## 7. Orden recomendado

1. **Etapa 0 — hecha, con una deuda.** El benchmark de estado y derivaciones existe. Falta la traza de navegador para render de React y presentación de cuadros; sin ella no se puede afirmar nada sobre fluidez percibida.
2. **Etapa 1 — reducir reconstrucciones de red por edición.** Candidato medido y de mayor retorno: una red por versión del documento, compartida por `prune*`, `validate` y `buildNetlist`. Comparar con `pnpm bench`. Si el costo de `applyDrag` cae al orden de la serialización, el preview por delta puede dejar de ser necesario; eso lo decide la medición, no la intuición.
3. **Etapa 2 — preview por delta**, si tras la etapa 1 el movimiento sigue fuera de presupuesto. Delta por ID sin tocar `state.text` ni pasar por `commit()`; al soltar, una sola aplicación canónica.
4. **Etapa 3 — capas estables y memoización** (paso 2 del plan), con el criterio de "cero re-renders en paneo a escala fija".
5. **Etapa 4 — índice de consulta de hit-test**, solo cuando exista medición de la consulta por evento.

## 8. Los gates de performance existentes

- `test/wiring-performance.test.ts:11-24` mide `projectOf(applyDrag(...))` con umbral de 2,5 ms por evento, sobre un fixture de 43 registros.
- `test/parse-perf.test.ts:36` mide el crecimiento del parse (umbral de razón 3,2 al duplicar).
- Ambos **fallan en `pnpm test`** porque Node ejecuta archivos en paralelo y el wall-clock se degrada por contención; **pasan** ejecutados aislados (≈1,2 ms por evento) y en la suite completa en serie (`--test-concurrency=1`: 911/911 en 7,2 s).

## 9. Trampas de medición encontradas

Para que las próximas mediciones no repitan los errores de las revisiones anteriores:

1. **Fixture sin cables**: `buildNetwork` parece barato porque la proyección nodo×segmento no tiene segmentos. Toda medición de red exige cableado real.
2. **Operación que no cambia el texto**: `applyDrag` con una op rechazada mide solo serialización + comparación. El benchmark aborta si el texto no cambia.
3. **Paralelismo de `node --test`**: los tests de wall-clock fallan por contención, no por regresión.
4. **GC en mediciones repetidas**: una corrida de `validate` a 10k midió 422 ms y otra 192 ms. Forzar GC y usar mediana.
5. **Cache de un slot en `projectOf`**: repetir el mismo texto entre iteraciones da 0,00 ms. Cada muestra debe usar un texto distinto.
6. **Confundir construcción con consulta** (`snapContext`/`hitContext` vs. `snapOf`/búsqueda por evento) y **sumar mediciones aisladas como si fueran un cuadro**.

## 10. Reproducibilidad

```bash
# Benchmark del editor
pnpm bench
pnpm bench --sizes=1000 --runs=3
pnpm bench -- --json

# Suite completa confiable (serie)
cd app && node --test --test-concurrency=1

# Gates de performance aislados
cd app && node --test test/wiring-performance.test.ts test/parse-perf.test.ts
```

## Historial de correcciones

- **Revisión 4 (2026-11-25).** Benchmark integrado y tres correcciones pedidas en revisión:
  - Se elimina la inferencia de FPS: los totales son costo de JavaScript en Node, sin medición de cuadros.
  - Se elimina el total de "1,3 s al soltar" mezclado (validate sin cables + red cableada + `circuitFrom` de una corrida). El benchmark mide las tres piezas sobre la misma hoja y con 3 corridas; `circuitFrom` queda como costo medido, no como cuello confirmado de producto.
  - El índice de hit-test **se posterga**, no se descarta: 0,4 ms miden construcción de `hitContext`, no la consulta.
  - Nuevo hallazgo: `applyDrag` domina ambas fases por ~4 reconstrucciones de red en `prune*`; `buildNetwork` es el primitivo que se repite ~7 veces por confirmación.
- **Revisión 3 (2026-11-25).** Agrega cadena del lienzo y `circuitFrom`; declara dominante a `circuitFrom` en la confirmación e índice de hit-test descartado (corregido en rev. 4).
- **Revisión 2 (2026-11-25).** Corrige dos conclusiones de la revisión 1:
  - `validate()` **no** se ejecuta por movimiento: depende de `project`, que depende de `[state]` (`App.tsx:863, 892`).
  - `buildNetwork()` **no** es barato: la revisión 1 lo midió sobre un fixture sin cables.
- **Revisión 1 (2026-11-25).** Primera versión. Conclusión principal errónea: atribuía a `validate()` el costo por movimiento.
