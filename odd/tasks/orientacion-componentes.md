# Orientación de componentes: giro y espejo leídos del archivo y persistidos

Un solo símbolo por código. La transformación de cada componente vive en el registro
(`geometry[17]`), no en el estado visual del editor. Objetivo del usuario: abrir un
`.cad` con piezas giradas y verlas giradas, y que lo que se rote acá quede guardado
sin romper la compatibilidad con CADe_SIMU.

## Specs

S1. Al abrir un archivo guardado por CADe_SIMU, cada componente se dibuja con la
transformación guardada en su registro. Hoy abren todos derechos: «si lo abro en
nuestra app se ven los 5 automatico pero sin leer los valores de rotaciones».

S2. El campo es `geometry[17]` (campo 11 del registro, número 18 del bloque de
geometría) y se interpreta como bitfield de 3 bits: `giro = t & 3` con 0 = 0°,
1 = 90° horario, 2 = 180°, 3 = 270° horario; `espejo = (t & 4) !== 0`, espejo sobre
el eje vertical (izquierda↔derecha). La composición es **primero el giro, después el
espejo**: `p' = Mx( R90(giro) · p )`. Con `t = 5` el resultado es la reflexión sobre
la diagonal principal y con `t = 7` sobre la antihiagonal.

S3. **BLOQUEADA — no se escribe `geometry[17]` hasta conocer las métricas.** Escribir
sólo `geometry[17]` no alcanza: con la caja base 12×15, CADe dibuja giradas las
variantes 5, 6 y 7 pero las deja **in-seleccionables**, y una pieza con la caja
girada por CADe (3×12) y `t=0` también queda in-seleccionable (L9). Las métricas de
`geometry[12..15]` que CADe guarda por variante (12×15 → 3×12 / 15×3 / 15×15) no son
derivables del dibujo, así que hoy no sabemos escribir una transformación que CADe
acepte. Mientras tanto: leer y dibujar sí, escribir no. Lo que se rote en la app
sigue sin persistirse, y el registro se preserva intacto.

S4. Todo lo demás del registro se preserva byte a byte: cabecera, nombres de bornes en
su orden, flags, resto de la geometría y el bloque de título. Un archivo sin
transformaciones se guarda idéntico.

S5. El editor ofrece girar 90° (ya existe: tecla `R` y menú «Rotar 90°») y espejar,
ambos sobre la selección, y ambos persistentes al guardar.

S6. Lo que dice el archivo manda: no queda rotación «sólo de pantalla». Al cargar un
documento, la orientación de cada componente sale del registro y punto.

S7. Ningún cambio de comportamiento para archivos sin `geo[17]` distinto de cero: los
fixtures y planos existentes siguen abriendo y guardando igual.

## Tasks

| ID | Qué | Ruta | Commit |
| --- | --- | --- | --- |
| T1 | Modelo: leer `geometry[17]` a `transform` por registro (`app/src/model/transform.ts` + `project.ts`). **Hecho**, sin escritor del slot. | modelo | sin commit |
| T2 | Editor: la orientación nace del registro; escribir el slot queda **bloqueado por S3**. | editor | bloqueada |
| T3 | Render: giro + espejo compuestos en el glifo, con caja canónica cuando hay transformación. **Hecho**. | ui | sin commit |
| T4 | Caja e hit-test: `boundsOf`/hitbox sobre el dibujo transformado. **Hecho**. | editor/ui | sin commit |
| T5 | Indicador «Orientación» en Propiedades. **Hecho**. Girar/espejar persistiendo: bloqueado por S3. | ui | parcial |
| T6 | Tests que asumían rotación sólo visual (`compat.test.ts`, `editor.test.ts`): actualizados a que la capa visual no altera `record.transform`; escribir el slot sigue sin existir. | tests | sin commit |

## Log

L1 (pedido original, verbatim): «con respecto a tu hallazgo de las dos definiciones por codigo, es porque cadesimu no permite rotar componentes, asi que como podriamos hacer aqui para tener un solo componente, pero al cambiar su rotacion se guarde manteniendo compatibilidad de cadesimu y a la vez limpiar nuestra barra de componentes con componentes dobles, entiendes?»

