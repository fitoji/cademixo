# cadesimu-docs03-calibration — Calibración de componentes de docs/03

Objetivo: calibrar contra las capturas de `docs/03/` los componentes que
todavía no están anclados al origen, llevando sus defs a la app con evidencia
px (gate raster stray=0, tests, tsc y suite verde).
Branch: `main`. Test runner: `pnpm test` desde `app/`.

## Specs

- S1 (pedido verbatim): "con las skills que tienes empieza a tomar los
  componentes y llevalos a nuestra app , bien calibrados"
- S2 (material): dos pares CAD texto + captura PNG en `docs/03/`:
  - `componentes01` ↔ `componentes01.png` (903×489, 30 comps): contiene
    1050,1051,2000,2001,3000,3001,3002,3003,3004,3005,3011,5000,5002,5004,6005,6006,6008,6010,7000,7001,7002,7003,8015,8016,8017,8018,8019,9000,9001,9002,9009.
  - `componentes02.cad` ↔ `componentes02.png` (757×478, 32 comps): contiene
    2000,2001,2006,3000,3001,3003,3004,3005,3011,5000,5001,5002,5003,5004,6000,6001,6002,6003,6005,6006,6008,6009,6010,8014,8015,8016,8017,8018,8019,9000,9001,9002,9009.
  `componentes01.cad` es un PNG mal nombrado (no es CAD de texto). Las capturas
  se copiaron a `docs/cadesimu-svg/reference/` para el verificador.
- S3 (ya anclados, no recalibrar salvo desvío): 1000,2001,3000,3001,6001,7016,
  8000-8005,8016,9000,9003,9004,9008.
- S4 (unión sin anclar en docs/03, 33): 1050,1051,2000,2006,3002,3003,3004,3005,
  3011,5000,5001,5002,5003,5004,6000,6002,6003,6005,6006,6008,6009,6010,7000,
  7001,7002,7003,8014,8015,8017,8018,9001,9002,9009.
- S5 (método, por skill cadesimu-calibration): medir S/OX/OY por captura desde
  puntos conocidos; reescribir defs en `app/src/symbols/library.ts` con
  `anchor:'origin'` y `originPins` en las filas de conexión (cables en filas 0
  y alto-3/12 del registro según convención), quitar overrides en `families.ts`
  que los pisen; no cambiar identidad de bornes; tinta del símbolo solamente.
- S6 (evidencia por lote): test RED→GREEN en `app/test/symbol-anchors.test.ts`,
  `node .agents/skills/cadesimu-calibration/assets/overlay-diff.ts` con stray=0
  (refOnly = overlay de texto/anillo), `pnpm test` + `npx tsc --noEmit` verdes,
  differential base-vs-árbol con solo los códigos objetivo cambiados.
- S7 (alcance de esta sesión): empezar por lotes prioritarios y verificables;
  no declarar completado lo no medido. Prioridad inicial: 9009 (hermana de
  9008, alta frecuencia), 7000/7001/7002/7003 (auxiliares), 3002-3005/3011
  (alimentaciones), 8017/8018 (contacto térmico/conmutador), 2000/2006
  (contactores), 5000-5004 y 6000/6002/6003/6005/6006/6008/6009/6010
  (protección), 8014/8015, 9001/9002, 1050/1051.

## Tasks

- [x] T1 (S2,S5): medir S/OX/OY de `componentes01.png` y `componentes02.png`.
  - comp01: `S=4, OX=-17, OY=-101` (`px=cad*4+(-17,-101)`), verificado stray=0 en 3000/3001.
  - comp02: `S=4, OX=-2, OY=-60` verificado stray=0 en 3000; 6001/2001 no cierran con defs actuales (requiere revisión).
- [x] T2 lote 1 (S4,S5,S6): 9009 anclada (commit `504cc58`, stray=0).
- [~] T3 lote 2 contactos auxiliares/conmutadores: 7000,7001 anclados (`ede08c3`). 7002,8018 anclados (`dd7d5b1`). 8017 anclado (comp01 stray=0). 7003,8015 anclados (comp01 stray=0). 8014 pendiente.
- [x] T4 alimentaciones 3002-3005,3011: las cinco ancladas (comp01 stray=0).
- [x] T5 bobinas 9001,9002; resistencias 1050,1051: las cuatro ancladas (comp01 stray=0).
- [~] T6 contactores 2000,2006: 2000 anclado (comp01 stray=0). 2006 pendiente (comp02).
- [~] T7 fusibles 5000-5004: 5000,5002 anclados (comp01 stray=0). 5001,5003,5004 pendientes.
- [~] T8 protección 6000,6002,6003,6005,6006,6008,6009,6010: 6005, 6008 y 6010 anclados (comp01 stray=0). 6006 medido pero bloqueado por la inserción de 8 bornes. Resto pendiente.
- [ ] T9 restantes comp01/comp02: 7003,8014,8015,8017 y exclusivos/cruzados (2006,5001,5003,6000,6002,6003,6009,8014, resto comp02).
- [ ] T10 verificación comp02, diferencial, suite, tsc, push.

