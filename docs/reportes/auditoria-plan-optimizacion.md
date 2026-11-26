# Auditoría del plan de optimización del editor

**Documento auditado:** [astra-optimizacion.md](../astra-optimizacion.md)
**Fecha:** 2026-11-26 (revisión 19)
**Rama:** `astra-perfo`
**Tipo:** auditoría + benchmark + deltas + paneo + explicación del piso.

> **Revisión 19.** Explica el piso de 33,4 ms del paneo: cadencia real de pantalla 60 Hz, hoja chica a 16,7 ms y hoja grande a 33,4 ms; la traza apunta a **style/layout**, no a pintura. No se cambia el renderer. Ver 2.p.

## Resumen ejecutivo

1. **El diagnóstico del plan es correcto.** Se verificaron sus siete afirmaciones sobre `App.tsx` y `Canvas.tsx`: el preview de arrastre reconstruye el documento y la identidad de `records` invalida bornes, red del lienzo, snap, hit-test y rutas.
2. **La etapa 0 ya tiene herramienta.** `pnpm bench` mide, sobre hojas cableadas de 1.000/5.000/10.000 registros, el costo de JavaScript de **mover** y de **soltar** por separado. No mide render de React ni presentación en el navegador: sus totales **no son FPS**.
3. **En ambas fases domina la operación de estado, `applyDrag`.** A 9.787 registros: mover 2.707 ms (applyDrag 1.875) y soltar 3.850 ms (applyDrag 1.924). La causa es estructural: cada edición ejecuta `pruneDeadStubs` y `pruneOrphanJunctions`, y cada uno hace `parse + buildProject + 2 × buildNetwork` (`state.ts:141-178, 356-358, 680-682`): **~4 reconstrucciones completas de red por edición**.
4. **Etapa 1 aplicada y medida.** Compartir la red anterior entre las dos podas y reutilizar la posterior solo si el texto no cambió (`pruneEdits`) lleva las reconstrucciones de **5 → 3 por movimiento** y **7 → 5 por confirmación**. A 9.787 registros: mover 2.766 → 1.958 ms (−29 %) y soltar 3.715 → 2.729 ms (−27 %); `applyDrag` 1.833 → 1.191 ms (−35 %). El texto resultante, las uniones y la entrada de deshacer son **idénticos** (verificado por hash antes/después y suite completa 911/911).
5. **`buildNetwork` es el primitivo que se repite en todo el camino.** Aun después de la etapa 1, lo llaman la cadena del lienzo (`Canvas.tsx:321`), `validate` (`network.ts:224`) y `buildNetlist` (`netlist.ts:179`), que es el motor de `circuitFrom`. Quedan 3 reconstrucciones por movimiento y 5 por confirmación.
6. **Segundo costo del movimiento: la cadena del lienzo** (~740 ms a 10k: `buildNetwork` 408, `attachPoints` 148, `snapContext` 150, `wireCornerPaths` 30). En la confirmación, detrás de `applyDrag`: `circuitFrom` 884 ms, `validate` 628 ms, `buildNetwork` 428 ms. Todos comparten el mismo primitivo.
7. **`hitContext` cuesta 0,4 ms a 10k, pero eso mide construcción de contexto, no consulta.** La consulta de hit-test recorre candidatos por evento. **Se posterga** el índice hasta medirla; no se descarta.
8. **La premisa de escala sigue sin evidencia de uso real.** No hay conteo de registros por hoja en proyectos reales. El benchmark demuestra cuánto cuesta cada tamaño, no que esos tamaños existan.
9. **Traza en navegador, dev y producción (9.577 registros cableados).** En producción el p95 del intervalo entre frames al mover es **1.266,6 ms** y la edición se confirma en el DOM a los **2,48–2,64 s**; en dev esos valores son 2.833 ms y 5,4–5,8 s. Al mover, `applyDrag` y la red dominan (React, 13 % en dev). Al soltar, **los cuatro consumidores reconstruyen red**: `applyDrag` 1,46 s, `circuitFrom` 1,13 s, `validate` 0,83 s y `buildNetwork` de `App` 0,60 s (inclusivo, dev). **Decisión: preview por delta para el movimiento; red compartida entre consumidores para la confirmación.**
10. **Preview por delta implementado para mover.** `moveDelta` comparte la regla del commit como cálculo puro; el lienzo dibuja el delta sin tocar documento ni historial. En producción el p95 al mover baja de **1.266,6 a 50,0 ms** (−96 %) y soltar no regresa (2.446,7–2.528,8 ms). Ver 2.d.
11. **Red final compartida en la confirmación.** `validate` y `buildNetlist` aceptan la red ya construida; `App` se la pasa junto con `circuitFrom`. Las redes intermedias de `applyDrag` **no** se comparten: una poda puede cambiarlas. Reconstrucciones por soltar: **6 → 4**; A/B intercalado en producción: **3,34–3,61 s → 2,45–2,61 s** (−26 %). Ver 2.e.

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

### 2.b Etapa 1 aplicada: antes y después

Cambio (`state.ts`): `pruneEdits` construye **una** red para los registros anteriores y la comparte con las dos podas; la red posterior de `pruneDeadStubs` se reutiliza en `pruneOrphanJunctions` **solo si devolvió el texto intacto**. Si la primera poda eliminó un tramo, la red de después es otra y se reconstruye. El alcance también se respeta: la red compartida corresponde siempre a los mismos registros.

Mismo benchmark, mismo fixture y mismo equipo; el "antes" se obtuvo revirtiendo solo el cambio de `state.ts` y repitiendo el bench.

| ~Registros | Fase | Antes | Después | Δ | `buildNetwork` |
|---|---|---|---|---|---|
| 1.009 | mover | 71,5 ms | 56,6 ms | −21 % | 5 → 3 |
| 1.009 | soltar | 90,3 ms | 77,9 ms | −14 % | 7 → 5 |
| 9.787 | mover | 2.766,5 ms | 1.957,8 ms | −29 % | 5 → 3 |
| 9.787 | soltar | 3.715,3 ms | 2.729,3 ms | −27 % | 7 → 5 |

`applyDrag` a 9.787 registros: 1.832,7 → 1.191,0 ms al mover (−35 %) y 1.739,8 → 1.023,1 ms al soltar (−41 %). La cadena del lienzo no cambia: no era su alcance.

**Equivalencia verificada.** Se capturaron hashes del texto resultante de `move`, `bend`, `segment` y `vertex` sobre el fixture, más longitud del texto, uniones, derivaciones, `past.length` y `dirty`. Las cuatro salidas son idénticas antes y después. Suite completa: 911/911 en serie.