L2 (evidencia, muestra del usuario): `app/samples/rotacion/automaticoin.cad` + `automaticoin.png`. Cinco automáticos con `geometry[17]` = 0,1,2,3,4 en el orden de la captura. Diff contra 8 `.cad`/`.cade` del repo: sólo cambian `x`, `y`, `geometry[12..15]` y `geometry[17]`; `geo[17]` vale 0 en todos los componentes del resto del corpus (ids hasta 41, así que no es un contador de instancia).

L3 (evidencia, cajas de CADe para las variantes): 12×15 base → 3×12 (t=1), 15×3 (t=2), 15×15 (t=3), 15×15 (t=4). No es transposición: son métricas internas por variante.

L4 (sonda `probe-c-valor-6.cad`, respuesta del usuario, verbatim): «en C: la segunda rotada 180grados y espejada y la tercera rotada 90 grados» → `t = 6` tiene semántica (180 + espejo), así que el dominio es un bitfield y no un enum 0..4 ni un contador.

L5 (sonda `probe-a-giro-solo-17.cad`, respuesta del usuario, verbatim): «en A, la pieza 2 sale girada y la tercera tambien girada pero queda como rota, no puedo seleccionarla, la cuarta se mantiene como la primera.» Pieza 2 = `t=1` con la caja 12×15 intacta → girada y seleccionable (de ahí S3). Pieza 3 = `t=1` con caja transpuesta 15×12 → rota e in-seleccionable (de ahí la prohibición de tocar la caja).

L6 (sondas `probe-b`/`probe-d`, respuesta del usuario, verbatim): «en B: segunda y tercera en espejo. […] la primera normal, la segunda giro a la izquierda y espejo vertical, la tercera giro izquierda espejo horizontal, la cuarta espejo horizontal, y quinta normal». Mapeo: t=4 espejo; t=5 diagonal principal; t=6 espejo (giro 180 + espejo); t=7 antihiagonal; `t=0` sobre una caja girada por CADe (3×12) se dibuja normal y seleccionable, así que des-rotar escribiendo sólo `geo[17]` es seguro.

L7 (decisión): P1 (limpiar los dobles de la paleta) ya se hizo y quedó cerrado antes de esta feature: 6000, 6002, 6003, 6007 y 6009 tenían dos definiciones y se borró la vieja; la paleta dibuja 227 códigos sin repetir.

L8 (fuera de alcance, anotado): `geo[16]`, `geo[18]`, `geo[20..22]` siguen sin semántica confirmada; no se tocan.

L9 (sonda `probe-d-espejo-girado.cad`, respuesta del usuario, verbatim): «la 2, 3, 4 y 5 no puedo seleccionarlas estan rotas». Piezas: t=5, t=7, t=6 (las tres con la caja 12×15 sin tocar) y t=0 con la caja 3×12 que había escrito CADe. **Corrige L5/L6**: que la pieza 2 de `probe-a` (t=1 con caja base) fuera seleccionable fue un caso aislado, no una regla. Escribir `geo[17]` sin las métricas correctas deja el componente in-seleccionable en CADe, y las métricas no se deducen del dibujo (12×15 → 3×12 no es una transposición). Consecuencia: la escritura queda bloqueada hasta obtener la tabla real de CADe para las 8 variantes, o hasta revertir el escritor con REA/Ghidra.

L10 (aceptación del usuario, verbatim): «probe automaticoin.cad y va bien ,se ve en la app como el png». Cierra S1: el archivo con cinco piezas en orientaciones 0,1,2,3 y 4 se dibuja en la app igual que en CADe_SIMU. Verificado en paralelo por tests (584/584, `tsc` y `vite build` en 0) y por chequeo diferencial contra el código anterior sobre los 8 fixtures del corpus: sin transformación, el comportamiento es idéntico.

L11 (regla de dibujo, corregida durante la implementación): con transformación distinta de la identidad el símbolo se dibuja y se mide con su tamaño **canónico** (`symbolFor(code).size`), no con `geometry[14..15]`. La primera versión escalaba a la caja del archivo y la pieza `t=1` salía aplastada a 3 de ancho; la captura muestra las cinco del mismo tamaño. Con identidad se sigue usando la caja del registro.

L12 (pendiente cosmético, decisión de mínimo cambio): el espejo espeja también los rótulos internos del símbolo (`M`, `3~`), y el designador y los rótulos de borne no rotan con la pieza (esto último ya pasaba con la rotación visual previa).
