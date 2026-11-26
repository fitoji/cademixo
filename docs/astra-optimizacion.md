# Plan de optimización del editor de circuitos

**Objetivo:** que el costo de mover el puntero dependa principalmente de los elementos afectados por el gesto, no del tamaño total de la hoja. Mantener SVG, el formato de archivo y las reglas eléctricas. Este plan parte de una auditoría estática: no hay todavía una medición de FPS ni evidencia de que el simulador sea el cuello de botella.

## Dónde empezar

| Hallazgo comprobado | Consecuencia que se debe medir |
|---|---|
| En `app/src/ui/App.tsx:864–875`, cada preview ejecuta `projectOf(applyDrag(state, preview))` y recorta los registros de la hoja con `slice`. En `app/src/ui/Canvas.tsx:320–375`, la identidad de esos registros determina la vigencia de bornes, red, contextos de snap/hit-test y rutas redondeadas. | Un desplazamiento provisional invalida datos de toda la hoja. Distinguir la red visual de la hoja de la red del proyecto usada por App: no son intercambiables. |
| En `Canvas.tsx:677–698` el puntero actualiza el objetivo magnético y el gesto. En `Canvas.tsx:811–848` el render recorre registros y nodos para representar cables, componentes y uniones. | Dibujar un cable o desplazar la cámara puede repetir trabajo de React sobre geometría inmóvil. No confundir un render de React con una mutación del DOM o un repintado. |
| En `Canvas.tsx:763` se filtran cables seleccionados; en la capa de uniones se materializan y filtran todos los nodos. | Hay recorridos y asignaciones independientes del cursor que hoy se hacen durante el render. |

## Orden de implementación

### 1. Crear una línea base reproducible antes de cambiar el editor

- Crear fixtures sintéticos con semilla fija de 1.000, 5.000 y 10.000 **registros por hoja**, no componentes. Incluir cadenas dispersas, regiones densas con derivaciones T y al menos un proyecto de dos hojas. Verificar que las conexiones esperadas sean válidas; guardar semilla, distribución y cantidad de registros visibles.
- Automatizar por separado: paneo, trazado sobre bornes y cruces, arrastre de símbolo conectado, movimiento de vértice/doblez y conmutación en simulación. Reproducir la misma trayectoria, escala, viewport y estado inicial. Comparar extremos redondeados activados y desactivados.
- En build de producción, tomar una pasada de calentamiento y cinco medidas por escenario. Registrar SHA, navegador, equipo, frecuencia de pantalla, p50/p95 de intervalo entre cuadros y cuadros perdidos. Medir desde entrada hasta presentación con traza del navegador cuando esté disponible; un callback de animación no prueba que el cuadro se haya presentado.
- En una pasada diagnóstica separada, contar ejecuciones y tiempo de `applyDrag`, `buildNetwork` por sitio de llamada, generación de rutas, snap y renders de Wire/Component. Guardar trazas y tabla antes/después. Si el navegador no arranca, reportar el bloqueo: los contadores unitarios no sustituyen una traza.

### 2. Separar escena estable y capas transitorias

- Extraer en Canvas una capa SVG de registros con props estables y memoización. Mantener el orden visual actual. Dejar cámara en el grupo transformado y cursor, marcador y ruta provisional en capas que puedan actualizarse sin recorrer todos los registros. El zoom puede invalidar elementos cuya apariencia dependa de la escala; el paneo no debería hacerlo.
- Derivar las uniones visibles por identidad de red y los cables seleccionados por registros y selección. Mantener fuera de la capa estática las dependencias de hover. Conservar cambios reales de selección, foco de borne y estado eléctrico: no ocultarlos con un comparador que ignore props.
- **Salida:** en paneo a escala fija y movimiento de la punta sin editar, cero reconstrucciones de red y cero renders de símbolos/cables estáticos después del montaje. Verificar orden de selección cuando un cable pasa detrás de un símbolo.

### 3. Eliminar la reconstrucción del documento durante el arrastre

- Antes de sustituir el preview, escribir pruebas de caracterización para cada variante de DragOp. Conservar el resultado actual de aplicar la operación completa como referencia para la geometría y el commit.
- Al iniciar el gesto, capturar hoja, geometría inicial, selección y relaciones afectadas. Derivar desde esa base el delta provisional por ID: símbolos desplazados, bornes, tramos incidentes y uniones que cambian. No aplicar desplazamientos acumulativos sobre la preview anterior. Reutilizar las reglas geométricas existentes; si están acopladas a la escritura del documento, extraer su cálculo puro y compartirlo con el commit.
- Durante el movimiento, dibujar los reemplazos sin dejar duplicados seleccionables ni alterar el orden de superposición. Para snap/hit-test combinar geometría estable y delta, excluyendo posiciones antiguas y objetivos propios según las reglas actuales. Incluir las rutas vecinas cuyo redondeo dependa de una unión afectada.
- Al soltar, usar la posición final y la operación canónica **una sola vez**; invalidar entonces los derivados de la hoja. Al cancelar, descartar el delta sin escribir historial. Descartarlo también al cambiar de hoja o documento.
- **Salida:** cero llamadas a la reconstrucción completa de documento/red por movimiento provisional; el resultado confirmado coincide con la referencia, una acción de deshacer restaura el estado inicial y Escape/pointercancel no lo modifica.

### 4. Optimizar solo el costo residual demostrado

Si snap/hit-test domina la traza tras los pasos anteriores, indexar candidatos por hoja y región: bornes y uniones por punto, cables por los límites de todo el segmento. Consultar las regiones que intersectan la tolerancia al zoom actual y aplicar el selector existente para preservar distancias, prioridades y desempates. Contrastar índice y búsqueda original en puntos aleatorios reproducibles, segmentos largos, cruces sin conexión y bordes de celda. Si domina pintura SVG o simulación, no implementar ese índice: documentar la traza y abrir un cambio específico para ese costo. No migrar el renderer por anticipado.

## Criterio de entrega

Entregar cada etapa por separado, con pruebas, comparación y posibilidad de revertirla. Comparar en idénticas condiciones. Objetivo inicial propuesto para pantalla de 60 Hz: p95 de intervalo entre cuadros cercano a 16,7 ms durante gestos sostenidos; informar el valor real para cada tamaño, incluso si no se alcanza. No declarar éxito por promedios ni por reducir llamadas si empeora la interacción.

Además de la medición, verificar: continuidad eléctrica después del commit; T real frente a cruce sin conexión; multiselección; esquinas redondeadas; navegación de bornes por teclado; deshacer/rehacer; cancelación; aislamiento entre hojas y actualización de conductores activos al simular. Un cambio de conectividad o de selección es una regresión aunque el benchmark mejore.
