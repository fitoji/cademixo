# pulsadores-momentaneos — El pulsador actúa y vuelve solo

Feature: los contactos **pulsador** (8000-8007) dejan de comportarse como
interruptores: al accionarlos se cierran/abren y **vuelven solos** a su estado
inicial. Los **interruptor** (8008-8011) y el conmutador (8018) siguen fijos.
Branch: `main` local.

## Specs

- S1 (pedido verbatim): "los componentes 8000, 8001 y me imagino toda la familia
  de pulsadores no son interruptores fijos, sino que actuan y vuelven a su
  estado inicial".
- S2 (clasificación por catálogo, no por rango): son **momentáneos** los códigos
  cuyo nombre en el catálogo dice «Contacto pulsador» — 8000, 8001, 8002, 8003,
  8004, 8005, 8006, 8007. Siguen **fijos** los «Contacto interruptor» — 8008,
  8009, 8010, 8011 — y el conmutador 8018.
- S3 (interacción): un clic sobre un pulsador durante la simulación lo acciona y
  lo suelta solo, con un pulso mínimo que garantice que el solver lo vea en el
  siguiente paso (no un flanco de milisegundos). Un segundo clic durante el pulso
  lo reinicia; no acumula estados.
- S4 (sin colaterales): los interruptores, las protecciones, el conmutador 8018,
  las setas de fijación y todo el resto del camino de simulación se comportan
  igual que hoy. Fuera de simulación, el clic sigue siendo sólo selección.
- S5 (limpieza): al detener la simulación no queda ningún pulso pendiente que
  pueda volver a accionar el componente después.
- S6 (tests): la clasificación (momentáneo / fijo) es una función pura y se
  testea por código; la suite, `tsc` y el build quedan verdes.

## Tasks

- T1 (S2, S6): declarar la naturaleza momentánea en la tabla de specs
  (`app/src/model/component-spec.ts`) con una función pura para consultarla, y
  sus tests. Route: delegado.
- T2 (S3, S5): accionar y soltar solo en `App.tsx`, con el pulso mínimo y la
  limpieza al detener. Route: delegado.
- T3 (S4, S6): verificación de que nada más cambió (interruptores, protecciones,
  8018), suite, `tsc`, build. Route: delegado.
- T4: prueba en la app del usuario (pulsar 8000/8001 con y sin circuito armado).
  Route: inline.

## Log

- L1: pedido verbatim en S1.
- L2: estado previo. `App.tsx` toggleaba `pressedRecords` en cada clic, así que un
  pulsador quedaba accionado para siempre: eléctricamente eso es un interruptor,
  no un pulsador. La tabla de specs asignaba `pressable` al rango 8000-8011 sin
  distinguir pulsador de interruptor, y el catálogo sí los distingue por nombre.
- L3: decisión de interacción. Se implementa **clic = pulso**, no
  "mantener apretado = accionado": el canvas ya usa el clic para seleccionar y
  arrastrar, y enganchar `pointerdown`/`pointerup` sobre el grupo del componente
  pelearía con esa selección. El pulso con duración mínima es equivalente para el
  circuito (el solver lo ve al menos un paso) y no toca el resto de los gestos.
- L4: implementado (T1, T2, T3).
  - Clasificación: `ComponentSpec.momentary` marca las filas 8000-8007 y
    `isMomentary(code)` lo consulta; el comentario de la tabla cita los nombres
    del catálogo («Contacto pulsador» vs «Contacto interruptor»). `pressable`,
    `rest` y `kind` no cambian: `pressable` sigue diciendo «el clic lo
    acciona», `momentary` agrega «y vuelve solo». 8008-8011 y 8018 false.
  - Decisión pura: `clickActionOf(code, pressed)` → `pulse` (momentáneo,
    siempre, incluso ya accionado: reinicia) | `press`/`release` (alterna) |
    `none` (no se acciona con el clic). `applyClick(pressed, id, code)` aplica
    esa decisión al conjunto de registros accionados sin duplicar ni acumular.
  - **Duración del pulso: `MOMENTARY_PULSE_MS = SIMULATION_TICK_MS * 3` = 300
    ms.** El reloj de simulación avanza de a 100 ms (`setInterval` que suma
    `tick`) y cada tick es un paso del solver, así que un pulso de un tick
    podría nacer y morir entre dos pasos (o perderse si el navegador retrasa el
    intervalo). 300 ms contienen siempre al menos dos pasos con el contacto
    accionado, cualquiera sea el instante del clic respecto del reloj, y siguen
    siendo imperceptibles como "pegajoso". Está expresado en ticks, no como
    constante arbitraria: si el paso cambia, el pulso cambia con él.
  - Timers: `pulseTimers` es un `useRef(new Map<number, number>())` claveado
    por id de registro, así dos pulsadores a la vez funcionan y un segundo clic
    reinicia el pulso cancelando el handle anterior. Se limpian en
    `clearPulses()`: al detener la simulación (antes de vaciar
    `pressedRecords`) y en el efecto de desmontaje, así que ningún `setTimeout`
    puede volver a accionar nada después de parar (S5).
  - Sin colaterales: los interruptores 8008-8011 y los selectores 8012-8015
    pasan por el mismo `applyClick` que reproduce el toggle anterior; 8018, las
    protecciones (`protectionStates`, vía `isProtectionCode`) y el auxiliar
    enlazado de un disyuntor no tocan la rama de pulsadores; el clic fuera de
    simulación sigue cayendo en `select()` porque toda la rama está detrás de
    `if (running && ids.length === 1)`.
  - Tests: `test/component-spec.test.ts` (clasificación por código +
    `momentáneo implica presionable`) y `test/momentary.test.ts` nuevo (la
    decisión pura, el reinicio sin duplicar, el toggle de los interruptores y la
    duración del pulso en ticks). Ningún test existente afirmaba el toggle de un
    código momentáneo, así que no hubo que actualizar ninguno.
  - No verificable sin navegador: que el pulso se **vea** en el lienzo (un
    `setTimeout` real, el `setInterval` del reloj y el repintado) y que 8000/8001
    se comporten como pulsadores con y sin circuito armado (T4, prueba del
    usuario). El cableado de React (`strikeMomentary`, `clearPulses`, el efecto
    de desmontaje) queda sin test y se dice acá: la suite corre en Node, sin DOM
    ni `react-dom`, y no se agregó un runner de componentes.
