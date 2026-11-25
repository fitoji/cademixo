# Informe: calibración de símbolos de CADe_SIMU

> Fecha: 2026-11-25. Este informe consolida el trabajo de calibración de símbolos, en especial la
> revisión de los automáticos (6001 Automático IN, 6002 Automático II) y la corrección del
> verificador raster. El inventario de códigos está en `docs/re/componentes-completo.md`; el detalle
> histórico por símbolo está en `odd/tasks/cadesimu-*.md` y `odd/tasks/simbolos-anclados.md`.

## 1. Resumen

- Los automáticos 6000/6001/6002/6003/6004/6006/6009 comparten el helper `cadesimuPole`
  (`app/src/symbols/draw.ts`), que dibuja cada polo con cuchilla, guion mecánico y cuadrado de
  disparo.
- El cuadrado de disparo estaba **0,9 unidades abajo** de su posición real. Medido contra dos
  capturas independientes, su centro correcto es `(x−3, +5)`, no `(x−3, +5,9)`.
- El verificador raster (`overlay-diff.ts`) tenía el mapeo por defecto de la captura de PR1
  **6 unidades corrido en Y** (`OY=-138.5` en vez de `-162`). Con el valor viejo, símbolos ya
  calibrados daban `stray≠0`.
- El 6002 (Automático II) dibujaba el cuadrado de disparo **solo en el primer polo**; en PR1 se ve
  uno por polo. Corregido a `tripSquare:'all'`. El 6001 (Automático IN) sí lleva uno solo, como
  muestra `test01.png`.
- Con los arreglos, 6001 y 6002 pasan el gate `stray=0` en sus capturas correspondientes.
- Commit `0f9ae26` (`fix(symbols): place the breaker trip square on the measured centre`), pusheado.

## 2. Método

`app/src/symbols/draw.ts` produce paths en unidades del archivo. El verificador
`.agents/skills/cadesimu-calibration/assets/overlay-diff.ts` los rasteriza con mapping
`px = cad·S + (OX,OY)`, compara con la tinta negra de la captura (`mx<120 && mx-mn<30`) y reporta
`ref`, `sym`, `overlap`, `refOnly`, `symOnly` y `stray`.

El gate es **`stray=0`**: píxeles dibujados que no tienen tinta de referencia a ≤2 px. `refOnly`
esperado son rótulos de bornos y el anillo antialias del trazo.

La posición `ox,oy` del registro se lee de la geometría (`GEOMETRY.x=8`, `GEOMETRY.y=9` en
`app/src/model/project.ts`): el token con más `*` del segmento de geometría, índices 8 y 9.
Para todos los símbolos medidos, `oy` es el `y` del registro (el borne superior) — la regla antigua
`y−12` era falsa y ya se quitó del skill.

## 3. Capturas y mapeos

| Captura | S | OX | OY | Estado |
|---------|---|----|----|--------|
| `docs/cadesimu-svg/reference/PR1_Rodolfo_Giusti_03.png` | 4 | −108 | **−162** | Válida. El default histórico −138.5 está 6 u corrido |
| `data/samples/tests01/test01.png` | 6 | −501 | −193 | Válida (medida en `odd/tasks/simbolos-anclados.md`) |
| `docs/cadesimu-svg/reference/cade-6007-vs-6003.png` | — | — | — | Captura de ventana: sirve para medir **proporciones**, no para el gate |
| `docs/cadesimu-svg/reference/componentes02.png` | — | — | — | **Inválida** para calibración (ver §6) |
| `app/samples/rotacion/automaticoin.png` | — | — | — | Muestra 6001/6002 en varias rotaciones; no hay `.cad` alineado utilizable |

### Error del mapeo de PR1

Con el default anterior (`OY=-138.5`), símbolos ya calibrados fallaban:

| Símbolo | Registro | `stray` con −138.5 | `stray` con −162 |
|---------|----------|--------------------|------------------|
| 3000 | (45,48) | 46 | 0 |
| 3001 | (39,48) | — | 0 |
| 8000 | (66,123) | 228 | 0 |
| 2001 | (183,132) | 460 | 0 |
| 6002 | (39,51) | 367 | 0 |

El origen en píxeles del 2001 confirmado en el task log (`px 624, py 390`) coincide con
`OY=-138.5` solo porque allí el def se midió con ese desplazamiento; con la geometría actual el
mapeo correcto es −162. La consecuencia operativa: cualquier calibración hecha con el default
anterior medía una superposición corrida 6 unidades.

## 4. Revisión de 6001 y 6002

`families.ts` define:

- **6001 `cadesimuBreaker(6001, 2, {w:12,h:15})`**: `anchor:'origin'`, `originPins` en `(0,0)`,
  `(6,0)`, `(0,12)`, `(6,12)`.
- **6002 `protectionDevice(6002, 2, {w:12,h:15}, {cadesimu:true, tripSquare:'first', cadeOrder:true})`**:
  `anchor:'box'`, pines derivados de la caja.

Ambos terminan dibujando el mismo `cadesimuPole` en las mismas coordenadas relativas, así que el
defecto era compartido. La única diferencia real es cómo se declaran los bornes.

### Medición del cuadrado de disparo

| Captura | Símbolo | Registro | Valor viejo (5.9) | Valor corregido (5.0) |
|---------|---------|----------|-------------------|-----------------------|
| `test01.png` | 6001 Automático IN | (111,51) | `stray=47` | **`stray=0`** |
| `PR1` | 6002 Automático II | (39,51) | `stray=14` | **`stray=0`** |

Números completos de la corrida final:

| Símbolo | ref | sym | overlap | refOnly | symOnly | stray |
|---------|-----|-----|---------|---------|---------|-------|
| 6001 | 326 | 641 | 218 | 108 | 423 | 0 |
| 6002 | 221 | 460 | 171 | 50 | 289 | 0 |

`refOnly` corresponde a rótulos y al anillo antialias, como esperado.

### Cuadrado en el segundo polo del 6002

El gate `stray` **no penaliza tinta que falta**: el 6002 pasaba con un solo cuadrado aunque la
captura tiene dos. La evidencia fue el `refOnly`: al dibujar el segundo cuadrado bajó de 65 a 50 y
el `overlap` subió de 151 a 171, sin aparecer `stray`. En `automaticoin.png` el primer ejemplar
(código 6002) también muestra los dos cuadros. El 6001, en cambio, no cambió: en `test01.png` el
segundo polo no lleva cuadro y al añadirlo aparecían 46 píxeles de `stray`.

Lección: para detectar tinta ausente hay que mirar `refOnly` y la captura, no solo `stray`.

## 5. Cambios aplicados

| Archivo | Cambio |
|---------|--------|
| `app/src/symbols/draw.ts` | `tiltedSquare(x−2.95, 5.9, 1.35, 18)` → `tiltedSquare(x−2.95, 5.0, 1.35, 18)`, con la medición documentada |
| `app/src/symbols/families.ts` | 6002 `tripSquare:'first'` → `'all'`; documentación de `cadesimuPole` y del helper |
| `app/test/protection-symbols.test.ts` | 6002 pasa de 1 a 2 cuadros de disparo |
| `app/test/rest-ink.test.ts` | Huella de tinta en reposo regenerada por el cuadro nuevo del 6002 |
| `.agents/skills/cadesimu-calibration/assets/overlay-diff.ts` | `OY` por defecto `−138.5` → `−162` |
| `.agents/skills/cadesimu-calibration/SKILL.md` | Regla del gate: `oy = y del registro`; se elimina `y−12` |

## 6. Hallazgo: `componentes02.png` no es una captura de hoja