### 2.c Traza en navegador: dev y producción

Herramienta: `app/e2e/preview-trace.spec.ts` (sólo con `PREVIEW_TRACE=1`). Misma hoja cableada (**9.577 registros · 2.736 componentes · 6.156 cables · 228 bloques**), viewport 1.440×900, zoom fijo 2,76, trayectoria de 12 pasos de 4 px y 5 repeticiones después del calentamiento. Verifica que el gesto mueve un componente **conectado** (`traceId` de un bloque central validado por red).

**Línea base de producción** (`pnpm build` + `vite preview`; JSON versionado en `app/bench/baselines/preview-prod.json`):

| Medición | Producción | Desarrollo (referencia) |
|---|---|---|
| p95 del intervalo entre frames al mover | **1.266,6 ms** | 2.833,3 ms |
| Intervalo medio | 160,9 ms | 359,0 ms |
| Latencia al soltar hasta DOM confirmado | **2.481–2.638 ms** | 5.392–5.835 ms |
| Cuadro siguiente al DOM | +45 a +53 ms | +65 a +85 ms |

La producción es ~2,2× más rápida en ambas fases y sigue lejos de un presupuesto de cuadro: el problema no es el build de desarrollo.

**Qué mide:** p95 del intervalo entre callbacks de rAF; latencia desde `pointerup` hasta que el DOM muestra la edición confirmada (botón «Deshacer» habilitado); atribución de CPU por muestreo (CDP `Profiler`) en tiempo **propio** y **inclusivo** (función más todo lo que llama, acumulado por ruta de llamada).
**Qué no mide:** presentación confirmada en pantalla. La atribución por función sólo existe en dev: en producción el bundle está minificado.

**Mover (ventana perfilada ≈ 35 s, dev):**

| Función | Propio | Inclusivo por ruta |
|---|---|---|
| `applyDrag` (podas + sus redes) | — (en `state.ts`) | **16.167 ms** |
| `buildNetwork` | 12.729 ms (total) | ≈ 6.425 ms por ruta: una desde las podas, otra desde el lienzo |
| `attachPoints` | 12.805 ms | 2.159 ms (fuera de `buildNetwork`) |
| `snapContext` | — | 2.166 ms |
| React | 4.391 ms | — |

**Soltar (ventana perfilada ≈ 5,9 s, dev).** El tiempo propio subestima a los consumidores; mirando inclusivo:

| Consumidor | Propio | Inclusivo |
|---|---|---|
| `applyDrag` (commit) | — | **1.461 ms** |
| `circuitFrom` | 129 ms | **1.129 ms** (vía `buildNetlist`: 1.000 ms) |
| `validate` | 135 ms | **829 ms** |
| `buildNetwork` de `App` | 598 ms por llamada | 598 ms |

Los cuatro consumidores reconstruyen la red: uno dentro de `applyDrag`, uno en `App`, uno dentro de `validate` y uno dentro de `buildNetlist` (que además vuelve a pedir `attachPoints`). Por eso compartir la red es el paso correcto **sólo si todos usan la misma versión y el mismo alcance** del documento.

**Decisión:** al mover domina la reconstrucción de red y el trabajo que dispara `applyDrag` (React es 13 % en dev). **Se prioriza el preview por delta.** Soltar va aparte, con la red compartida entre consumidores.

**Criterio de aceptación del delta:**

1. **Cero reconstrucciones completas de red durante `pointermove`** (medido con `networkStats`).
2. **Una sola edición confirmada al soltar**: una aplicación canónica y un paso de deshacer.
3. **Mismo resultado** de conectividad y deshacer que hoy (hashes de texto, uniones, derivaciones, `past`).
4. **Comparación con la misma hoja y trayectoria**: p95 al mover contra **1.266,6 ms** (producción) y latencia de soltar contra **2.481–2.638 ms**.

### 2.d Preview por delta: resultado

Implementado para el gesto de **mover**, el que tiene línea base:

- `moveDelta` (`state.ts`) es la regla del commit extraída como cálculo puro: posiciones de componentes, extremos de cables y codos. No serializa, no parsea y no construye red.
- `moveSelection` usa el mismo delta para escribir: preview y commit no pueden divergir.
- El lienzo dibuja el delta (componentes desplazados, cables con extremos nuevos, codos) y **no** llama a App durante `pointermove`; App aplica la operación canónica una sola vez al soltar.
- `Escape`/`pointercancel` descartan el delta sin escribir.

| Criterio de aceptación | Resultado |
|---|---|
| Cero reconstrucciones completas de red en `pointermove` | Cumplido: perfil dev con `red` = 1,8 ms (antes 25,2 s) y sin `buildNetwork` en el top; prueba unitaria verifica que `moveDelta` no incrementa `networkStats` |
| Cero escrituras al documento/historial durante el gesto | Cumplido: «Deshacer» sigue apagado y el estado sucio no cambia (verificado en la traza) |
| Una sola edición confirmada al soltar | Cumplido: un `commit` por gesto (prueba del controlador) |
| Mismo texto, conectividad y deshacer | Cumplido: hashes idénticos al estado previo para `move`, `bend`, `segment` y `vertex`; 915/915 pruebas |
| Cancelación sin cambios ni historial | Cumplido: prueba de `Escape` durante el arrastre de componentes |
| p95 al mover (producción, misma hoja y trayectoria) | **1.266,6 → 50,0 ms** (−96 %); media 160,9 → 21,2 ms |
| Soltar (producción) | **2.446,7–2.528,8 ms** en esa corrida; la ruta de confirmación no cambió con el delta. Comparaciones absolutas entre sesiones no son válidas (ver varianza en 2.e) |

**Límites de este incremento:**

- Sólo el gesto de mover. Arrastrar vértice, tramo o doblez sigue usando el preview por documento completo.
- El preview usa los bornes de la hoja visible; en documentos de varias hojas, un cable de otra hoja con las mismas coordenadas no se previsualiza (el commit conserva el comportamiento actual).
- Durante el gesto, los cables afectados se dibujan sin esquinas redondeadas: usan los extremos del delta.

### 2.e Confirmación: red final compartida

Cambio:

