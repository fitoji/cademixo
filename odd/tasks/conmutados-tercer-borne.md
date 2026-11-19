# conmutados-tercer-borne — El tercer borne (tiro NO) existe en el modelo

Feature: los aparatos con bornes `11` (común), `12` (NC) y `14` (NO) pasan a
tener **dos tiros** en el modelo de simulación. Hoy `pairPins` empareja por
mitad y **descarta el tercer borne**, así que el tiro NO no existe aunque el
símbolo lo dibuje. Branch: `main` local.

## Specs

- S1 (pedido): corte B del mapa de simulación, elegido por el usuario con
  "vamos con 1." — el mapa decía: "el segundo tiro de los contactos de tres
  bornes (8003/8015/8010/7003…): hoy `pairPins` solo empareja 11-12".
- S2 (dos tiros): un aparato cuyo juego de bornes es `11`, `12`, `14` se modela
  como **dos polos que comparten el común**: `(11,12)` y `(11,14)`. El tiro NO
  deja de desaparecer.
- S3 (tiro activo): en reposo conduce el `12` (NC); cuando el aparato está
  accionado o energizado conduce el `14` (NO). Las posiciones libres que ya
  existen (`8018` y las que vienen de `changeoverPositions`) siguen mandando.
- S4 (índices): los polos siguen expresados con los índices de `attachPoints`,
  porque `flow.ts` indexa `network.pins` con ellos. Cambia la cantidad de
  dispositivos por registro, no el esquema de ids.
- S5 (cobertura): se agrega un fixture con un conmutado de tres bornes
  cableado, porque hoy **ningún** archivo del repo cablea uno y la red de tests
  no lo cubre.
- S6 (sin regresión): los aparatos de 2, 4 y 6 bornes se emparejan como hoy;
  `8018` conserva su comportamiento de dos posiciones; el dibujo no cambia.
- S7 (verificación): tests de la derivación de polos, del tiro activo en el
  solver y del fixture nuevo; suite completa, `npx tsc --noEmit` y build.

## Tasks

- T1 (S2, S4, S6): derivar los polos de un aparato de tres bornes con común en
  un solo lugar, con función pura y tests; los demás conteos quedan igual.
  Route: delegado. DONE — `polesOf`/`isTwoThrow`/`throwIndices` en
  `sim/netlist.ts`.
- T2 (S2, S3): que el circuito y el solver usen esos polos con el tiro activo
  correcto, sin romper el caso `8018`. Route: delegado. DONE — `simKindsOf` en
  `sim/circuit.ts`, con desviación declarada en L4.
- T3 (S5): fixture cableado de tres bornes + tests del tiro. Route: delegado.
  DONE — `app/test/fixtures/conmutado-tercer-borne.cade`.
- T4 (S7): verificación integral y cierre del doc. Route: inline. DONE — suite
  468/468, `tsc` limpio, build OK, más el arreglo de pose de L5.

## Log

- L1: pedido verbatim: "vamos con 1." (corte B del mapa que enumeraba B y C).
- L2: mapa previo: `pairPins` (`sim/netlist.ts:85-92`) empareja por mitad
  (`i` con `i+floor(n/2)`), y con 3 bornes `floor(3/2)=1`, así que el índice 2
  se descarta sin diagnóstico. Los aparatos reales con `11 12 14` son 7003,
  7007, 7011, 7015, 8003, 8007, 8011 y 8015; el común `11` va arriba (x=3) y
  los tiros abajo (12 en x=0, 14 en x=6), y `attachPoints` ordena de arriba a
  abajo y de izquierda a derecha, así que el orden es `[11,12,14]`. El solver
  ya sabe de conmutados (`solver.ts:201-209`): se cierra el tiro cuyo índice
  coincide con la posición. `flow.ts:75-87` indexa `network.pins` con los
  índices de los polos, de ahí S4.
- L3: alcance acotado a propósito: no se agregan diagnósticos nuevos de bornes
  ni se toca el segundo tiro de los aparatos de cuatro bornes (`8018`), que ya
  funciona como dos caminos independientes.
- L4: desviación de diseño, acordada con el implementador. El plan decía
  mapear el registro a `'changeover'` y sacar la posición de
  `changeoverPositions`, pero eso no era implementable sin tocar `App.tsx` y
  además rompía los pulsadores: `App.tsx:629` da precedencia a `isPushable`, así
  que un pulsador de tres bornes nunca recibe posición libre, y con kind
  `changeover` apretar el 8003 habría dejado de conducir. Se resolvió con un
  `kind` por polo (`buttonNC`/`buttonNO`, `contactNC`/`contactNO`), de modo que
  el tiro activo sale de la misma regla que ya usaban esas ramas (presionado, o
  energizado por designador, temporizadores incluidos). El resultado
  observable es el pedido: el 12 conduce en reposo, el 14 al accionar, nunca los
  dos. `solver.ts`, `visual.ts` y `App.tsx` no se tocaron en esa unidad.
- L5: efecto visual detectado y corregido acá. `closedContacts` marcaba el
  registro como cerrado cuando conducía cualquiera de los dos tiros, así que en
  reposo el símbolo del 8003 se dibujaba accionado. Ahora, para un conmutado de
  tres bornes, la pose sigue al tiro que gira (`0-2`): conduce el `12` en
  reposo pero el símbolo se dibuja como está dibujado, y gira al accionar. Los
  aparatos con una sola pareja de polos y el `8018` no cambian.
- L6: huecos declarados, previos y fuera de alcance. (a) `7003` sigue
  `kind: unknown` en `ComponentSpec`: gana sus dos polos pero no llega al
  solver; agregar la fila cambiaría el `kindOf` y la paridad congelada del doc.
  (b) `8003/8007/8011` siguen con `rest: 'open'`, congelado por
  `component-spec.test.ts`, así que en reposo su estado visual dice «abierto»
  aunque conduzca el `12`; es coherente para un pulsador (no está apretado) y no
  afecta el dibujo desde L5.