El task log `odd/tasks/cadesimu-docs03-calibration.md` declara el mapeo `S=4, OX=-2, OY=-60` para
`componentes02.png` + `componentes02.cad` y afirma que 3000 cierra con `stray=0`. No se sostiene:

- La imagen no tiene **ningún píxel verde** (el marco de la hoja de CADe es verde); PR1 sí lo tiene.
- Probados 9000, 2000, 5000, 8016, 6000, 6001, 6002 y 6003 con ese mapeo: ninguno cae sobre su
  registro (`overlap≈0`, `stray` de cientos).
- El `stray=0` de 3000 era un falso positivo: en una grilla de componentes repetidos, correr 12
  unidades aterriza en otro símbolo igual.

Conclusión: ese PNG es una imagen de paleta/componentes, no una captura alineada con el `.cad`.
La nota «6001/2001 no cierran con ese mapeo» del task log se debe a esto, no a los defs.

## 7. Regresión del resto de códigos que usan `cadesimuPole`

| Código | Uso | Estado |
|--------|-----|--------|
| 6001 | dos polos, cuadro en el primero | Verificado en `test01.png` (`stray=0`) |
| 6002 | dos polos, cuadro en ambos | Verificado en PR1 (`stray=0`, `refOnly=50`) |
| 6003 | tres polos, cuadro en todos | Verificado **por proporción** en `cade-6007-vs-6003.png` |
| 6004 | tres polos + N | Sin captura en el repo; hereda el helper |
| 6000 | un polo, cuadro en todos | Sin cambio de código; no reverificado |
| 6006 | tres polos, sin cuadro | No afectado (no lleva cuadro de disparo) |
| 6009 | tres polos, sin cuadro | No afectado (no lleva cuadro de disparo) |

**Medición del 6003** (captura `cade-6007-vs-6003.png`): los tres polos del ITM están a 30 px,
que son 6 unidades → S=5 px/unidad. El cuadrado queda a ≈−2,9 u en X y a ≈5,0–5,2 u del borne
superior, es decir, el valor corregido. Con 5.9 habría quedado ~0,8 u (4 px) abajo.

No se pudo producir una captura nueva del 6004: `Archivo → Exportar imagen` de CADe exporta solo
la vista visible (en este caso una franja de 792×205) y la automatización MDI se volvió inestable
(ventanas que se maximizan equivocadas, barras que se desacoplan).

## 8. Verificación

- `node --test test/symbol-anchors.test.ts test/symbol-grid.test.ts`: **56/56**.
- Suite completa: **869/870**; el único fallo es `wiring-performance` (`120 previews`), sensible a carga.
- `npx tsc --noEmit`: limpio.
- `node scripts/make-calibration.ts`: regeneró `docs/cadesimu-svg/calibration.html` sin cambios.
- Gate raster: `stray=0` en 3000, 3001, 8000, 2001, 6001 y 6002 con los mapeos de §3.
- Commit `0f9ae26`, pusheado en `main` (rebase sobre dos commits que aparecieron en el remoto).

## 9. Pendientes y riesgos

1. **Captura de 6004**: no hay `.cad` con ese código ni captura asociada; es el único símbolo del
   grupo que no se pudo medir de ninguna forma.
2. **6003 con gate estricto**: verificado por proporción, no con `overlay-diff` (no hay `.cad`
   alineado con `cade-6007-vs-6003.png`).
3. **6000/6006/6009**: comparten el helper; los que no llevan cuadro no se ven afectados, 6000 sí
   y merece una captura.
4. **`componentes02.png`**: dejar de usarla para calibración o reemplazarla por una captura de hoja
   real; corregir el task log.
5. **6007**: sigue bloqueado por falta de `.cad` con ese código (decisión del 13/11/2026).

**Riesgo del cambio**: `cadesimuPole` es compartido por siete códigos. La medición coincidió en dos
capturas independientes (6001 y 6002) y por proporción en una tercera (6003), pero no se verificó
6004 con píxeles.