- `validate(records, network?)` y `buildNetlist(records, network?)` aceptan una red ya construida para los **mismos registros y alcance**.
- `circuitFrom` recibe `network` en sus opciones y lo pasa a `buildNetlist`.
- `App` construye una red del proyecto y la pasa a los tres consumidores.
- Las redes intermedias de `applyDrag` (podas) **no** se comparten: si una poda cambia los registros, esa red ya no representa el resultado final.

Reconstrucciones completas por fase (contador `networkStats`, expuesto como `window.__networkStats` para la traza):

| Fase | Antes | Después |
|---|---|---|
| Movimiento | 0 | 0 |
| Soltar | 6 | 4 |

Las dos que quedan fuera del conjunto compartido son las de `applyDrag` (antes y después de la poda) y la del lienzo, que reconstruye sobre los registros de la hoja.

A/B de latencia en producción, intercalado en la misma sesión, misma hoja y trayectoria:

| Lado | Corrida 1 | Corrida 2 | Redes |
|---|---|---|---|
| Antes | 3.415,3–3.545,5 ms | 3.337,8–3.606,8 ms | 6 |
| Después | 2.512,8–2.610,3 ms | 2.452,4–2.574,0 ms | 4 |

Medición aislada en Node, misma sesión, mediana de 5: **2.684 → 2.020 ms** (−25 %), 5 → 3 reconstrucciones.

**Varianza:** el mismo código midió 2,45 s y 3,42 s en invocaciones distintas (hasta 40 %). Por eso el antes/después se corre **intercalado y back-to-back**; comparar contra corridas de otra sesión no es válido. Queda agregado a las trampas de medición.

**Equivalencia exigida y verificada:**

- Avisos: `validate(records, net)` devuelve los mismos hallazgos que `validate(records)` (`deepEqual`).
- Conectividad: `buildNetlist(records, net)` devuelve el mismo netlist y `circuitFrom` el mismo circuito.
- Sin reconstrucciones: los tres consumidores con red compartida no incrementan `networkStats`.
- Un solo paso de deshacer: el commit sigue siendo único (prueba del controlador y traza).
- 917/917 pruebas.

### 2.f Reutilizar la red posterior de la poda

Cambio:

- `pruneDeadStubs` / `pruneOrphanJunctions` / `pruneEdits` devuelven `{ text, net }`. La red sólo es válida si el texto devuelto es el que se construyó.
- `moveSelection` publica esa red como **red confirmada** (`takeCommittedNetwork`) únicamente si coincide con el texto final.
- `App` la usa cuando el texto actual es exactamente ese; si la última poda cambió los registros, no hay red y se reconstruye. La red anterior al gesto nunca se usa como red final.

Reconstrucciones al soltar: **4 → 3** cuando la red es reutilizable.

A/B intercalado en producción (misma sesión, 2 corridas por lado, 5 muestras cada una):

| Lado | Muestras (ms) | Mediana | Redes |
|---|---|---|---|
| Antes | 1.932–2.068 | 1.984 | 4 |
| Después | 1.628–2.222 | 1.950 | 3 |

La mediana baja ~2 %, pero los rangos se solapan y una corrida "después" fue más lenta que las dos "antes". **La mejora de latencia no es consistente**: el ahorro de una reconstrucción queda por debajo del ruido entre corridas (±300 ms).

Caso negativo probado: mover el componente 21 a (−24, 12) elimina una unión 4001 en la poda final. En ese caso la red **no** se reutiliza (prueba dedicada con el registro eliminado verificado).

**Conclusión:** se cumple el criterio funcional (4→3 redes, mismo texto, avisos, conectividad y un solo paso de deshacer; 919/919 pruebas), pero no hay mejora de latencia demostrable. **No se suma más complejidad en esta línea**: el siguiente paso es medir los otros gestos con su propia línea base.

### 2.g Vértice, tramo y doblez: medición y delta del tramo

**Aclaración de gestos:** `startBend` no se usa fuera de los tests. La UI expone tres: mover un componente, arrastrar el cuerpo de un cable (**tramo**, que es el doblez visible) y arrastrar un vértice después de seleccionar el cable.

**Método:** misma hoja (9.577 registros), misma vista (zoom 2,755), 12 pasos de 4 px al mover y 6 pasos de 10 px perpendiculares en los gestos de cable; 5 corridas tras calentamiento. En cada corrida se verifica que el gesto modifique el dibujo, se cuentan las reconstrucciones completas y se mide el p95 entre callbacks de rAF y la latencia hasta el DOM confirmado.

| Gesto | p95 al mover | Redes en el gesto | Soltar (DOM) | Redes al soltar |
|---|---|---|---|---|
| mover | **50 ms** | 1 | 1.635–1.825 ms | 3 |
| tramo | **2.966 ms** | 49 | 3.392–3.636 ms | 6 |
| vértice | **2.633 ms** | 26 | 3.492–3.595 ms | 9 |

El peor gesto atribuible a la reconstrucción de red es **tramo**: 49 reconstrucciones por gesto y el p95 más alto.

**Defecto de medición encontrado (y corregido):** la hoja replicada repetía el número de cable de cada bloque, así que `wirePathsOf` agrupaba 228 tramos de bloques distintos en una sola polilínea. Con esa agrupación el gesto de tramo se anulaba (`normalizeOrthogonal` deshacía el movimiento) y la medición era inválida. El generador ahora renumera el cable por bloque (cada bloque es un circuito independiente) y el gesto modifica el cable.

**Delta del tramo (implementado):**

- `bendPreviewLegs` reproduce la geometría de `bendCable` (insertar vértice + moverlo) como cálculo puro, con la misma normalización de colineales que el commit.
- El lienzo intercepta los previews `segment` cuando el cable es de **un solo tramo** (`cableSegments(...).length === 1`): oculta el cable original y dibuja la polilínea del preview. Si el cable agrupa varios tramos, cae al preview por documento.
- El commit no cambia: `bendCable` se aplica una sola vez al soltar.

A/B con el mismo fixture y en la misma sesión:

| Lado | p95 al mover | Redes en el gesto | Soltar | Redes al soltar |
|---|---|---|---|---|
| Antes | 3.883,2 ms | 49 | 4.652–4.725 ms | 9 |
| Después | **50 ms** | **1** | 3.559–4.381 ms | 9 |

**Movimiento −98 % y 49 → 1 reconstrucción.** El soltar conserva 9 reconstrucciones en ambos lados: es el mismo camino de commit y la diferencia de latencia es ruido entre corridas.

**Equivalencia:** prueba dedicada que compara los tramos del preview con los que escribe el commit para 12 cables en dos direcciones. El texto, la conectividad y el deshacer no cambian porque el commit es el mismo. 920/920 pruebas.

