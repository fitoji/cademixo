# Auditoría del plan de optimización del editor

**Documento auditado:** [astra-optimizacion.md](../astra-optimizacion.md)
**Fecha:** 2026-11-25 (revisión 3)
**Rama:** `astra-perfo` (base `232a577`)
**Tipo:** auditoría de solo lectura. No se modificó código del editor ni del plan.

> **Revisión 3.** Incorpora la medición completa de la cadena de derivación del lienzo, `circuitFrom` en la confirmación, y corrige las dos conclusiones erróneas de la revisión 1 (ver «Historial de correcciones» al final).

## Resumen ejecutivo

1. **El diagnóstico del plan es correcto.** Se verificaron sus siete afirmaciones sobre `App.tsx` y `Canvas.tsx`: el preview de arrastre reconstruye el documento y la identidad de `records` invalida bornes, red del lienzo, snap, hit-test y rutas.
2. **Durante el movimiento, el costo dominante es la cadena de derivación del lienzo**, no `validate()`. Con un circuito cableado, a ~10.000 registros: `buildNetwork` 378 ms, `attachPoints` 114 ms, `snapContext` 116 ms y `wireCornerPaths` 10 ms — **~618 ms por evento** antes de renderizar. `Canvas.tsx:320-342` los recalcula porque `records` cambia de identidad en cada preview.
3. **A eso se suma la reconstrucción del documento**: `applyDrag` serializa todo el texto (2,4 / 10,6 / 20,5 ms para 1k / 5k / 10k, cota inferior) y `projectOf` parsea y reconstruye el proyecto (parse 0,4 / 1,9 / 2,8 ms; `buildProject` sin medir).
4. **En la confirmación, el costo dominante es `circuitFrom`**, no `validate()`: a ~10.000 registros cableados, `circuitFrom` 729 ms, `buildNetwork(project)` 378 ms y `validate` 192 ms — **~1,3 s por soltar**. Son eventos puntuales, no por cuadro, pero es la experiencia de confirmar una edición grande.
5. **`hitContext` es barato (0,1 ms a 10k)**: el índice de hit-test que propone el paso 4 del plan **hoy no se justifica**. La búsqueda de candidatos de `snapContext` (por evento de puntero) no se midió separada de su construcción.
6. **La línea base que propone el plan ya existe como gate, pero es inválida en paralelo.** `wiring-performance.test.ts` y `parse-perf.test.ts` fallan en `pnpm test` y pasan aislados y en serie (`--test-concurrency=1`: 911/911 en 7,2 s).
7. **La premisa de escala sigue sin evidencia de uso real.** No hay conteo de registros por hoja en proyectos reales. La medición demuestra que a 10.000 registros cableados el editor es inviable (~1,5 FPS), no que esos tamaños existan.

## Alcance y método

- Lectura del código en los puntos citados por el plan, más `state.ts`, `network.ts`, `pins.ts`, `wiring/`, `sim/circuit.ts` y los tests de performance existentes.
- **Medición A (estado):** documentos sintéticos de 2.000 a 16.000 registros con el generador de `test/parse-perf.test.ts`. Válida para `parse`, `applyDrag` y `validate`; **no** para red, porque no tiene cables.
- **Medición B (red y simulación, con cableado):** se replicó el bloque real `arranque-paro-motor-3f.cad` (43 registros, 27 cables) con ids nuevos y desplazamiento de 400 unidades por bloque, sobre una sola hoja, y se midió `buildNetwork`, `attachPoints`, `snapContext`, `hitContext`, `wireCornerPaths` y `circuitFrom` sobre 1.000, 5.000 y 10.000 registros. La densidad resultante (63 % de registros son cables) es alta: el costo depende de nodos×segmentos y una hoja más rala costaría menos.
- Protocolo: calentamiento previo; mínimo de 9 corridas con GC forzado (`--expose-gc`) para `validate`; mínimo de 3 corridas para las derivaciones; **1 corrida** para `circuitFrom` (es costoso y se buscó orden de magnitud, no precisión).
- **No se midió:** render de React, entrega de cuadros al navegador, pintura SVG, `buildProject` ni la consulta por evento de `snapOf`/hit-test. Eso requiere la pasada diagnóstica en navegador.
- Equipo: macOS, Node 24.16.0. Los milisegundos absolutos dependen del equipo; las razones de escala son la evidencia transferible.