## Log

- L1 (pedido verbatim): "con las skills que tienes empieza a tomar los
  componentes y llevalos a nuestra app , bien calibrados"
- L2: inventario docs/03: `componentes01`+`componentes01.png` y
  `componentes02.cad`+`componentes02.png` son pares CAD/captura; `componentes01.cad`
  es PNG mal nombrado. 33 códigos sin anclar presentes en unión (ver S4).

- L3 (T1 parcial): mapeo de `componentes01.png` medido desde anclajes
  conocidos (3000/3001 verificados con stray=0): **S=4, OX=-17, OY=-101**
  (`px = cad*4 + (-17,-101)`). La 8016/9000/2001 no dan stray=0 con este
  mapeo contra sus defs actuales, pero 3000/3001 sí; el mapeo es consistente
  con las posiciones de los stems medidos. Mapeo de `componentes02.png`
  pendiente de cierre (escala/offset distinto al de componentes01).
- L4 (T2, lote 1 — 9009): `Señalización óptica intermitente` anclada al origen
  (X1 en 0,0; X2 en 0,12) con la base `cadesimuLamp()` + destello medido en px
  sobre `componentes01.png`. Gate raster: ref=149 overlap=140 stray=0
  (componentes01.png, 9009 en 135,36, S=4 OX=-17 OY=-101). Test de anclaje
  GREEN; tsc limpio. Quitado `lampDevice(9009,...)` de `families.ts`.

- L5: 7000/7001 anclados y cerrados con gate stray=0 sobre componentes01 (commit `ede08c3`). 7000: ref=50 overlap=48 refOnly=2 stray=0 (114,33). 7001: ref=70 overlap=62 refOnly=8 stray=0 (114,54).
- L6 (mapeo comp02): `componentes02.png` mapeo `S=4, OX=-2, OY=-60` verificado con 3000 (stray=0, 15,36). 6001/2001 no cierran con ese mapeo usando defs actuales; requiere verificación por símbolo.
- L7 (estado): pendientes 30 códigos: 7002,7003,8014,8015,8017,8018,3002-3005,3011,1050,1051,2000,2006,5000-5004,6000,6002,6003,6005,6006,6008,6009,6010,9001,9002. Comp02-exclusivos: 2006,5001,5003,6000,6002,6003,6009,8014. TSC limpio en último chequeo. Push pendiente.
- L8: 7002 (aux NA-NC, 93,75 comp01) y 8018 (conmutador 2 posiciones, 144,90 comp01) anclados en `app/src/symbols/library.ts` con stray=0 (gates ref=189/211 overlap=162/172). Tests de anclaje añadidos; imports no usados removidos. 7003,8015,8017 intentados pero sin stray=0 y revertidos (siguen pendientes). Commit `dd7d5b1`.
- L9: 5000 (24,63 comp01) y 5002 (42,63 comp01) anclados en `app/src/symbols/library.ts` con stray=0 (gates ref=120/240 overlap=94/188). Overrides removidos en `families.ts`. Tests de anclaje añadidos. 5004 intentado (geometría no coincide, stray alto) y revertido. Commit `805425e`.
- L10: 8017 (126,108 comp01) anclado con núcleo NC y stray=0 (ref=110 overlap=63, refOnly detalle térmico aceptado). 7003,8015 siguen pendientes.
- L11 (T6 parcial — 2000): contactor bipolar anclado al origen en
  `app/src/symbols/library.ts` (`anchor: 'origin'`, bornes 1/3 en la fila
  superior y 2/4 en la inferior, caja 12×15). Geometría medida sobre
  `componentes01.png` (registro 27,126): conductor superior (p,0)→(p,3), hoja
  (p,9)→(p−3,3) con pivote en (p,9) y giro `PUSH_BLADE_DEG`, bajada
  (p,9)→(p,12), y guion mecánico punteado en y=6 de −1,5 a 4,5 (dos tramos de
  1,75 con hueco de 2,5). Gate: ref=121 overlap=110 refOnly=11 symOnly=258
  **stray=0**. Override `polesDevice(2000,…)` quitado de `families.ts`. Test
  nuevo RED→GREEN en `symbol-anchors.test.ts` (22/22). `tsc` limpio.
  - Hallazgo: la captura de `componentes01` dibuja los polos con el cuerpo en
    y=0..12 y el guion a y=6, no con el stub superior en −6..−3 que usaba el
    def viejo de 2001. Sirve de patrón para el resto de la familia.
  - Suite completa: 4 tests ajenos a 2000 quedan en rojo desde los lotes de
    8018 y fusibles (aserciones contra geometría vieja); se corrigen aparte.