**Límites de este incremento:** sólo el gesto de tramo y sólo cables de un tramo (número de cable propio). Cables con varios tramos agrupados y el gesto de vértice siguen con el preview por documento.

### 2.h Vértice: plan compartido entre preview y commit

**Implementación:** `planVertexMove(records, from, to)` calcula, sin escribir, qué tramo reemplaza a cada registro afectado y qué codos se agregan (incluye vértices compartidos por varios tramos, como una unión T). `moveVertex` usa **el mismo plan** para confirmar, así que preview y commit no pueden divergir. El lienzo intercepta los previews `vertex` y dibuja los tramos del plan ocultando los registros afectados.

**Guarda de seguridad:** si algún tramo ajeno se superpone en colineal con los del plan, el commit recorta distinto (comportamiento previo, verificado contra el código anterior) y el preview mentiría. En ese caso `isVertexPlanSafe` devuelve falso y el lienzo cae al preview por documento.

**A/B intercalado en producción** (misma hoja, misma vista, 6 pasos de 10 px, 5 corridas por lado; redes al iniciar el gesto y durante `pointermove` contadas aparte):

| Lado | p95 al mover | Redes al iniciar | Redes durante `pointermove` | Soltar | Redes al soltar |
|---|---|---|---|---|---|
| Antes | 1.666,6 / 1.683,3 ms | 1 | **25** | 2.245–2.439 ms | 6 |
| Después | **50 / 66,6 ms** | 1 | **0** | 2.290–2.849 ms | 6 |

- **Cero reconstrucciones completas durante `pointermove` en los planes seguros**; la única del gesto ocurre al iniciar (pointerdown), como se pedía contar. Con solapamiento colineal entra el fallback y la reconstrucción vuelve a ocurrir, así que el cero no es universal.
- p95 −97 %.
- **Soltar**: mismo camino de commit y las mismas 6 reconstrucciones. La diferencia de latencia (una corrida con 2.849 ms) está dentro de la varianza entre corridas documentada.
- Un solo paso de deshacer (mismo commit). `Escape` y `pointercancel` ya descartan el preview sin tocar el documento (pruebas del controlador) y el estado del preview es local del lienzo.

**Equivalencia:** prueba que verifica que los tramos del preview están cubiertos por la geometría que escribe el commit, incluyendo un vértice compartido por varios tramos; los hashes de las cuatro operaciones (`move`, `bend`, `segment`, `vertex`) son idénticos tras el refactor. 921/921 pruebas.

**Límites:** sólo el gesto de vértice. Los cables con varios tramos agrupados siguen usando el preview por documento para el doblez, y los planes con solapamiento colineal caen al documento.

### 2.i Cables agrupados: medición sin delta

**Fixture:** el generador expone `traceGroupedWireId`, el tramo interior de una **polilínea real de 3 tramos** del bloque central (número de cable único). En Node se verifica que arrastrar ese tramo cambia el texto (la polilínea se reescribe; `lenDelta` 0 pero texto distinto).

**Traza:** `PREVIEW_TRACE_GROUPED=1` usa ese cable. Sin delta: el lienzo cae al preview por documento porque el cable agrupa varios tramos.

| Corrida | p95 al mover | Redes al iniciar | Redes durante `pointermove` | Soltar | Redes al soltar |
|---|---|---|---|---|---|
| 1 | 1.249,9 ms | 1 | **12** | 2.031–2.156 ms | 3 |
| 2 | 866,7 ms | 1 | **12** | 1.481–1.525 ms | 3 |

**Conclusión:** la reconstrucción de red vuelve a dominar el movimiento (12 reconstrucciones por gesto, p95 0,87–1,25 s frente a 50 ms del cable de un tramo). **Vale la pena extender el delta a los agrupados, en un cambio separado.** No se implementó en esta revisión.

**Nota sobre el soltar:** el camino es distinto al del cable simple (3 reconstrucciones en vez de 6) y la latencia varía entre corridas. Con esta muestra no se confirma ni se descarta una regresión del soltar del vértice: queda pendiente medirlo con más repeticiones.

### 2.j Cables agrupados: delta del tramo interior

**Implementación:** `planSegmentPolyline(points, index, to)` reproduce `moveSegment` como cálculo puro: mueve el tramo interior y **normaliza la polilínea completa** con la misma función (`normalizeOrthogonal`) que el commit. `moveSegment` ahora consume ese plan; el preview dibuja los tramos resultantes y oculta todos los registros del cable. El tramo **extremo** de un cable agrupado sigue usando `bendCable` y el preview por documento.

**Prueba de equivalencia:** compara la geometría del **cable completo** después del commit (todos sus registros, no sólo el tramo agarrado) con los tramos del preview, para tres desplazamientos. La normalización puede tocar vecinos y la prueba lo exige.

**A/B intercalado en producción** (mismo fixture y sesión, 6 pasos de 10 px, 5 corridas por lado):

| Lado | p95 al mover | Redes al iniciar | Redes durante `pointermove` | Soltar | Redes al soltar |
|---|---|---|---|---|---|
| Antes | 916,7 / 933,3 ms | 1 | **12** | 1.508–1.605 ms | 3 |
| Después | **50 / 50 ms** | 1 | **0** | 1.549–1.650 ms (una corrida con dispersión) | 3 |

- **Cero reconstrucciones completas durante `pointermove`** en los casos cubiertos (tramo interior); la del inicio se cuenta aparte.
- p95 −95 %.
- **Soltar medido por separado**: mismas 3 reconstrucciones, latencia dentro del ruido entre corridas. No se mezcla con la muestra del vértice, que sigue pendiente.

**Límites:** sólo tramo interior de cables agrupados. El tramo extremo y los planes de vértice con solapamiento colineal conservan el fallback.

### 2.k Soltar del vértice: A/B cerrado

**Método:** se alternaron en la misma sesión los builds de `d972fa4` (commit inmediatamente anterior al delta de vértice) y `6dd8929` (delta), con la misma hoja, vértice, zoom y trayectoria. 5 muestras por corrida, 3 corridas por lado (15 muestras por lado). Métrica principal: `pointerup` → DOM confirmado.

**Criterio pre-fijado:** aumento relevante si la mediana del lado nuevo es ≥ 1,10 × la anterior **y** el mínimo del lado nuevo supera la mediana del anterior.