## 1. Verificación de las afirmaciones del plan

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
- `projectOf` cachea el proyecto **en un solo slot por identidad de texto** (`state.ts:116-121`). Durante un arrastre real el texto cambia en cada evento, así que el cache no ayuda; el enfoque por delta lo protege de forma natural.
- `state.ts:4-12` declara que **la fuente de verdad es el texto** y que cada operación produce un texto nuevo. `commit()` (`state.ts:123`) valida la edición con un `parse()` completo. El plan propone saltear ese camino durante el preview: es correcto, pero debe quedar documentado como excepción explícita del invariante.

## 2. Mediciones

### 2.a Movimiento (preview): qué se recalcula en cada evento

Medido sobre el fixture real replicado y cableado (una hoja), salvo las dos primeras filas, que son de estado y no dependen del cableado.

| Costo por evento | ~1.000 regs | ~5.000 regs | ~10.000 regs | Dónde |
|---|---|---|---|---|
| `applyDrag` → serializar el texto completo (cota inferior) | 2,4 ms | 10,6 ms | 20,5 ms | `state.ts:1328`, `commit` |
| `parse` dentro de `projectOf` | 0,4 ms | 1,9 ms | 2,8 ms | `state.ts:116-121` |
| **`buildNetwork`** (lienzo) | 4,9 ms | 105,9 ms | **378,0 ms** | `Canvas.tsx:321`, `network.ts:109` |
| **`attachPoints`** (lienzo) | 1,0 ms | 28,0 ms | **114,4 ms** | `Canvas.tsx:320`, `pins.ts:78` |
| **`snapContext`** (lienzo) | 1,1 ms | 28,4 ms | **116,2 ms** | `Canvas.tsx:341`, `wiring/snap.ts:39` |
| `hitContext` (lienzo) | 0,0 ms | 0,1 ms | **0,1 ms** | `Canvas.tsx:342`, `wiring/hitTest.ts:33` |
| `wireCornerPaths` (lienzo) | 0,9 ms | 4,5 ms | 10,3 ms | `Canvas.tsx:368-378`, `ui/wire-corner.ts:99` |
| render de React | no medido | no medido | no medido | `Canvas.tsx:811-849` |

**Lectura:** en una hoja cableada grande, lo que hoy hace lento el arrastre es reconstruir documento y red del lienzo en cada evento. A ~10.000 registros, solo las derivaciones suman **~618 ms por evento**; con la reconstrucción del documento, ~640 ms antes del render. La proyección de `network.ts:182-187` compara cada nodo contra cada segmento: el costo crece muy por encima de lo lineal (×21 al ×5 de registros; ×77 al ×10).

### 2.b Confirmación y apertura (cambio de `state`)

Se recalcula `validate`, `buildNetwork(project.records)` y `circuitFrom`.

| Costo por confirmación | ~1.000 regs | ~5.000 regs | ~10.000 regs | Dónde |
|---|---|---|---|---|
| `circuitFrom` | 9,0 ms | 184,9 ms | **729,1 ms** | `App.tsx:909-918`, `sim/circuit.ts:141` |
| `buildNetwork(project.records)` | 4,9 ms | 105,9 ms | **378,0 ms** | `App.tsx:891` |
| `validate` | ~2 ms | ~48 ms | **192,5 ms** | `App.tsx:892`, `network.ts:223` |

`validate` con más resolución (mínimo de 9 corridas con GC forzado): 8,1 ms @2k, 29,5 @4k, 111,8 @8k, 192,5 @10k, 473,9 @16k. Curva: ×3,65 y ×3,79 al duplicar de 2k a 8k; ×2,46 al pasar de 10k a 16k con ×1,6 de tamaño. El exponente ≈2 coincide con el doble lazo de superposiciones de `network.ts:292-308`. Una medición inicial de 422 ms @10k quedó descartada por contaminación de GC.

**Lectura:** confirmar una edición grande cuesta ~1,3 s a 10.000 registros, y el mayor aporte es `circuitFrom`, no `validate`. Son eventos puntuales: no bloquean el arrastre, pero sí la sensación de "soltar y que responda".

### 2.c Referencia

