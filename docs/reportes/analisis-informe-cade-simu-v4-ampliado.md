# Análisis ampliado del informe de CADe_SIMU V4

Este análisis relaciona los temas del informe externo sobre CADe_SIMU V4 con las defensas visibles en cadeMixo y propone una secuencia de verificación. **Los problemas descritos en el informe externo no se consideran defectos confirmados de la app:** no se reprodujeron aquí contra ella.

## Evaluación del informe externo

El informe aporta una lista útil de riesgos para una aplicación de esquemas eléctricos: integridad y persistencia de archivos, conectividad y falsos cortos, comportamiento y complejidad de simulación, correspondencia entre símbolo y modelo, impresión y páginas, compatibilidad entre versiones y disciplina de pruebas. Su valor para este proyecto es orientar casos de prueba y preguntas de compatibilidad, no demostrar que la app presente los mismos fallos.

La revisión de este documento fue acotada y de solo lectura. No se reprodujeron los incidentes del informe en cadeMixo, no se inspeccionó exhaustivamente cada flujo de interfaz ni el proceso completo de impresión y no se ejecutó la suite. Las referencias al código describen protecciones observadas; no garantizan por sí mismas el comportamiento integral.

## Comparación con la app

| Tema | Protección observada | Brecha o supuesto por verificar |
|---|---|---|
| Archivo y persistencia | `app/src/model/project.ts:351–354` conserva prefijo y orden de registros al serializar. `app/src/ui/settings.ts:81–110` tolera ajustes inválidos. | El texto crudo preservado no demuestra que abrir/guardar detecte corrupción, pérdida de datos o permita recuperar versiones. Revisar el flujo completo de guardado y sus errores. |
| Conectividad y falsos cortos | `app/src/editor/wiring/geometry.ts:144–165` diferencia cruces de contactos. `app/src/sim/faults.ts` representa fallos, redes y elementos responsables; `app/test/fault-avisos.test.ts` cubre avisos eléctricos. | Verificar en conjunto geometría y solver con cruces sin unión, derivaciones en T, tolerancias y redes entre hojas. El informe externo no confirma defectos en esta implementación. |
| Simulación y complejidad | `app/src/ui/App.tsx:322–331` administra el reloj; `:333–345` cancela pulsos al detener o desmontar. | Ampliar pruebas de secuencias temporales, parada/reinicio y proyectos grandes. Esta revisión no midió rendimiento. |
| Símbolo y modelo eléctrico | `app/src/model/project.ts:258–304` deriva bornes y transformación del registro CADe; excluye el color de lámpara de los pines (`:290–294`). | Probar por código que catálogo, bornes visibles y modelo de simulación coincidan, incluidos registros desconocidos o incompletos. |
| Páginas e impresión | `buildProject` asigna registros a hojas y conserva los posteriores al bloque de título (`app/src/model/project.ts:307–348`). `app/src/model/title-block.ts:193–234` interpreta formato y opciones de página. | La evidencia cubre modelo y configuración, no la salida impresa completa. Falta validar exportación/impresión multipágina y límites de página de extremo a extremo. |
| Versiones y pruebas | Existen pruebas focalizadas, entre ellas `app/test/project.test.ts`, `app/test/pins.test.ts` y `app/test/fault-avisos.test.ts`; hay fixtures `.cad`. | No se comprobó una matriz formal de compatibilidad por versión de CADe_SIMU ni la suite completa. La compatibilidad debe tratarse como alcance por confirmar, no como garantía. |

## Hoja de ruta por fases

1. **Caracterizar formatos y round-trip.** Reunir fixtures `.cad` reales etiquetados por versión y función; probar parsear → serializar → volver a parsear, verificando registros intactos y reportando entradas malformadas sin pérdida silenciosa.
2. **Blindar conectividad y solver.** Añadir casos parametrizados de cruces X/T/extremos, tolerancias, uniones y hojas. Afirmar tanto la red esperada como los fallos que no deben detectarse.
3. **Proteger apertura, guardado y recuperación.** Trazar el flujo UI antes de cambiarlo; comprobar confirmación ante cambios sin guardar, errores visibles y recuperación/autosnapshot si corresponde al diseño. Cubrir cancelación, escritura fallida y reapertura.
4. **Alinear catálogo, simulación e impresión.** Establecer invariantes borne↔símbolo↔modelo por código; añadir escenarios E2E de temporizadores y protecciones, más exportación/impresión multipágina. Medir rendimiento solo con un tamaño de proyecto representativo definido.

## Puertas de validación

- Cada fase debe incorporar pruebas de regresión reproducibles y fixtures identificados por origen/versión; no convertir una observación del informe externo en requisito confirmado sin reproducción o evidencia propia.
- Para conectividad, validar redes y diagnósticos negativos además del dibujo; para persistencia, comparar el documento reabierto y sus registros con el original esperado.
- Para temporización, cubrir ejecución, parada, reinicio y limpieza de timers; para impresión, verificar número de páginas, contenido y configuración seleccionada.
- Antes de declarar compatibilidad, documentar versiones y escenarios efectivamente probados. Ejecutar los comandos de test/build definidos por el proyecto al implementar cada fase; esta revisión no los ejecutó.
- Cualquier fallo nuevo debe quedar asociado a fixture, pasos de reproducción y resultado esperado/observado para distinguir defecto del producto de incompatibilidad del archivo de origen.

## No objetivos

- No afirmar que la app reproduce los errores enumerados para CADe_SIMU V4.
- No cambiar el formato `.cad` ni prometer compatibilidad universal con versiones no verificadas.
- No rediseñar el solver, el guardado o la impresión sin caracterización y pruebas previas.
- No fijar objetivos de rendimiento sin medición sobre proyectos representativos.

## Siguiente paso

Empezar por inventariar los fixtures y el flujo de importación/guardado; con esa evidencia se puede precisar el alcance de las fases 1 y 3 antes de implementar protecciones.
