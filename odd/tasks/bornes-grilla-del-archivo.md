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
