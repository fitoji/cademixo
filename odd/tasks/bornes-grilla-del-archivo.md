# bornes-grilla-del-archivo — Los bornes son los del `.cad`; el dibujo se mueve para encajar

Feature: para los pulsadores (8000-8005) los bornes quedan exactamente donde
los pone el archivo de CADe_SIMU (filas 0 y 12 del registro) y **la tinta se
desplaza** para que los ramales lleguen a esos bornes. Reemplaza la decisión de
`cadesimu-pulsadores` S7 y la de `simulacion-dos-estados` T2 en lo que respecta
a la posición de los bornes.

## Specs

- S1 (pedido verbatim): "yo quiero mantener 100 % compatibilidad con cadesimu,
  creo que los bornes tiene que quedar donde dice el archivo de cadesimu y
  mover los dibujos para que encajen con los bornes".
- S2 (bornes): 8000 → 13 (0,0), 14 (0,12); 8001 → 11 (0,0), 12 (0,12);
  8002 → 11 (0,0), 13 (9,0), 12 (0,12), 14 (9,12); 8003 → 11 (3,0), 12 (0,12),
  14 (6,12); 8004 → 13 (0,0), 14 (0,12); 8005 → 11 (0,0), 12 (0,12). Son las
  filas del registro, no las puntas de la tinta.
- S3 (tinta): la tinta de los seis defs se corre +6 en `y` (formas y pivotes de
  cuchilla) y el extremo del ramal inferior se estira hasta `y = 12`, para que
  el borne caiga **sobre** la tinta en los dos extremos. El resto de la
  geometría no cambia de forma.
- S4 (invariante): todo borne declarado sigue cayendo sobre la tinta del
  símbolo (el test de `symbol-anchors` se mantiene y ahora se cumple con los
  bornes en 0/12).
- S5 (costo declarado): con la tinta corrida +6, estos seis símbolos **dejan de
  coincidir con la captura** de CADe, que los dibuja centrados en el origen del
  registro. El gate raster con `oy = y_registro − 6` tiene que seguir dando
  `stray = 0`, lo que prueba que la forma no cambió: sólo se desplazó.
- S6 (sin colaterales): ningún otro símbolo se toca. El `rest-ink` se regenera
  sólo para estos seis.

## Tasks

- T1 (S2, S3): mover los bornes de 8002-8005 a la grilla y correr la tinta +6
  con el ramal inferior hasta 12. Route: delegado. DONE — traslación pura +6 más
  8 ramales inferiores estirados 0,25 hasta `y = 12`.
- T2 (S4): actualizar `symbol-anchors` (bornes y bbox) y regenerar el hash de
  `rest-ink`. Route: delegado. DONE — hash nuevo
  `d41a4673bb92f4bed92e0e2648ba297dee3a9e008fd320a9c73ade739ec74e06`; también
  hubo que mover 6 coordenadas del 8003 en `blade-pose` (mismos giros).
- T3 (S5): evidencia raster con `oy = y − 6` para los seis. Route: inline. DONE
  — los seis dan `stray = 0`, y el control con la geometría base da los mismos
  `ref/overlap/refOnly` (sólo crece `sym` 6 px por los ramales estirados): la
  forma no cambió, se desplazó.
- T4 (S6, T3): verificación integral y cierre. Route: inline. DONE — suite
  471/471, `tsc` limpio, `vite build` OK, diferencial de tinta 6 de 232 códigos
  (sólo 8000-8005).

## Log

- L1: pedido verbatim: "yo quiero mantener 100 % compatibilidad con cadesimu,
  creo que los bornes tiene que quedar donde dice el archivo de cadesimu y mover
  los dibujos para que encajen con los bornes".
- L2: contexto. `ebbc056` había movido los bornes de 8002-8005 de las filas
  0/12 a las puntas de la tinta (−6 y 5,75) porque la captura dibuja la tinta
  centrada en el origen del registro y los rótulos de borne en el extremo del
  ramal. El usuario ahora prioriza lo contrario: que los bornes sean los del
  archivo, aunque el dibujo deje de coincidir con la captura en esos seis
  símbolos. Es una decisión de producto, no una regresión inadvertida.
- L3: el conflicto es del formato de CADe: la tinta se dibuja centrada en el
  origen del registro y los cables se guardan en las filas 0 y 12. No hay
  posición de tinta que satisfaga las dos cosas a la vez; se elige la grilla del
  archivo y se paga con 6 unidades de diferencia contra la captura.
- L4: resultado: los seis pulsadores tienen ahora los bornes en las filas del
  registro y la tinta corrida +6, con el ramal inferior llegando a `y = 12` para
  que el borne caiga sobre la tinta (S4). El invariante se cumple con 0/12 y el
  hash de `rest-ink` quedó regenerado. Evidencia de que sólo se desplazó: el
  raster con `oy = y − 6` da los mismos `ref/overlap/refOnly` que la geometría
  original con `oy = y`, y `stray = 0` en los seis.
- L5: costo aceptado y visible: en el lienzo los seis pulsadores se dibujan 6
  unidades más abajo de donde los dibuja CADe, a cambio de que los cables del
  archivo (que se guardan en las filas 0 y 12) encajen con los bornes. Es la
  decisión de S1, no un efecto accidental.
- L6: extensión al 2001 (contactor de potencia) y a la familia de bobinas.
  El usuario reportó el mismo defecto que en los pulsadores: el 2001 dibujaba
  los ramales de −6 a +6 con bornes en 0/12, y el 9000 una conductora de −5,875
  a +5,875 con el mismo par de bornes. Se aplicó la regla de S1: bornes donde
  dice el archivo y tinta corrida +6 para llegar a ellos, con el ramal inferior
  cerrando en `y = 12`. Como 7016 y 9003 comparten el def base `coil`, el
  arreglo los cubrió de arrastre.
