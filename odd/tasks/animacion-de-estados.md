# animacion-de-estados — Que el cierre/apertura de protecciones y la pulsación se vean

Feature: las protecciones (6002, 6009 y todas las de su fábrica) muestran la
cuchilla al abrir y cerrar, y el pulsador 8000 muestra el accionar. Branch:
`main` local.

## Specs

- S1 (pedidos verbatim): "si cliqueo en el 6009 simula la apertura y cierre pero
  no veo la animacion y cambio de estado grafico del componente (apertura y
  cierre), lo mismo pasa con el pulsador 8000 en este no simula el cambio de
  estado y tampoco se ve el estado de pulsacion al cliquear" y "al componenete
  6002 le pasa similar, simula el cambio de estado pero no se ve la animacion de
  cierre".
- S2 (protecciones conmutadas): toda protección dibujada con `cadesimuPole`
  tiene que tener la cuchilla con metadato `blade`, con el pivote en el extremo
  inferior y el giro que la deja vertical al cerrar. Hoy esa diagonal se emite
  sin `blade`, así que `bladeTransform` devuelve `null` y no hay animación
  posible para ningún estado.
- S3 (pulsador 8000): al accionarlo tiene que verse, aunque el circuito no esté
  armado o la rama no conduzca. Su cuchilla hoy no declara `when`, así que por
  defecto sigue al cierre eléctrico y la pulsación sola no mueve nada.
- S4 (sin cambio en reposo): los símbolos en reposo se dibujan igual que hoy, y
  el hash de `rest-ink` se regenera sólo si cambia la serialización en reposo.
- S5 (tests): poses puras para los dos casos (reposo / accionado / cerrado /
  abierto) y una aserción de que las protecciones cableadas en los fixtures
  tienen cuchilla con metadato.

## Tasks

- T1 (S2): metadato `blade` en `cadesimuPole` (`app/src/symbols/draw.ts`) y
  verificación de que 6002, 6009 y el resto de esa fábrica quedan con pose.
  Route: delegado.
- T2 (S3): `when: 'active'` en la cuchilla del 8000 (`library.ts`).
  Route: delegado.
- T3 (S4, S5): tests de pose y regeneración del hash si corresponde; suite,
  `tsc` y build. Route: delegado.
- T4: cierre y verificación visual del usuario. Route: inline.

## Log

- L1: pedidos verbatim en S1.
- L2: diagnóstico previo (read-only). El click sí funciona en los dos casos:
  `6009` entra en `protectionStates` (`App.tsx:665`) y `8000` en
  `pressedRecords` (`App.tsx:645`). El problema es el dibujo:
  (a) `resolveSymbol(6009)` devuelve la def de `families.ts` (las familias se
  esparcen después en `library.ts:1732`), y sus polos salen de `cadesimuPole`
  (`draw.ts:48-61`), que emite la diagonal de la cuchilla **sin** `blade`; con
  `bladeTransform` en `null` no hay giro para ningún estado.
  (b) La cuchilla del 8000 (`library.ts:747`) no declara `when`, así que
  `draw.ts:167` la ata al cierre eléctrico: con `closed=false, pressed=true` el
  ángulo es 0 y la pulsación sólo deja la opacidad de `[data-state='pressed']`.
- L3: `diagram.css` no tiene reglas para `closed` ni para `open` suelto: la pose
  cerrada se lee por la ausencia de la atenuación de
  `[data-protection][data-state='open']` (0,45). Con la cuchilla arreglada, la
  apertura/cierre se ve por movimiento además de por atenuación.
