# Auditoría de las 4D en cadeMixo

**Fecha:** 25 de noviembre de 2026  
**Ámbito:** aplicación cadeMixo y sus pruebas  
**Referencia Git observada:** `ff29572` (`main...origin/main`)

## Conclusión ejecutiva

No encontré evidencia suficiente para concluir que la aplicación sufra una proliferación de duplicaciones funcionales ni una pérdida de autonomía atribuible al uso de IA. Sí aparecen dos temas concretos que conviene atender: la concentración de responsabilidades en módulos centrales y el coste potencial de recalcular bornes durante el arrastre de componentes. El impacto de rendimiento aún necesita medirse en diagramas representativos.

La verificación también mostró bloqueos que deben separarse de los hallazgos de producto: los E2E abortaron al arrancar Chrome; una corrida de TypeScript falló por un módulo que no estaba presente en ese momento; y el build predeterminado no pudo limpiar `app/dist`. El build Vite con salida temporal sí terminó correctamente.

> **Contexto importante:** el árbol de trabajo estaba sucio durante la investigación. Se observaron cinco eliminaciones staged, cambios tracked sin stage y archivos nuevos sin trackear. Por eso, estos resultados describen el árbol local inspeccionado y no deben atribuirse automáticamente a `ff29572` ni tratarse como estado limpio de `main`.

## Resumen por dimensión

| Dimensión | Evaluación | Evidencia principal | Prioridad |
|---|---|---|---|
| **Duplicación** | No se confirmó una duplicación funcional con beneficio claro de consolidación. | Las implementaciones de `UnionFind` en `app/src/sim/netlist.ts`, `faults.ts` y `direction.ts` trabajan con claves y propósitos diferentes. | Baja; no refactorizar por similitud superficial. |
| **Diluvio** | No se confirmó generación masiva de código difícil de revisar. Hay concentración de responsabilidades que eleva el coste de revisión. | `App.tsx` (2204 líneas), `Canvas.tsx` (1190) y `editor/state.ts` (1333) en el árbol inspeccionado. | Media; extraer solo límites funcionales concretos, precedidos por pruebas. |
| **Deuda técnica** | Riesgo potencial de latencia en el movimiento de componentes; no se ha demostrado impacto perceptible. | `moveSelection` invoca `attachPoints` por movimiento; `attachPoints` revisa las cajas para cada extremo de cable. | Media; medir antes de optimizar. |
| **Dependencia** | No hay evidencia de dependencia de IA en tiempo de ejecución ni de pérdida de autonomía por sí sola. | El manifiesto revisado no mostraba SDK de IA; el proyecto documenta invariantes y tiene pruebas de formato y geometría. | Baja; mantener trazabilidad técnica y tests como protección. |

## Hallazgos detallados

### 1. Duplicación: no consolidar todavía

Se identificaron tres clases `UnionFind` en módulos de simulación. Aunque comparten el concepto, el netlist usa claves string (`netlist.ts`), mientras que detección de fallas y sentido de giro trabajan sobre identificadores numéricos y escenarios distintos. No se observó divergencia que haya causado un bug ni evidencia de que una abstracción compartida reduzca el coste de cambio.

También se compararon serializers y scripts de generación de circuitos de ejemplo. El solapamiento observado parece intencional por sus límites de representación y no equivale a duplicar una función de producto.

**Decisión recomendada:** no unificar las clases ni los serializers hasta que aparezca una regla funcional repetida que esté derivando de forma distinta o una modificación que obligue sistemáticamente a cambiar varios sitios.

### 2. Diluvio: concentración no equivale a código generado en exceso

Los módulos `App.tsx`, `Canvas.tsx` y `editor/state.ts` concentran flujos importantes. `App.tsx` combina estado del editor con operaciones de archivo y coordinación de simulación; `Canvas.tsx` contiene renderizado e interacción. Eso hace que cambios amplios sean más difíciles de revisar, pero el número de líneas por sí solo no demuestra que el diseño sea incorrecto ni que el código venga de generación masiva.

**Decisión recomendada:** no dividir estos archivos por tamaño. Si se extraen responsabilidades, hacerlo por flujos cohesivos, con una prueba de comportamiento previa y un diff pequeño.

### 3. Deuda técnica: coste potencial en arrastre

En `app/src/editor/state.ts:292-300`, `moveSelection` recalcula `attachPoints(project.records)` cada vez que se mueve una selección. En `app/src/editor/pins.ts:78-104`, la función recoge cables y cajas y, para cada extremo de cable, filtra las cajas que lo contienen. El trabajo crece aproximadamente con **extremos de cable × cajas de componentes**; su coste perceptible en esquemas grandes todavía no está medido.