| Lado | Muestras (ms) | Mediana | Redes al soltar |
|---|---|---|---|
| Antes (`d972fa4`) | 2.258–3.518 | 3.403 | 6 |
| Después (`6dd8929`) | 2.371–3.635 | 3.530 | 6 |

**Resultado:** +3,7 % de mediana, rangos completamente solapados. Ambos lados muestran **dos estados de rendimiento** (~2,3–2,5 s y ~3,4–3,6 s) sin correlación con el build. **El criterio pre-fijado no se cumple: no hay aumento consistente.** No se perfila la confirmación porque no hay una diferencia que explicar.

**Confusor declarado:** el movimiento difiere entre builds (p95 2.633 ms antes vs 50 ms después), así que la carga de CPU previa al soltar no es la misma. Por eso se exigió una separación fuerte antes de hablar de regresión.

### 2.l Tramo extremo de un cable agrupado: medición sin delta

**Fixture:** `traceGroupedEndWireId` apunta al tramo extremo de la misma polilínea de 3 tramos. En Node se verifica que el gesto cambia el texto (`bendCable` inserta vértice y codo).

**Producción** (`PREVIEW_TRACE_END=1`; sin delta: cae al preview por documento):

| Corrida | p95 al mover | Redes al iniciar | Redes durante `pointermove` | Soltar | Redes al soltar |
|---|---|---|---|---|---|
| 1 | 4.016,5 ms | 1 | **51** | 5.154–5.475 ms | 10 |
| 2 | 3.983,2 ms | 1 | **51** | 5.168–5.381 ms | 10 |

Es el próximo bloqueo medido: 51 reconstrucciones por gesto, p95 ≈ 4 s y 10 redes al soltar. Extender el delta ahí sería un cambio separado; no se implementó.

### 2.m Tramo extremo agrupado: delta con la geometría de `bendCable`

**Implementación:** `planSplitBend` replica `bendCable` como cálculo puro: parte el registro en `at` y aplica el **mismo** `planVertexMove` que el commit, que también toca los tramos vecinos que pasan por el punto. `moveSegment` y el preview comparten la geometría. Si el plan se solapa en colineal con un tramo ajeno, se devuelve `unsafe` y se usa el fallback.

**Corrección adicional:** si un paso cae al fallback, el **gesto entero** sigue por documento (`gestureFallback`). Antes, mezclar preview local y documento dejaba el lienzo mostrando el preview como si fuera el estado confirmado: el gesto quedaba congelado tras el primer paso. Esto también protege el caso inseguro del vértice.

**Prueba:** ambos extremos de la polilínea, comparando la geometría de **todo el cable** (con cobertura por unión de colineales) y la de las **conexiones vecinas**.

**A/B en producción, dirección cubierta** (`PREVIEW_TRACE_DIR=-1`, 6 pasos de 10 px, 5 corridas por lado, 2 corridas):

| Lado | p95 al mover | Redes al iniciar | Redes durante `pointermove` | Soltar | Redes al soltar |
|---|---|---|---|---|---|
| Antes | 4.399,8 / 4.599,8 ms | 1 | **54** | 5.181–5.566 ms | 10 |
| Después | **50 / 50 ms** | 1 | **0** | 3.942–5.726 ms (dispersión) | 10 |

**Dirección con solapamiento** (`DIR=1`): 51 reconstrucciones repartidas en los seis pasos (`8,8,8,9,9,9`) y p95 3.083 ms. El fallback es consistente y no hay mejora, como corresponde.

- Cero reconstrucciones durante `pointermove` en la dirección cubierta; la del inicio se cuenta aparte.
- p95 −99 %.
- **Soltar medido aparte:** 10 reconstrucciones en ambos lados (mismo camino de commit); la latencia queda dentro del ruido.
- Un solo paso de deshacer y misma conectividad: el commit no se tocó.

**Límite:** la cobertura depende de la dirección del arrastre y de los vecinos: si el tramo móvil se solapa en colineal con otro, se conserva el fallback.

### 2.n Paneo a escala fija: medición y memoización

**Medición en producción** (botón central, misma hoja, zoom fijo, 5 corridas):

| Métrica | Valor |
|---|---|
| p95 del intervalo entre frames | 83,3–100 ms |
| Mutaciones del DOM en la escena | **0** |
| Mutaciones del grupo de cámara | 6 (una por paso) |
| LoAF (38 cuadros largos) | 3.830 ms: scripts 2.065, estilo/layout 98, resto (pintura/composición) ≈ 1.668 |

**Perfil en dev:** React domina el trabajo (`visitNode` 1.195 ms, `jsxDEVImpl` 576, `exports.jsxDEV` 449, `shapesBounds` 152, GC 375); estado y red en 0. **La escena se re-renderizaba aunque sólo cambiara la cámara**: el DOM no se toca porque las props no cambian, pero React vuelve a ejecutar símbolos y cables.

**Implementación:** `memo` en `Component` y `Wire` (hojas). Sus props son estables al panear (el zoom no cambia a escala fija), así que no se re-renderizan.

**A/B intercalado en producción** (5 corridas por traza, 2 trazas por lado):

| Lado | p95 | Mutaciones de escena |
|---|---|---|
| Antes | 83,3–100 ms | 0 |
| Después | **33,4–50 ms** | 0 |

Todas las muestras "después" quedan por debajo de todas las "antes": separación total, mediana ≈ 83 → 50 ms (−40 %).

**Perfil dev después:** React 1.972 → **368 ms** (−81 %); `jsxDEVImpl` 576 → 89; `shapesBounds` **desaparece** (los símbolos no se renderizan). Queda `visitNode` (~1.091 ms): es la **creación de elementos del padre**, que el memo de hojas no evita; una capa estable completa lo eliminaría.

**Criterio cumplido:** cero renders innecesarios de símbolos y cables al panear, y mejora del p95 en el A/B. La pintura/composición (~1,7 s del LoAF) sigue ahí y no la resuelve memoizar React.

**Nota de pruebas:** `canvas-hover.spec.ts` y dos de `editor-smoke.spec.ts` fallan también en HEAD sin el memo (pre-existentes). `settings-drawer` falló una vez y pasó en la corrida de HEAD (flaky).

### 2.o Capa de escena estable (cámara fuera del memo)

**Implementación:** la escena (rejilla, cajetín, símbolos, cables, uniones, previews, tiradores y marcas) se extrajo a `SceneLayer`, un componente `memo` cuyas props **no incluyen la cámara**. El grupo transformado del padre sólo cambia `translate/scale`; a escala fija, panear no ejecuta `SceneLayer` y por lo tanto no recorre `records` ni crea elementos.