- L7: barrido de control sobre los 232 símbolos con `anchor: 'origin'`: después
  del cambio quedan **6** con algún borne fuera de la tinta, y no son todos el
  mismo caso. 5000/5002: sólo el borne inferior queda 0,25 afuera (la tinta
  termina en 11,75), es alargar el ramal. 5001/5003: la tinta va de −6 a −0,25,
  o sea que los bornes de las filas 0 y 12 no tienen tinta cerca: falta medir y
  dibujar los terminales inferiores (ya estaba anotado como refOnly en
  `cadesimu-docs03-calibration`). 8017: la tinta va de −12 a −0,25 con bornes en
  0/12. 9004: la tinta va de 3 a 13,8 con bornes en 0/12. Los cuatro casos que
  quedan necesitan medición propia, no un corrimiento mecánico.
- L8: Grupo 1 (trivial) cerrado. 5000 y 5002 estiran su ramal inferior 0,25
  —de 11,75 a 12— para que los bornes 2 (y 4) caigan sobre la tinta; nada más
  cambia. Gate comp02 sin tocar el `oy`: 5000 (15,57) ref=133 sym=214 ov=73
  refOnly=60 **stray=0**; 5002 (54,57) ref=266 sym=428 ov=146 refOnly=120
  **stray=0** (sólo crece `sym`, 3 y 6 px, por el tramo agregado). Hallazgo
  anotado también en el comentario del def: ese último tramo coincide con la
  tinta que la captura dibuja en la banda del registro vecino —6000 en (15,78)
  y 6002 en (54,78), banda 66..77,75—, así que el `stray=0` del gate NO prueba
  que el tramo sea propio; se estira igual porque el borne está en la fila 12.
- L9: Grupo 2, medido símbolo por símbolo sobre `componentes02.png`
  (S=4, OX=−2, OY=−60) contra la posición del registro en `componentes02.cad`.
  Medición común: los tres se dibujan enteros en las 12 unidades POR ENCIMA de
  la fila del registro (banda `y` −12..−0,25), no entre las filas 0 y 12 como
  los pulsadores. Decisión **resolved** para los tres: traslación pura +12 en
  `y` (los bornes del archivo son las filas 0 y 12) más el último ramal
  estirado 0,25 para cerrar en la fila inferior; el gate se re-corre con
  `oy = y_registro − 12` y vuelve a dar `stray = 0`, lo que prueba que la forma
  no cambió, sólo se desplazó.
  - 5001 (registro 30,54 → gate con `oy = 42`): ref=187 sym=520 overlap=177
    refOnly=10 **stray=0**. Conductores corridos +12 (ahora en x −5,75 y 0,25,
    de 0 a 12) y cuerpo medido, completado con la barra superior que la captura
    sí dibuja (refOnly 35 → 10).
  - 5003 (registro 72,57 → gate con `oy = 45`): ref=361 sym=1011 overlap=345
    refOnly=16 **stray=0**. Ídem por polo: conductor `x+0,25` de 0 a 12 y cuerpo
    `x−1,25 .. x+1,5` con barras en 3 y 9 (refOnly 73 → 16).
  - 8017 (registro 138,117 → gate con `oy = 105`): ref=136 sym=471 overlap=132
    refOnly=4 **stray=0**. Traslación exacta: el `overlap` es el mismo 132 que
    con `oy = 117` y `dy = 0`. `PALETA_TERMICO.py` pasa de −8,25 a 3,75 para
    que la paleta gire sobre el mismo pivote de la barra fija.
  - 9004: **blocked**, sin tocar. No hay registro suyo en `componentes02.cad`,
    en `componentes01` ni en `PR1_Rodolfo_Giusti_03.cad`, y las capturas de
    docs/03 no lo traen: no existe referencia contra la que medir, así que
    ninguna posición de tinta se puede probar con el gate. Además sus bornes
    A1/A2 vienen heredados del spread de `coil`, no de un registro, y su caja
    genérica (3..12 × 3..12,9) no alcanza (0,0)/(0,12) sin dibujar un conductor
    que ninguna referencia muestra. Se retoma si aparece una captura del
    temporizador.
  - Barrido de control (232 códigos, `anchor === 'origin'`, cada borne contra
    `shapesBounds`): de **6** a **1**, y el que queda es el 9004 bloqueado.
    Diferencial de tinta base-vs-árbol: 5 de 232 códigos cambiados (5000, 5002,
    5001, 5003, 8017); el 9004 no aparece. Hash nuevo de `rest-ink`:
    `5d1b1d68c92439b801a5cfcc19f6ffca289e60b548cc9db37ffd8b57f95d90ac`.
- L10: 5000 y 5002 completan la regla de L9. El L8 sólo estiró el ramal inferior
  0,25 y dejó la tinta medida en la banda −12..−0,25, así que el cuerpo se
  dibujaba una fila arriba del origen del registro con 9,25u de hueco: por eso
  seguían viéndose rotos con el anclaje ya hecho. Ahora la tinta va corrida +12
  en `y` y cada polo lleva conductor continuo de 0 a 12. Gate comp02 con
  `oy = y_registro − 12`: 5000 (15,45) **stray=0** y 5002 (54,45) **stray=0**;
  en la fila cruda `oy=57` el 5000 da `stray=271`, que es la prueba del
  desplazamiento. La frase de L7 («sólo el borne inferior queda 0,25 afuera»)
  queda superada. Hash nuevo de `rest-ink`:
  `ec11f4cfb09a3023afb7a4cbc8cad3a30491a297a4e6992c4e097095717213db`.