El fixture real sin replicar (`arranque-paro-motor-3f.cad`, 43 registros): 0,82 ms por evento en total (applyDrag 0,59 + projectOf 0,10 + buildNetwork 0,05 + validate 0,07) y `circuitFrom` 0,3 ms.

## 3. Los gates de performance existentes

- `test/wiring-performance.test.ts:11-24` mide `projectOf(applyDrag(...))` con umbral de 2,5 ms por evento, sobre un fixture de 43 registros.
- `test/parse-perf.test.ts:36` mide el crecimiento del parse (umbral de razón 3,2 al duplicar).
- Ambos **fallan en `pnpm test`** porque Node ejecuta archivos en paralelo y el wall-clock se degrada por contención; **pasan** ejecutados aislados (≈1,2 ms por evento) y en la suite completa en serie.

Consecuencia: la etapa de benchmark debe fijar el modo de medición (aislado o serie, idealmente un script dedicado) antes de tomar cualquier número. De lo contrario, el antes/después compara ruido.

## 4. Hallazgos que el plan no contempla

1. **La red del lienzo se reconstruye por preview y no es barata con cableado** (`Canvas.tsx:320-321`; `network.ts:182-187`): 378 ms @10k. Es el mayor costo del movimiento y no aparece en ningún paso del plan.
2. **`attachPoints` (114 ms) y `snapContext` (116 ms) comparten el mismo origen** y el mismo problema.
3. **`circuitFrom` domina la confirmación (729 ms @10k)** y tampoco está en el plan. Es el trabajo independiente más rentable para "soltar".
4. **`hitContext` es barato (0,1 ms @10k)**: el paso 4 del plan (índice de candidatos por región) hoy no se justifica. Lo que podría dominar es la **consulta** de snap por evento (`snapOf`), que no se midió separada.
5. **`validate` es cuadrático, pero por confirmación/apertura, no por movimiento** (`network.ts:292-308`). Trabajo independiente; no debe ser prerrequisito del arrastre.
6. **El orden del plan sigue siendo poco rentable**: la etapa de capas estables solo mejora el paneo; el arrastre depende de las etapas de delta.
7. **Fixtures sin conectividad miden otra cosa.** El generador de `parse-perf` no sirve para red ni para `validate`; hace falta replicar o generar circuitos cableados.
8. **Premisa de escala sin evidencia**: falta contar registros por hoja en proyectos reales.
9. **Invariante del texto.** El plan lo respeta al soltar, pero la excepción del preview debe quedar escrita en `state.ts` o la próxima persona lo va a "corregir" volviendo a serializar.

## 5. Riesgos por etapa

| Etapa | Riesgo | Motivo |
|---|---|---|
| Benchmark con circuitos conectados | Bajo | Solo medición; el riesgo es medir mal (paralelismo, fixture sin cables, GC). |
| Preview por delta | Alto | Duplica geometría que hoy vive en una sola función compartida con el commit; divergencia preview/commit es el fallo esperado. |
| Capas estables + memo | Bajo-medio | Puede romper foco de borne, orden de superposición y hover si el comparador ignora props reales. |
| `circuitFrom` (independiente) | Medio-alto | Toca la simulación eléctrica; cualquier cambio de conectividad es regresión aunque el benchmark mejore. |
| `validate` lineal (independiente) | Medio-alto | Toca reglas eléctricas; ídem. |

## 6. Orden recomendado

1. **Etapa 0 — benchmark reproducible.** Circuitos conectados de 1.000, 5.000 y 10.000 registros por hoja, con semilla y distribución guardadas. Medir **por separado mover (preview) y soltar (confirmación)**, con traza de navegador, en modo serie/aislado. Contar además registros por hoja en proyectos reales.
2. **Etapa 1 — decidir con la traza.** Si en el movimiento domina la reconstrucción del documento y de la red del lienzo → priorizar el preview por delta (paso 3 del plan). Si en la confirmación domina `circuitFrom` (o `validate`) → abrir esa optimización como trabajo independiente.
3. **Etapa 2 — preview por delta.** Delta por ID sin tocar `state.text` ni pasar por `commit()`; al soltar, una sola aplicación canónica.
4. **Etapa 3 — capas estables y memoización** (paso 2 del plan), con el criterio de "cero re-renders en paneo a escala fija".
5. **Etapa 4 — índice de hit-test**: **no implementar hoy** (`hitContext` 0,1 ms). Reabrir solo si una traza muestra que la consulta de snap/hit-test domina.

