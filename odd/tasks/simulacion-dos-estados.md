# simulacion-dos-estados — Que el segundo estado de cada componente se vea, y higiene del motor

Feature: los componentes que hoy no muestran su segunda pose pasan a mostrarla
(cuchilla que se mueve o tinta atenuada), y se corrige la higiene del camino de
simulación que hoy hace que el dibujo se quede atrás del solver.
Branch: `main` local. Test runner: `pnpm test` desde `app/`.

## Specs

- S1 (pedido verbatim): "ahora revisa el tema de la simulacion, y de los dos
  estados que tiene cada componente," y luego "dale a y d, pero con alto
  impacto visual".
- S2 (alcance): se implementan solo el corte A («que los dos estados se vean»)
  y el corte D («higiene, sin cambio visible»). Los cortes B (segundo tiro de
  los contactos de tres bornes) y C (disparo real del térmico/diferencial y
  reset del biestable) quedan fuera y no se tocan.
- S3 (8003, pulsador conmutado): al accionarlo, la cuchilla dibujada tiene que
  girar del tiro NC al tiro NO, con el pivote en el borne común. Hoy no tiene
  metadato `blade`, así que solo se atenúa.
- S4 (8017, auxiliar NC del térmico): tiene que mostrar la cuchilla y abrirse
  cuando el contacto abre, además del glow de disparo.
- S5 (6007, guardamotor): sus polos tienen que mostrar la pose; hoy son polos
  rectos idénticos abiertos y cerrados.
- S6 (estados de protección): `visualStateOf` tiene que devolver `closed` u
  `open` para las protecciones y sus auxiliares según lo que resuelve el
  circuito. Hoy caen al fallback y su `data-state` es el mismo abiertas o
  cerradas, así que ninguna regla CSS puede distinguirlas.
- S7 (alto impacto visual): además de la cuchilla, una protección abierta se
  lee atenuada (tinta al ~45%) y una cerrada con tinta plena. El atributo que
  habilita la atenuación va solo en protecciones y auxiliares térmicos, para
  que un pulsador en reposo no se vea «apagado».
- S8 (higiene D, sin cambio visible):
  - el `useMemo` que alimenta al solver incluye todas las entradas que consume,
    para que accionar un conmutado o una protección no espere al tick de 100 ms;
  - `lastEnergized` y `timerReady` dejan de mutarse durante el render y pasan a
    un efecto;
  - el toast de arranque usa el mismo resultado que el badge, no un `simulate()`
    aparte;
  - se elimina el `DeviceKind 'switch'` que nunca se produce y el tipo deja de
    estar duplicado entre `solver.ts` y `netlist.ts`;
  - al detener la simulación se limpia también `timerReady`.
- S9 (tests): rotación de cuchilla como función pura (estados rest/pressed y
  cerrado/abierto, incluido el conmutado 8018 que gira al revés), estados
  nuevos de protección en `visual.test.ts`, y cuchilla presente en 8003/8017/
  6007. Suite verde y `npx tsc --noEmit` limpio.
- S10 (diferencial): el dibujo en reposo sin simular no cambia para ningún
  símbolo; solo cambia lo que se ve al simular y accionar.

## Tasks

- T1 (S6, S7): `visualStateOf` devuelve closed/open para protecciones y
  auxiliares térmicos; `Canvas` marca las protecciones para la atenuación y
  `diagram.css` gana la regla. Route: delegado. DONE — commit `0e028eb`.
- T2 (S3, S4, S5): metadato `blade` en 8003, 8017 y 6007 con la pose correcta
  al accionar/abrir. Route: delegado. DONE 8003 y 8017 — commit `a5c07a8`. El
  6007 se revirtió a propósito: la captura `rele termico.png` lo dibuja con
  conductores rectos y su pose se lee por la atenuación de S7 (ver L5).
- T3 (S9): helper puro de ángulo de cuchilla + tests de estados y de cuchilla.
  Route: delegado. DONE — `blade-pose.test.ts`, `visual.test.ts`,
  `rest-ink.test.ts` (hash de la tinta en reposo de los 232 símbolos) y
  `protection-dim-scope.test.ts`.
- T4 (S8): higiene del camino de simulación en `App.tsx` y `solver.ts`.
  Route: delegado. DONE — commit `a357e66` (ver L6 para las dos desviaciones
  acordadas).