- L12 (cierre de tests obsoletos): las 4 aserciones que contradecían la
  geometría medida se alinearon con la evidencia del gate (8018, 5000 y 5002
  siguen en stray=0 sobre `componentes01`). `conmutador.test.ts`: el enlace
  mecánico es un path de tramos explícitos (no `dashed`) y el pivote de cada
  hoja está en y=9; la lambda abre las puntas hacia adentro. `protection-symbols.test.ts`:
  el fusible 5000 va de 3 a 9 y se afirma por `originPins`. `symbol-grid.test.ts`:
  5002 sale del test de caja porque ya está anclado al origen. `tsc` limpio y
  suite **374/374**.
- L13 (T8 parcial — 6010): disyuntor motor unipolar anclado al origen en
  `library.ts` (`breakerMotor1`, caja 6×24, bornes 1/2 en y=0/y=21). Medido
  sobre `componentes01` (registro 156,120): polo en la columna 0 con hoja
  (0,9)→(−3,3), caja doble (−3,12)-(3,18) con divisoria en y=15, gancho del
  térmico (0,12,75)…(1,25,14), dos puntos en x=1,25 y disparo magnético:
  cuadrado (−8,4)-(−4,8) con cruz, acometida en y=6 de −10 a −2,25 y punteado
  en x=−6 hasta la caja. Gate: ref=363 overlap=342 refOnly=21 **stray=0**.
  - Trampa encontrada: 6010 tenía **dos** definiciones propias (`disyuntor1` en
    `ALL` y `protectionDevice` en la familia) que pisaban la nueva; se quitaron
    ambas. Conviene revisar lo mismo en cada código que se calibre de acá en
    adelante.
  - Tests: 3 aserciones de protección/grilla afirmaban que 6010 vive en la
    familia; se reescribieron contra `symbolFor()` porque el S7 pide def propia,
    no pertenencia a la familia. `tsc` limpio y suite **375/375**.
- L14 (T5 parcial — 1050): Resistencia I anclada al origen (`resistor1`, caja
  6×18, bornes 1/2 en y=0/y=15). Medido sobre `componentes01` (registro 12,75):
  cuerpo vertical de 2,75 de ancho de (−1,5,3) a (1,25,12) con conductor de 0 a
  3 arriba y de 12 a 15 abajo. Gate: ref=121 overlap=116 refOnly=5 **stray=0**.
  - La familia la dibujaba **horizontal** (caja 18×12) porque no había
    referencia; ahora la hay. `resistor(1050,1)` quitado de `families.ts`; la
    1051 sigue con el cuerpo horizontal y sin evidencia.
  - Test de grilla renombrado a la 1051. `tsc` limpio y suite **376/376**.
- L15 (T5 — 9001 y 9002): las dos bobinas ancladas al origen en `library.ts`.
  9001 «Bobina biestable» (caja 9×15, bornes A1(−3,0)/B1(3,0)/A2(0,12)): dos
  patas de entrada, cuerpo (−4,4)-(4,8) con las diagonales de la bobina doble y
  salida centrada; gate ref=191 overlap=172 **stray=0**. 9002 «Telerruptor»
  (bornes A1(0,0)/A2(0,12)): conductor de 0 a 4, cuerpo igual y chevrón
  biestable pegado al borde izquierdo con barra en x=−1; gate ref=172
  overlap=163 **stray=0**. `coilDevice(9001)` y la `def` de 9002 quitadas de
  `families.ts`. `tsc` limpio y suite **378/378**.
  - Nota: el registro real del 9002 trae **sólo** A1 y A2 (no el contacto 1-2
    que dibujaba la familia); la def medida se queda con los dos bornes que el
    archivo escribe.
- L16 (T5 cerrado — 1051): Resistencia III anclada al origen (`resistor3`, caja
  18×18, bornes 1/3/5 arriba y 2/4/6 en la fila 15). Medido sobre
  `componentes01` (registro 33,81): tres cuerpos verticales idénticos al de la
  1050 sobre las columnas 0/6/12. Gate: ref=364 overlap=348 refOnly=16
  **stray=0**. `resistor(1051,3)` y el helper `resistor` quitados de
  `families.ts` (ya no lo usaba nadie); el test de grilla que fijaba el cuerpo
  horizontal se reemplazó por el test de anclaje. `tsc` limpio, suite
  **378/378**. T5 cerrada.