## 7. Reproducibilidad

```bash
# Suite completa confiable (serie)
cd app && node --test --test-concurrency=1

# Gates de performance aislados
cd app && node --test test/wiring-performance.test.ts test/parse-perf.test.ts
```

Los scripts de medición de esta auditoría son descartables y viven fuera del repositorio; el apéndice A reproduce el de `validate` y el de red cableada. El benchmark definitivo debe vivir **dentro** del repo, como parte de la etapa 0.

## Apéndice A — mediciones usadas

`validate` (estado, sintético sin cables):

```js
const { createEditor, projectOf } = await import(`${APP}/src/editor/state.ts`);
const { validate } = await import(`${APP}/src/editor/network.ts`);
function synthetic(n) { /* *i*8000#K<i>*1*1*x*y*0*#, igual que parse-perf */ }
function best(fn, runs = 9) {
  fn();
  let m = Infinity;
  for (let i = 0; i < runs; i++) {
    globalThis.gc?.();
    const t = performance.now(); fn(); m = Math.min(m, performance.now() - t);
  }
  return m;
}
const p = projectOf(createEditor(synthetic(n)));
best(() => validate(p.records));
```

Red y simulación (fixture real replicado, una hoja, 400 unidades por bloque):

```js
const base = projectOf(createEditor(readFileSync(fixture, 'latin1'))).records; // 43 regs, 27 cables
// por bloque: ids nuevos y geometry[GEOMETRY.x] (+x2 en conexiones) desplazados
const net = buildNetwork(records);
best(() => buildNetwork(records), 3);
best(() => attachPoints(records), 3);
best(() => snapContext(net, records, 0), 3);
best(() => hitContext(net, records, 0), 3);
best(() => wireCornerPaths(segments, 3, pinned), 3);
best(() => circuitFrom(records), 1);
```

## 8. Trampas de medición encontradas

Para que el benchmark de la etapa 0 no repita estos errores:

1. **Fixture sin cables**: `buildNetwork` parece barato porque la proyección nodo×segmento no tiene segmentos. Toda medición de red exige cableado real.
2. **Paralelismo de `node --test`**: los tests de wall-clock fallan por contención, no por regresión. Medir aislado o con `--test-concurrency=1`.
3. **GC en mediciones repetidas**: una corrida de `validate` a 10k midió 422 ms y otra 192 ms. Usar mínimo de N corridas y forzar GC.
4. **Cache de un slot en `projectOf`**: repetir el mismo texto entre iteraciones da 0,00 ms y esconde el costo real. Cada muestra debe usar un texto distinto.
5. **Distinguir construcción de consulta**: `snapContext` mide construir el índice; la consulta por evento (`snapOf`) es otra cosa y no se midió.

## Historial de correcciones

- **Revisión 3 (2026-11-25).** Completa la cadena de derivación del lienzo y la confirmación:
  - Se agregan `snapContext` (116,2 ms @10k), `hitContext` (0,1 ms @10k), `wireCornerPaths` (10,3 ms @10k) y `circuitFrom` (729,1 ms @10k).
  - Nuevo hallazgo: en la confirmación domina `circuitFrom`, no `validate`.
  - El índice de hit-test del paso 4 del plan queda descartado por medición (0,1 ms).
  - Se documentan las cinco trampas de medición de la sección 8.
- **Revisión 2 (2026-11-25).** Corrige dos conclusiones de la revisión 1:
  - `validate()` **no** se ejecuta por movimiento: depende de `project`, que depende de `[state]` (`App.tsx:863, 892`). El costo medido es por apertura/confirmación.
  - `buildNetwork()` **no** es barato: la revisión 1 lo midió sobre un fixture sin cables. Con cableado real cuesta 380 ms a ~10.000 registros por la proyección nodo×segmento (`network.ts:182-187`).
  - Se agrega `attachPoints` (114 ms a ~10k) como parte del mismo costo por preview.
- **Revisión 1 (2026-11-25).** Primera versión: verificación de las afirmaciones del plan y medición del estado. Conclusión principal errónea: atribuía a `validate()` el costo por movimiento.