- T5: verificación integral (suite, tsc, build) y cierre del doc. Route:
  inline. DONE — suite 420/420, `tsc` limpio, `vite build` OK, más una
  verificación independiente sin hallazgos bloqueantes que motivó el fix del
  8017 (L7).

## Log

- L1: pedido verbatim: "ahora revisa el tema de la simulacion, y de los dos
  estados que tiene cada componente," y "dale a y d, pero con alto impacto
  visual".
- L2: revisión read-only previa (mapa del motor + estados). Hallazgos que
  fundamentan el corte A: 8003 y 8017 no tienen ni un `blade`; 6007 usa polos
  rectos; `diagram.css` no tiene reglas para `idle`/`closed`/`open`, así que sin
  cuchilla no hay señal visual; y `visualStateOf` nunca devuelve closed/open
  para protecciones (`kind` fuse/thermal), por lo que su `data-state` es
  idéntico abiertas o cerradas. Verificado a mano: `grep -c blade` da 0 en
  `library.ts:825-870` (8017) y `library.ts:1462-1494` (8003).
- L3: higiene D confirmada en el mapa: `positions` falta en las deps del
  `useMemo` del solver; `lastEnergized`/`timerReadyRef` se mutan en render; el
  toast usa un `simulate()` propio; `'switch'` está declarado y nunca se
  produce; `timerReadyRef` no se limpia al detener.
- L4: resultado del corte A: 8003 gira −45,24° del tiro NC al NO cuando está
  accionado (pivote en el común), 8017 gira −30° al abrir su contacto, y las
  protecciones pasan de `idle` a `closed`/`open` según el circuito, con
  `data-protection` puesto desde la tabla de specs (no por rango de códigos) y
  atenuación al 45%. `SymbolGlyph` ya no calcula la pose: consume
  `bladeAngle`/`bladeTransform` de `draw.ts`, y el contrato por defecto quedó
  documentado (`deg>0` cierra, `deg<0` abre, `when:'active'` sigue el accionar).
- L5: decisión de fidelidad sobre el 6007: el trabajador lo había pasado a
  cuchilla de aparamenta para que mostrara la pose, con un comentario admitiendo
  que `rele termico.png` dibuja conductores rectos. Se revirtió
  (`git checkout -- app/src/symbols/families.ts app/test/protection-symbols.test.ts`):
  el 6007 conserva la tinta medida y su segunda pose se lee por la atenuación de
  S7. Prueba: el test de `blade-pose` ahora afirma que NO lleva cuchilla.
- L6: dos desviaciones acordadas del corte D. (a) `DeviceKind` no se movió a
  `netlist.ts` porque son dominios distintos: el tipo del solver pasó a
  llamarse `SimDeviceKind` con alias de compatibilidad, y el `'switch'` muerto
  desapareció de la unión, del set conductor y del `switch`; el camino de
  import/reexport de `circuit.ts` no cambió. (b) `timerStartRef`/
  `timerDeStartRef` siguen escribiéndose en el memo de render: es preexistente e
  idempotente en el mismo tick, y sacarlo cambiaba el instante de arranque de
  los temporizadores; queda anotado como deuda.
- L7: verificación independiente de `App.tsx`/CSS (sin bloqueantes). Confirmó
  que los efectos pasivos se vacían antes del próximo render (react-dom 19), así
  que la secuencia de `energized` que ve el solver es la misma de antes, y que
  StrictMode ya no adelanta un paso. Hallazgo corregido: al unificar la paleta
  del 8017 se le había puesto `thin`, o sea la tinta en reposo SÍ cambiaba; se
  restauraron los 14 trazos con sus pesos (comparación trazo por trazo contra
  `HEAD`: 0 diferencias) y la rotación se hace con la misma metadata en todos.
  Se adoptaron los dos probes del verificador como tests durables.
- L8: pendientes conocidos y fuera de alcance. (a) Las cuchillas NC ya se
  dibujaban rotadas en reposo desde antes (26 símbolos): el 8017 sigue esa
  convención, así que sin simular su paleta aparece en la pose abierta; el
  guard de `rest-ink` la fija y avisará si alguien la cambia. (b) La atenuación
  del 45% también apaga los puntos de borne que viven dentro de `.sym`. (c) Si
  `built` pasa a null mientras corre la simulación, el estado retenido se
  reinicia (antes se reanudaba). (d) El segundo tiro de los contactos de tres
  bornes (corte B) y el disparo real del térmico/diferencial con reset del
  biestable (corte C) siguen sin hacer.