**A/B intercalado en producción** (5 corridas por traza, 2 trazas por lado; "antes" = memo de hojas de la rev. 17):

| Lado | p95 por corrida (10 muestras) | Recorridos de escena |
|---|---|---|
| Antes | 33,4 · 49,9 · 33,4 · 33,4 · 33,4 · 33,4 · 33,4 · 33,4 · 33,4 · 33,4 | el padre recorre y crea elementos |
| Después | **33,3–33,4** (todas) | **0** |

**Lectura:** desaparece la cola de ~50 ms (una corrida con p95 49,9 pasa a 33,4), pero **el piso de 33,4 ms no baja**. No alcanza para declarar una mejora grande: es una mejora acotada de la cola.

**Perfil dev:** React 368 → **86 ms** tras la capa estable. `visitNode` (~1.128 ms) no es React (el bucket de React es chico y la función no tiene URL): es trabajo nativo, coherente con pintura/composición.

**Perfil de pintura directo (CDP `Tracing`):** 7,4 M eventos; `Paint` **70 ms**, `Layout` 40 ms, composición **no capturada** con las categorías usadas. La pintura medida no explica sola el piso de 33,4 ms por cuadro.

**Conclusión y criterio:** la capa estable cumple "cero recorridos de la escena al panear" y quita la cola, pero no hay una mejora grande y consistente del p95. Según lo acordado, **no se toca el renderer**: primero hay que medir composición con las categorías correctas. El índice de hit-test sigue esperando la medición de la consulta real.

**Verificación funcional:** selección, foco de borne (`cursorPin`) y estado de simulación son props de `SceneLayer`; cuando cambian, la capa se re-renderiza. Las pruebas e2e no agregan fallos nuevos (los 3 fallos son los pre-existentes de `canvas-hover` y `editor-smoke`). Unidad 923/923.

### 2.p Piso del paneo: qué cuesta realmente

**Método:** misma trayectoria (6 pasos de 10 px) y misma cadencia de entrada; se registra la frecuencia real de pantalla en reposo y se comparan hoja grande y hoja chica. Traza CDP (`devtools.timeline,cc,viz,blink,benchmark`) agregada **por nombre de evento**, sin hardcodear categorías.

| Caso | Registros | Zoom | p95 | Frecuencia en reposo |
|---|---|---|---|---|
| Hoja grande | 9.577 | 2,756 | **33,4 ms** | 16,7 ms (60 Hz) |
| Hoja chica | 211 | 2,567 | **16,7 ms** | 16,7 ms (60 Hz) |

**Lectura:** el entorno corre a 60 Hz. La hoja chica sostiene 60 fps; la grande pierde **un cuadro de cada dos**. Es costo real proporcional al contenido, no cadencia del benchmark.

**Ranking de la traza (hoja grande):** `Document::UpdateStyleAndLayout` ≈ **1.974 ms** agregados, `Blink.ForcedStyleAndLayout.UpdateTime` ≈ 1.194 ms, `LocalFrameView::UpdateStyleAndLayout` ≈ 519 ms; por debajo `ProxyMain::BeginMainFrame` 79 ms, `Paint` 77 ms y `RunPaintLifecyclePhase` 54 ms. **Domina style/layout, no pintura.**

**Advertencias:** los conteos de eventos están inflados por el overhead de tracing (7,4 M eventos): el ranking es indicativo, no un costo total. El zoom final difiere entre hojas (2,756 vs 2,567), así que la comparación es de orden de magnitud. `visitNode` sigue sin URL: **no** se atribuye a composición; el ranking apunta a style/layout. Los 77 ms de `Paint` no se toman como costo total del renderizado. Composición y presentación no quedan aisladas con estas categorías.

**Costo concreto a atacar (sin cambiar nada todavía):** el cambio de cámara invalida style/layout de la escena completa. Un candidato es mover la cámara con una transformación compuesta (CSS/`will-change`) en lugar del atributo `transform` del SVG, para que el cambio no recorra el árbol. Requiere su propio cambio y medición.

El índice de hit-test sigue fuera: necesita su propia medición de la consulta.

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

| Origen | Antes | Ahora | Evidencia |
|---|---|---|---|
| `pruneDeadStubs` (red anterior) | 1 | 1, compartida con la otra poda | `state.ts` `pruneEdits` |
| `pruneDeadStubs` (red posterior) | 1 | 1 | `state.ts` |
| `pruneOrphanJunctions` (red anterior) | 1 | 0, usa la compartida | `state.ts` |
| `pruneOrphanJunctions` (red posterior) | 1 | 0 si el texto no cambió; 1 si cambió | `state.ts` |
| `Canvas` sobre registros provisionales | 1 | 1 | `Canvas.tsx:321` |
| `validate` | 1 | 1 | `network.ts:224` |
| `buildNetlist` → `circuitFrom` | 1 | 1 | `netlist.ts:179` |

Total por confirmación: 7 → 5 (y 6 si la primera poda elimina un tramo). Por movimiento: 5 → 3.

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