- L4 (T1, T2, T3 — implementación delegada). Cambios:
  (a) `draw.ts:cadesimuPole` emite la diagonal de la cuchilla con metadato
  `blade: { px: x, py: 9, deg: CADESIMU_BLADE_DEG }`. El pivote es su extremo
  inferior `(x, 9)`, sobre la conductora de abajo. El giro sale de la geometría
  dibujada, no de una estimación: desde el pivote el vector es `(−3, −6)`, así
  que el ángulo con la vertical es `atan(3/6) = 26,565°`, que el código calcula
  (`round(Math.atan2(3, 6) * 180 / Math.PI)`) y deja en 26,57 como el resto de
  los giros de la librería. Signo positivo por la convención del lienzo
  (`deg > 0` = "gira al cerrar", rotación SVG horaria): sondeo con el `rotate`
  de los tests confirma que la punta cae **vertical** sobre la columna del polo.
  Ojo: la cuchilla mide `√45` y gira rígida, así que la punta cerrada queda en
  `(x, 2,292)` —no en `(x, 3)`, que exigiría una cuchilla de 6 unidades—, 0,61
  por encima del extremo de la conductora superior (2,9): el polo se ve cerrado
  porque la cuchilla se solapa con el conductor. En reposo el ángulo es 0, o sea
  la pose dibujada es exactamente la de la captura (S4).
  (b) La cuchilla del 8000 (`library.ts`) declara `when: 'active'`: gira al
  apretarlo **o** al cerrarse, como el conmutado 8003 (S3). Antes, sin `when`,
  `draw.ts:167` la ataba al cierre eléctrico y con `closed=false, pressed=true`
  el ángulo era 0.
  Códigos que ahora animan: **6000, 6001, 6002, 6003, 6004, 6006 y 6009** (los
  siete que dibujan polos con `cadesimuPole`: seis por
  `protectionDevice({ cadesimu: true })` y el 6001 por `cadesimuBreaker`), 17
  cuchillas en total. **6002 y 6009 sí están entre ellos**, que son los dos que
  reportó el usuario. El 8000 suma la pose de pulsación; el 8001 no se tocó
  (ver más abajo).
  Tinta: ningún `d` cambió. Differential con `app/src/symbols` extraído del
  commit base (`git archive HEAD` a `mktemp -d`) y volcado de las formas de los
  232 códigos de `symbolList()`+`lineList()`: difieren sólo los metadatos
  `blade` de 8 códigos (los siete anteriores + 8000), 0 strings `d` distintos, 0
  banderas (`fill`/`thin`/`dashed`/`lamp`) distintas. Gate raster de las
  protecciones tocadas sobre `docs/03/componentes02.png` con el mapeo `S=4,
  OX=-2, OY=-60` (`6009` 57,102 · `6002` 54,78 · `6006` 114,54 · `6000`
  15,78): `ref/overlap/refOnly/symOnly/stray` **idénticos** antes y después
  (6009 ref=481 sym=2084 overlap=85 stray=965; 6002 ref=43 sym=434 overlap=0
  stray=427; 6006 ref=309 sym=1155 stray=943; 6000 ref=54 sym=250 stray=240).
  Ninguno da `stray=0` porque esas protecciones todavía no están calibradas
  contra comp02 (T9 de `cadesimu-docs03-calibration.md` sigue pendiente); es
  previo a este cambio y el gate lo confirma igual a igual.
  `rest-ink`: la huella **no cambia** (`5d1b1d68c92439b801a5cfcc19f6ffca289e60b548cc9db37ffd8b57f95d90ac`,
  sin regenerar). `inkOf` serializa `d|banderas|ángulo de reposo`, y el ángulo
  de reposo de las cuchillas nuevas es 0 antes (sin `blade`) y después (con
  `blade`, ángulo 0), así que la serialización en reposo es idéntica: S4 se
  cumple por construcción y el guard no necesita regeneración. El hash queda
  insensible a "hay metadato" por diseño; la pose de pulsación del 8000 la
  cubre `blade-pose.test.ts`.
  Tests: `blade-pose.test.ts` suma las poses de 6009/6002 (pivote, ángulo,
  reposo 0, cierre vertical, punta por encima de 2,9) y las cuatro
  combinaciones del 8000 (reposo 0, sólo apretado `deg`, cerrado `deg`, cerrado
  + apretado `deg`); `protection-symbols.test.ts` suma que los siete códigos de
  la fábrica llevan cuchilla con metadato (17 cuchillas).
  Verificación: `pnpm test` 474/474, `npx tsc --noEmit` limpio, `pnpm build`
  OK (el aviso de chunk >500 kB es previo).
