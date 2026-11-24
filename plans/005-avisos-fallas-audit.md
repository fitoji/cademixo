# Auditoría del sistema de avisos y señalización de fallas

> Estado: auditoría hecha sobre `main` en `4cae4a7`. No cambia código.
> Objetivo: ubicar con precisión el punto del cortocircuito y, en particular, el borne o cruce que lo genera.

## Escenario de aceptación

Circuito `motor_con_inversion_giro.cad`. Después de Q1, desde el borne `96`, se crea un conductor hasta el neutro. Al activar la simulación y cerrar F1, el corto debe mostrarse en el cruce de ese conductor con el neutro (después del borne 96), no en F1 ni en la alimentación.

Datos medidos del fixture:

- `Q1` auxiliar (registro 2, código `8018`, bornes `95/97/96/98`): `96` está en la net 7; sus polos son `95-96` y `97-98`.
- `Q1` disyuntor (registro 23, código `6009`, bornes `1/3/5/2/4/6`): protecciones de potencia.
- `F1` (registro 46, código `6002`, bornes `1/3/2/4`): polos `1-2` y `3-4`; con F1 cerrado, L (net 5) pasa a net 6 y N (net 8) a net 3.
- Net 7 (borne 96) baja por `(57,90) -> (57,96) -> (45,96) -> (45,123) -> (45,144)`.
- Neutro (net 3) tiene la vertical `(39,63) -> (39,159)`.
- Un conductor nuevo de `(45,144)` a `(39,144)` genera una unión en T en `(39,144)`: ése es el cruce a marcar.

## Flujo auditado

| Etapa | Archivo | Rol |
|---|---|---|
| Topología | `app/src/editor/network.ts`, `sim/netlist.ts` | Nodos, tramos, uniones y nets |
| Detección | `sim/faults.ts` | Etiquetas de fase, polos cerrados, conflicto |
| Ubicación | `ui/fault-avisos.ts` | Punto y `Finding` del aviso |
| Presentación | `ui/App.tsx`, `ui/Canvas.tsx` | Diálogo, panel Avisos, marcas |
| Pruebas | `test/faults.test.ts`, `test/fault-avisos.test.ts`, `e2e/simulation-fault.spec.ts` | Cobertura actual |

## Hallazgos

### P0

1. **Identidad de borne posicional.** `Device.nets` sale de `attachPoints` ordenado por `(y,x)`; `polesOf` usa índices de `pinNames`. En el corpus local, **54 de 129** dispositivos con polos tienen `pinNames.length !== attachPoints.length`. El nombre del borne no es confiable.
2. **El culpable depende del orden de id.** `findCulprit` cierra polos por `recordId`, no por la acción del usuario. En el escenario, devuelve F1, no el cruce.
3. **No hay marca de borne ni de cruce.** `Finding` sólo tiene `ids` y un `at`; Canvas dibuja un solo círculo sobre el centro del componente o la mitad de un tramo.

### P1

4. **Corto directo por cables sin ubicación.** Si la unión existe sólo por cables, `culprit` es `null` y el fallback elige un registro no-alimentación arbitrario.
5. **Multi-hoja.** `Finding`/`highlight` no llevan hoja; el círculo se dibuja en la hoja activa aunque el corte esté en otra.
6. **Diálogo con ids crudos.** «Registros implicados: 1, 2, 3» no es accionable.
7. **`detectFaults` no usa `SimState.liveNets`** aunque la decisión 4 de `plans/004` lo pide.
8. **Drift de documentación**: firma y campos de `SimulationFault` desactualizados.
9. **`firstTag` guarda una sola etiqueta por red**, insuficiente para las dos orillas del borne.

### P2

10. Costo de `findCulprit` por tick.
11. Duplicación entre `closedPoles` y `findCulprit`.
12. El aviso de runtime no se descarta a mano.
13. Hacer clic en un aviso no navega ni zoomea.
14. Faltan tests de borne, cadena serie, corto directo, multi-hoja y multipolo.

## Diseño para el punto exacto

1. **Grafo de red en el netlist.** Exponer nodos y segmentos de `buildNetwork`, más el nodo de cada borne (`Device.pinNodes`).
2. **Propagar etiquetas por nodo.** Sembrar las etiquetas de alimentación y recorrer cables + polos cerrados.
3. **Detectar el corte físico.** Para cada tramo de cable, probar si al quitarlo se separan las dos etiquetas del fallo. Si sí, es el tramo-puente. Preferir el extremo que cae en un nodo `through`/`junction` (cruce o unión) sobre un borne de componente.
4. **Culpable vs. punto.** Si el puente es un cable, marcar el cruce; si el corte sólo existe por un polo cerrado, marcar el borne de ese polo. El culpable se conserva en el mensaje.
5. **UI.** `Finding` con `sheet`, `marks` y punto; Canvas dibuja el cruce y los cables implicados; el diálogo dice «Cortocircuito en el cruce de conductores» o «en -S1, bornes 13 y 14».

## Plan por fases

| Fase | Alcance |
|---|---|
| 1 | Grafo y `pinNodes` en `Netlist`; test de invariantes |
| 2 | `shortNode` por tramo-puente + `tags` en `SimulationFault` |
| 3 | UI: marcar cruce/borne, mensaje con nombres, hoja correcta |
| 4 | Escenario `motor_con_inversion_giro` como fixture y e2e |