1. **Etapa 0 — hecha.** Benchmark de estado (`pnpm bench`), traza en dev y **línea base de producción** (`app/bench/baselines/preview-prod.json`).
2. **Etapa 1 — primer incremento hecho** (ver 2.b). Quedan pendientes los consumidores que todavía reconstruyen red por dentro (`validate`, `buildNetlist`) y el lienzo, que la reconstruye en cada preview.
3. **Etapa 2 — preview por delta: hecho para mover** (ver 2.d). Siguiente: extender el mismo delta a vértice, tramo y doblez, cada gesto con su propia línea base.
4. **Etapa 3 — confirmación: dos incrementos hechos** (ver 2.e y 2.f). La red final compartida bajó el soltar 26 %; reutilizar la red de la poda llevó las reconstrucciones a 3 pero **sin mejora de latencia consistente**. Se detiene acá: no se justifica más complejidad en confirmación.
5. **Etapa 4 — gestos de cable: deltas hechos.** Tramo, vértice y tramo interior de cables agrupados ya no reconstruyen red durante `pointermove`. Queda el tramo **extremo** de un cable agrupado, que sigue en `bendCable` con preview por documento.
6. **Soltar del vértice: cerrado sin regresión demostrada.** A/B alternado de 15 muestras por lado: mediana +3,7 %, rangos solapados; el criterio pre-fijado no se cumple (ver 2.k). Queda documentado, sin perfilar.
7. **Tramo extremo agrupado: delta hecho en la dirección cubierta** (ver 2.m). Queda el fallback para direcciones con solapamiento colineal, y también corrige el gesto congelado tras un fallback.
8. **Paneo: medido, memoizado y con capa estable** (ver 2.n y 2.o). La escena ya no se recorre al panear y la cola de 50 ms desapareció; el piso de 33,4 ms no es React.
9. **Piso del paneo explicado** (ver 2.p): 60 Hz reales; la hoja chica va a 16,7 ms y la grande a 33,4 ms; la traza apunta a style/layout, no a pintura. Candidato: cámara con transformación compuesta, como cambio separado.
10. **Etapa 6 — índice de consulta de hit-test**, solo cuando exista medición de la consulta real por evento.

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
7. **Mirar sólo tiempo propio**: `validate` y `circuitFrom` parecían baratos (135 y 129 ms) porque delegan en `buildNetwork`/`attachPoints`; en inclusivo cuestan 829 y 1.129 ms. Todo consumidor del mismo primitivo se mide inclusivo.
8. **Usar el `transform` del componente como señal de commit**: ya muestra el preview durante el arrastre. La señal correcta es que el gesto entre al historial («Deshacer» habilitado).
9. **Elegir un componente fuera de pantalla o sin cables**: tras ajustar la hoja, el primer bloque puede quedar fuera de la vista. El generador expone un `traceId` de un bloque central y verifica por red que está conectado.
10. **Comparar corridas de sesiones distintas**: el mismo build midió 2,45 s y 3,42 s al soltar (hasta 40 % de diferencia). Para decisiones, correr antes y después **intercalados** en la misma sesión.

## 10. Reproducibilidad

```bash
# Benchmark del editor
pnpm bench
pnpm bench --sizes=1000 --runs=3
pnpm bench -- --json

# Traza en navegador (≈6 min; hoja de 9.787 registros, 5 repeticiones)
cd app && PREVIEW_TRACE=1 pnpm trace
# Variantes: PREVIEW_TRACE_RECORDS, PREVIEW_TRACE_RUNS, PREVIEW_TRACE_STEPS, PREVIEW_TRACE_OUT

# Traza contra producción (línea base versionada)
cd app && pnpm build && pnpm preview --host 127.0.0.1 --port 4173 --strictPort
PREVIEW_TRACE=1 PREVIEW_TRACE_URL=http://127.0.0.1:4173 PREVIEW_TRACE_PROFILE=0 \
  PREVIEW_TRACE_OUT=bench/baselines/preview-prod.json pnpm trace

# Suite completa confiable (serie)
cd app && node --test --test-concurrency=1

# Gates de performance aislados
cd app && node --test test/wiring-performance.test.ts test/parse-perf.test.ts
```

## Historial de correcciones

- **Revisión 19 (2026-11-26).** Explicación del piso del paneo:
  - Frecuencia real 60 Hz (idle 16,7 ms). Hoja chica (211 registros) 16,7 ms; grande (9.577) 33,4 ms → cuadros perdidos reales, proporcionales al contenido.
  - Traza por nombre de evento: style/layout domina (~1,97 s agregados), `Paint` 77 ms. Conteos inflados por overhead de tracing; ranking indicativo.
  - `visitNode` no se atribuye a composición; el ranking apunta a layout. Candidato: cámara con transformación compuesta. Baseline en `preview-prod-pan-floor.json`.
- **Revisión 18 (2026-11-26).** Capa de escena estable:
  - `SceneLayer` memoizado sin la cámara: panear no recorre `records` ni crea elementos.
  - A/B: la cola de ~50 ms desaparece (p95 por corrida 49,9 → 33,4), pero el piso de 33,4 ms no baja.
  - Dev: React 368 → 86 ms; `visitNode` (~1.128 ms) no es React.
  - Pintura CDP: `Paint` 70 ms, `Layout` 40 ms; composición no capturada. No se toca el renderer todavía.
  - Baseline en `preview-prod-scene-layer.json`.
- **Revisión 17 (2026-11-26).** Paneo medido y memoizado:
  - Producción: p95 83,3–100 ms; 0 mutaciones de escena y 6 de cámara; LoAF 2.065 ms de scripts, 98 de estilo/layout y ≈1.668 de pintura/composición.
  - Dev: React dominaba (1.972 ms; `visitNode`, `jsxDEV`, `shapesBounds`); con `memo` en `Component`/`Wire` baja a 368 ms (−81 %) y `shapesBounds` desaparece.
  - A/B intercalado: 83,3–100 → 33,4–50 ms, con separación total.
  - Queda la creación de elementos del padre y la pintura/composición. Baseline en `preview-prod-pan.json`.
- **Revisión 16 (2026-11-26).** Delta del tramo extremo agrupado:
  - `planSplitBend` (split + `planVertexMove` compartido) y preview del cable completo con vecinos; fallback si hay solapamiento colineal.
  - `gestureFallback`: si un paso cae al documento, el gesto entero sigue por documento (corrige el gesto congelado).
  - A/B dirección cubierta: p95 4.500 → 50 ms; 54 → 0 redes durante `pointermove`. Dirección con solapamiento: 51 redes, sin mejora (fallback correcto).
  - Soltar medido aparte: 10 redes en ambos lados. 923/923. Baseline en `preview-prod-grouped-end-delta.json`.
- **Revisión 15 (2026-11-26).** Cierre del soltar del vértice y medición del extremo agrupado:
  - A/B alternado `d972fa4` vs `6dd8929`, 15 muestras por lado: medianas 3.403 vs 3.530 ms (+3,7 %), rangos solapados, dos estados de rendimiento en ambos lados. Criterio pre-fijado no cumplido → sin regresión consistente; no se perfila.
  - Tramo extremo agrupado sin delta: 51 reconstrucciones por gesto, p95 ≈ 4 s, 10 redes al soltar. Próximo candidato.
  - Baselines: `preview-prod-vertex-release-ab.json`, `preview-prod-grouped-end.json`.
- **Revisión 14 (2026-11-26).** Delta de cables agrupados (tramo interior):
  - `planSegmentPolyline` compartido por preview y commit, con normalización de la polilínea completa; `moveSegment` refactorizado sobre el plan.
  - A/B intercalado: p95 933 → 50 ms; 12 → 0 redes durante `pointermove`; soltar con las mismas 3 redes.
  - Prueba de equivalencia sobre el cable completo; 922/922. Baseline en `app/bench/baselines/preview-prod-grouped-delta.json`.
  - Límite: tramo extremo de cables agrupados sigue con `bendCable` y preview por documento.