- L4-bis (8001, informativo, sin cambios): su cuchilla tiene `deg` negativo y
  no declara `when`, así que el default es `'open'` y gira cuando el contacto
  **no** conduce. Al apretar un NC el solver lo abre, así que la pulsación sí se
  ve; lo que no se ve es la pose de reposo dibujada (apoyada), porque con el
  circuito sin armar `closed` ya es `false` y el símbolo aparece en la pose
  abierta. Es previo a este cambio y quedó sin tocar; decide el padre.
- L4-ter (lo que no se pudo verificar sin navegador): la animación en sí
  (transición `transform 140ms` de `SymbolGlyph`), que el cambio de estado del
  6009/6002 se lea como cierre/apertura a zoom normal (el error de redondeo del
  giro deja la punta a 0,001 unidades de la columna, 0,006 px a 6 px/unidad) y
  la pulsación visible del 8000 en el lienzo real, donde `pressed` llega desde
  `Canvas` (`state === 'pressed'`). Todo lo demás está cubierto por las
  funciones puras (`bladeAngle`/`bladeTransform`) y el differential de formas.
- L5: segundo caso de la misma clase, reportado por el usuario: "cuando 7000
  cierra activa 2001 automaticamente, pero no veo el cierre grafico". El 2001
  (contacto de potencia) dibujaba la diagonal de cada polo sin metadato `blade`,
  así que su cierre eléctrico no tenía animación posible, igual que las
  protecciones de `cadesimuPole`. Barrido sobre los 232 símbolos buscando
  diagonales de polo sin `blade`: era el único que quedaba. Se le puso el mismo
  pivote (borne inferior) y el mismo ángulo que la fábrica de protecciones,
  exportado como `CADESIMU_BLADE_DEG` desde `draw.ts` para que sea una sola
  fuente. En reposo el ángulo sigue siendo 0, así que el hash de `rest-ink` no
  cambia; hay test de las tres cuchillas (reposo abierto, cierre > 20°).
- L6: tercer caso de la misma clase, reportado por el usuario: "el componente
  6003 tiene cuchillas y unos cuadrados negros que deberian moverse al cerrar y
  no lo hacen". El cuadro de disparo de `cadesimuPole` se emitía como polígono
  relleno aparte, sin metadato `blade`, así que la cuchilla giraba y el cuadro
  quedaba clavado. Ahora lleva el mismo pivote y giro que su cuchilla, polo por
  polo (el 6003 tiene cuadro en los tres). Igual corrección en
  `filledSquareOnBlade`, que además arrastraba un comentario obsoleto: decía que
  un polígono girado no podía llevar `blade`, cuando `bladeTransform` calcula el
  pivote en porcentaje de la caja **de la propia forma** y funciona igual. Los
  tests ahora distinguen cuchillas (trazo) de cuadros (relleno) y verifican que
  cada cuadro gira con la cuchilla de su polo.
- L7: reporte de señalización óptica: "las señalizaiones opticas tienen un
  sombreado rojo y tapa el color de su luz". El halo de `[data-state='active']`
  usa `--warn`, que en el pack CADe es rojo puro, y se aplicaba a todo símbolo
  activo, incluida la lámpara cuyo color vive en el trazo (`--lamp` vía
  `data-lamp`). Ahora el halo rojo excluye a las lámparas
  (`:not([data-lamp])`) y la lámpara encendida lleva un halo de **su** color
  (`var(--lamp)`), un poco más ancho para que el tono domine. Test nuevo
  `test/state-cues.test.ts`, que lee `diagram.css` y verifica las dos reglas: no
  hay forma de volver a tapar el color sin romperlo.