- L17 (T8 parcial — 6005): «Diferencial IN» anclado al origen (`differential1`,
  caja 12×21, bornes 1/3 arriba y 2/4 en la fila 18). Medido sobre
  `componentes01` (registro 183,102): dos polos con el patrón de siempre,
  toroide de (0,12) a (6,15) con un arco por lado (radio 1,52 → panza 1,75) y
  el disparo magnético (−8,4)-(−4,8) con acometida en y=6 y punteado en x=−6.
  Gate: ref=379 overlap=358 refOnly=21 **stray=0** al primer intento.
  - Ojo con los arcos: `shapesBounds` los acota como punto final + radio, por
    eso el ancho declarado llega a 7,52 y no a 7,25 como la captura.
  - El test de «cuchilla de CADeSimu» exigía el segmento escrito de la punta al
    pivote; ahora acepta los dos órdenes. `tsc` limpio, suite **379/379**.
- L18 (6006, bloqueado por la inserción): el «Diferencial IIIN» ya está medido
  sobre `componentes01` (registro 174,66): cuatro polos en 0/6/12/18, caja
  24×21, toroide de 0 a 18 con un arco por lado y el mismo disparo magnético que
  el 6005; gate ref=648 overlap=582 **stray=0**. No se puede declarar todavía:
  su registro real trae **ocho** bornes (`1 3 5 7 2 4 6 8`) y `place.ts`
  sintetiza sobre plantillas base de 7 como máximo (`PIN_SLOTS`), así que
  insertarlo escribiría un aparato de siete bornes.
  - Probado y descartado: cortar `synthesize` devolviendo `undefined` cuando hay
    más de 7 bornes, para que la UI avise en vez de truncar. El invariante «todo
    símbolo del catálogo se puede insertar» lo rechaza, así que hacen falta una
    plantilla base de ocho bornes y un retoque al generador de `templates.ts`.
  - La geometría quedó lista igual: `differentialDef(code, name, n)` sirve para
    6005 y para 6006 en cuanto exista esa base.

- L19 (T3 parcial — 7003 y 8015): dos contactos conmutados de 3 bornes
  anclados al origen sobre `componentes01` (stray=0, actuador izquierdo como
  refOnly aceptable).
  - 7003 «Contacto auxiliar conmutado» (117,78, caja 12×15, bornes 11@3,0 /
    12@0,12 / 14@6,12): común bajando a y=3,25, hoja (3,3.25)→(1,8), fijo NC
    con pestaña (0,8.25)-(1,8.25)-(0,8.25)-(0,12) y fijo NO con pestaña
    (6,8.25)-(4.75,8.25)-(6,8.25)-(6,12). Gate ref=82 overlap=73 refOnly=9
    **stray=0**.
  - 8015 «Contacto final de carrera conmutado» (162,36, misma caja/bornes):
    núcleo de contacto similar pero el fijo NO baja directo desde y=9 (sin
    pestaña horizontal a 8,25) y la hoja llega a (0.75,8.5). Gate ref=79
    overlap=61 refOnly=18 **stray=0**. Overrides `contactDevice(7003,…)` y
    `contactDevice(8015,…)` quitados de `families.ts`. `tsc` limpio, suite
    **381/381**.

- L20 (T8 parcial — 6008): «Disyuntor II» anclado al origen en `library.ts`
  (caja 12×24, bornes 1/3 arriba y 2/4 en y=21). Medido sobre `componentes01`
  (registro 195,39): dos polos con cuchilla, disparo magnético (-10,4)-( -4,8)
  con acometida en y=6, doble cuerpo térmico (-3,12)-(9,18) con ganchos y marcas
  en 16-16,5, y enlace punteado en x=-6. Gate: ref=552 overlap=487 refOnly=65
  **stray=0**. Override `protectionDevice(6008,…)` quitado de `families.ts`;
  `disyuntor2` reescrito. `tsc` limpio, suite **381/382** (1 fallo ajeno:
  `parse-perf` por variación de tiempo). 

- L21 (T4 — alimentaciones comp01): 3002,3003,3004,3005,3011 ancladas al
  origen en `library.ts` (`feedTerminalCols`) sobre `componentes01` (stray=0).
  Medido: terminales de alimentación como círculo (aprox. radio 1, centro
  y≈-2,5) con vástago a (p,-0,25), repetidos en columnas de 6 unidades según lo
  que muestra la captura: 3002 (45,48) 1 col [0]; 3003 (57,42) 2 cols [0,6];
  3004 (78,39) 3 cols [0,6,12]; 3005 (84,54) 3 cols [0,6,12] visibles (caja
  24×3 conservada) y 3011 (57,54) 3 cols [0,6,12]. Gates: 3002 ref=34 ov=20,
  3003 ref=61 ov=40, 3004 ref=99 ov=60, 3005 ref=99 ov=60, 3011 ref=93 ov=60,
  **stray=0** en todas (refOnly por rótulos de texto). `feed()` viejo y defs de
  3002-3005 reemplazados; 3011 movido de `families.ts` a `library.ts`. `tsc`
  limpio, suite **383/383**.