- **Revisión 13 (2026-11-26).** Medición de cables agrupados, sin delta:
  - Fixture con polilínea real de 3 tramos (`traceGroupedWireId`) y verificación en Node de que el arrastre cambia la geometría.
  - Producción: 12 reconstrucciones por gesto, p95 866,7–1.249,9 ms, 1 al iniciar y 3 al soltar.
  - La red domina otra vez: el delta de agrupados queda justificado como cambio separado. El soltar del vértice queda como medición pendiente con más muestras.
- **Revisión 12 (2026-11-26).** Delta del vértice:
  - `planVertexMove` compartido por preview y commit (incluye uniones T); `moveVertex` refactorizado sobre el plan.
  - Guarda `isVertexPlanSafe`: si hay solapamiento colineal con tramos ajenos, el preview cae al documento (el commit recorta distinto, comportamiento previo).
  - A/B intercalado: p95 1.666 → 50–67 ms; 25 → 0 redes durante `pointermove`, 1 al iniciar; soltar con las mismas 6 redes.
  - Equivalencia preview/commit con cobertura de tramos; hashes idénticos; 921/921. Baseline en `app/bench/baselines/preview-prod-vertex.json`.
- **Revisión 11 (2026-11-26).** Gestos de cable y delta del tramo:
  - Medición en producción de mover (50 ms, 1 red), tramo (2.966 ms, 49 redes) y vértice (2.633 ms, 26 redes), con verificación de que cada gesto modifica el dibujo.
  - `startBend` no se usa fuera de tests: el doblez de la UI es el arrastre del cuerpo del cable (gesto tramo).
  - Se corrige un defecto del fixture: los números de cable repetidos agrupaban 228 tramos por polilínea y anulaban el gesto de tramo.
  - Delta del tramo: preview geométrico puro (`bendPreviewLegs`) para cables de un tramo; movimiento 3.883 → 50 ms y 49 → 1 red; soltar sin cambios estructurales. 920/920.
- **Revisión 10 (2026-11-26).** Reutilización de la red de la poda:
  - Las podas devuelven `{ text, net }`; `moveSelection` publica la red final sólo si el texto coincide; `App` la usa si el texto actual es ese.
  - Reconstrucciones 4 → 3 con red reutilizable. Caso negativo probado (unión huérfana eliminada: sin reutilización).
  - A/B intercalado: medianas 1.984 vs 1.950 ms, rangos solapados → **sin mejora consistente**. Se detiene esta línea.
  - 919/919 pruebas. Baseline en `app/bench/baselines/preview-prod-reuse.json`.
- **Revisión 9 (2026-11-26).** Red final compartida en la confirmación:
  - `validate` y `buildNetlist` aceptan la red construida; `circuitFrom` la propaga; `App` pasa la suya. Las redes intermedias de `applyDrag` quedan fuera a propósito.
  - Reconstrucciones por soltar 6 → 4; Node 2.684 → 2.020 ms; A/B intercalado en producción 3,34–3,61 s → 2,45–2,61 s.
  - Equivalencia de avisos, netlist y circuito verificada por pruebas; 917/917.
  - Se documenta la varianza entre sesiones (hasta 40 %) y la regla de medir intercalado. Baseline en `app/bench/baselines/preview-prod-confirm.json`.
- **Revisión 8 (2026-11-26).** Preview por delta para mover:
  - `moveDelta` compartido por preview y commit; el lienzo no toca App durante `pointermove`.
  - Cero redes en el gesto (`red` 1,8 ms en el perfil dev), cero historial y cero escrituras.
  - Producción: p95 1.266,6 → 50,0 ms; soltar 2.446,7–2.528,8 ms sin regresión. Baseline posterior en `app/bench/baselines/preview-prod-delta.json`.
  - Pruebas: equivalencia delta/commit con cuatro desplazamientos, pureza del delta, cancelación de mover y unicidad de commit. 915/915.
- **Revisión 7 (2026-11-26).** Línea base de producción y corrección del perfil:
  - Producción: p95 al mover 1.266,6 ms y soltar 2.481–2.638 ms (dev: 2.833 ms y 5,4–5,8 s). Los números de producción quedan versionados en `app/bench/baselines/preview-prod.json`.
  - Se agrega tiempo inclusivo al perfil. Corrige la rev. 6: `validate` (829 ms inclusivo) y `circuitFrom` (1.129 ms inclusivo) **sí** son consumidores relevantes; su tiempo propio era bajo porque delegan en `buildNetwork`/`attachPoints`.
  - La traza acepta `PREVIEW_TRACE_URL` y `PREVIEW_TRACE_PROFILE=0`; el perfil sólo tiene sentido en dev (producción minifica).
  - Se fija el criterio de aceptación del delta (2.c) y se separa explícitamente la optimización de la confirmación.
- **Revisión 6 (2026-11-25).** Traza en navegador y decisión:
  - `app/e2e/preview-trace.spec.ts` mide mover (pointerdown→antes de pointerup) y soltar (pointerup→DOM confirmado) sobre 9.577 registros cableados, con zoom, viewport y trayectoria fijos y 5 repeticiones.
  - Resultado: p95 entre frames al mover 2.833 ms; DOM confirmado al soltar 5,4-5,8 s.
  - Atribución: red 72 % al mover y 69 % al soltar; React 13 % y 6 %; `validate` y `circuitFrom` por debajo del 6 %.
  - Decisión: preview por delta para el movimiento; confirmación con red compartida como trabajo aparte.
  - Límites declarados: latencia a DOM (no presentación), build de desarrollo, p95 entre callbacks de rAF.
- **Revisión 5 (2026-11-25).** Aplica la etapa 1 acordada con su verificación:
  - `pruneEdits` comparte la red anterior entre las dos podas y reutiliza la posterior solo si el texto no cambió; si la primera poda eliminó un tramo, se reconstruye.
  - Reconstrucciones por evento: 5 → 3 al mover y 7 → 5 al soltar. Tiempos a 9.787 registros: 2.766 → 1.958 ms al mover y 3.715 → 2.729 ms al soltar.
  - Equivalencia: hashes del texto, uniones, derivaciones, `past.length` y `dirty` idénticos en `move`, `bend`, `segment` y `vertex`; suite completa 911/911.
  - Se agrega `networkStats` en `network.ts` para que el benchmark cuente reconstrucciones.
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