La asignación a **todas** las cajas coincidentes es intencional: conserva conexiones entre componentes apilados. El comentario que describía una asignación a “la más cercana” se corrigió durante la investigación; los tests enfocados de bornes y anclajes pasaron **48/48** después de esa corrección.

La suite completa tuvo una primera corrida con un fallo temporal en `wiring-performance.test.ts` (**344,7 ms** frente al límite de **300 ms**) y luego pasó **870/870**. Esto sugiere sensibilidad del umbral a la carga del entorno, no prueba por sí solo una regresión.

**Decisión recomendada:** instrumentar un movimiento sobre un fixture sintético grande y comparar latencia antes de optimizar. Si se optimiza, preservar explícitamente la asignación a todas las cajas coincidentes y probar cajas apiladas o superpuestas.

### 4. Dependencia: autonomía apoyada por conocimiento verificable

No es posible inferir si una persona dependió demasiado de IA solo por el estilo o el tamaño del código. En los módulos revisados no se encontró una integración de IA en runtime. Sí se observaron prácticas que ayudan a mantener comprensión humana: comentarios que explican supuestos empíricos, round-trip del formato como invariante y pruebas para síntesis de componentes y bornes.

Queda como oportunidad de baja prioridad hacer más uniforme la procedencia de geometrías dibujadas manualmente en `app/src/symbols/library.ts`, cuando exista una muestra o calibración que sirva de referencia. No se confirmó que esa información falte en toda la documentación del proyecto.

## Verificación ejecutada y límites

| Comprobación | Resultado observado | Interpretación |
|---|---|---|
| `pnpm test` | Una corrida falló por el umbral de rendimiento; al repetirla, 870/870 pasaron. | Suite unitaria aprobada en la repetición; revisar la estabilidad del benchmark. |
| Tests de bornes y anclajes | 48/48 pasaron tras actualizar el comentario de `pins.ts`. | Cambio documental sin cambio de comportamiento. |
| `pnpm test:e2e` | 37 pruebas fallaron al iniciar Chrome, antes de ejecutar sus aserciones. | `app/playwright.config.ts` selecciona `channel: 'chrome'`; el navegador abortó con `SIGABRT`. No se obtuvo causa raíz del aborto. |
| `tsc --noEmit` | Falló durante una corrida porque `app/test/title-block-layout.test.ts` importaba `app/src/model/title-block-layout.ts`, que no estaba presente entonces. | En una inspección posterior el módulo apareció como archivo nuevo sin trackear. No se repitió TypeScript después de que apareció; el resultado actual queda pendiente. |
| Build Vite con salida temporal | `vite build --outDir /private/tmp/cademixo-dist-verify` completó y transformó 2388 módulos. | La compilación Vite funciona con una ruta de salida escribible. |
| Build predeterminado | Falló con `EPERM` al limpiar `app/dist/assets`. | El build normal no queda validado hasta resolver el bloqueo de escritura o salida. |

El problema de Git observado no era el repositorio: `xcode-select -p` apuntaba a Command Line Tools incompleto. Los comandos Git funcionaron al establecer `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` solo para esa ejecución. El árbol tenía cambios staged, unstaged y untracked; no se descartó ni revirtió ninguno.

## Orden recomendado para continuar

1. **Restablecer una línea base reproducible:** repetir `tsc --noEmit` ahora que el módulo de layout existe; resolver el arranque de Chrome comparando con Chromium administrado por Playwright; determinar por qué `app/dist` no permite limpieza. No atribuir fallos pre-test a la lógica de la aplicación.
2. **Medir arrastre en un diagrama grande:** añadir benchmark y prueba de equivalencia para cajas apiladas antes de tocar `attachPoints` o `moveSelection`.
3. **Refactorizar solo con evidencia:** extraer un flujo cohesivo de `App.tsx` o `Canvas.tsx` únicamente cuando una prueba/escenario muestre que el límite actual dificulta una modificación concreta.
4. **Mantener sin consolidar las duplicaciones candidatas:** reconsiderar `UnionFind` o serializers solo cuando haya deriva de comportamiento o repetición de cambios demostrable.

## Qué no concluye esta auditoría

- No es una revisión exhaustiva de seguridad ni una auditoría de todas las dependencias.
- No demuestra que la aplicación tenga problemas de rendimiento en uso normal; identifica un coste algorítmico candidato a medir.
- No atribuye la autoría de código a IA ni juzga el proceso de desarrollo sin evidencia verificable.
- Los resultados de tests describen las corridas registradas y el árbol local observado, no garantizan el estado posterior a nuevos cambios.
