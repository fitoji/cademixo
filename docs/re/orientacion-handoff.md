# Orientación de componentes — handoff para continuar en Windows

> Fecha: 2026-11-20 · Estado: **leer, dibujar y escribir hechos y aceptados**.
> Doc de la feature: `odd/tasks/orientacion-componentes.md` (specs S1-S7, tasks T1-T6, log L1-L12).
>
> **Cierre 2026-11-21:** el bloqueo de escritura quedó resuelto por dos vías que
> se confirman entre sí. La Parte A entregó la tabla real de los 8 slots del 6001
> (`app/samples/rotacion/manual/orientacion-8-variantes.cad`). La Parte B, con
> Ghidra, descompiló los cuatro handlers de la barra de herramientas y mostró que
> `geometry[12..15]` **sí es derivable**: al girar, `(offX, offY, w, h) →
> (−h, offX, −offY, w)`; el espejo horizontal y el vertical tienen sus propias
> fórmulas. El escritor de `model/orientation.ts` las aplica a **cualquier** código
> con bloque de geometría, no sólo a los medidos. Verificado abriendo en CADe un
> 6003 girado por la app: se dibuja y se puede seleccionar.

## 1. Qué quedó hecho

La app lee la orientación de cada componente desde el registro y la dibuja. Aceptado por el
usuario abriendo `app/samples/rotacion/automaticoin.cad`: se ve igual que `automaticoin.png`.

| Pieza | Archivo |
| --- | --- |
| Bitfield y matrices | `app/src/model/transform.ts` |
| Lectura del slot y cajas | `app/src/model/project.ts` (`GEOMETRY.transform`, `CadeRecordModel.transform`, `baseBoxOf`, `boundsOf`) |
| Dibujo | `app/src/ui/SymbolGlyph.tsx`, `app/src/ui/Canvas.tsx` |
| Indicador en Propiedades | `app/src/ui/Inspector.tsx` |
| Tests | `app/test/transform.test.ts` (12) |

Verificación al cerrar: `node --test` 584/584, `tsc --noEmit` y `vite build` en 0, y chequeo
diferencial contra el código anterior sobre los 8 fixtures del corpus sin diferencias cuando no
hay orientación.

## 2. El formato, ya confirmado (no re-investigar)

`geometry[17]` del registro (campo 11 delimitado por `#`, número 18 del bloque de geometría) es
un **bitfield de 3 bits**:

| valor | transformación |
| --- | --- |
| 0 | sin transformar |
| 1 | 90° horario |
| 2 | 180° |
| 3 | 270° horario (90° antihorario) |
| 4 | espejo sobre el eje vertical |
| 5 | espejo + 90° horario |
| 6 | espejo + 180° |
| 7 | espejo + 270° |

`giro = t & 3`, `espejo = (t & 4) !== 0`. **Composición: primero el giro, después el espejo.**

Todo lo demás del registro no cambia entre variantes: cabecera `#-F##1#3#2#4####`, flags 0-7,
`geometry[19] = 1`, cola. `geometry[16]`, `[18]` y `[20..22]` siguen sin semántica confirmada.

## 3. Por qué escribir está bloqueado

Al escribir **sólo** `geometry[17]` CADe_SIMU dibuja la pieza girada pero **no la puede
seleccionar**. Evidencia (sondas `app/samples/rotacion/probes/`):

- `probe-a` pieza 2: `t=1` con la caja base 12×15 → girada **y seleccionable**.
- `probe-a` pieza 3: `t=1` con la caja transpuesta 15×12 → girada pero rota e in-seleccionable.
- `probe-d` piezas 2-4: `t=5`, `t=7`, `t=6` con la caja base → dibujadas bien, in-seleccionables.
- `probe-d` pieza 5: caja 3×12 (la que escribió CADe) con `t=0` → in-seleccionable.

Y las métricas que CADe guarda por variante **no son derivables**: para 6001/6002 la base es
12×15 y aparecen 3×12 (`t=1`), 15×3 (`t=2`), 15×15 (`t=3`) y 15×15 (`t=4`). No es la
transposición ni la caja del dibujo transformado.

## 4. Parte A — la muestra de 8 variantes en CADe (lo más rápido)

Objetivo: obtener de CADe la tabla real de `geometry[12..15]` para las 8 orientaciones de un
mismo componente, y ver si el patrón se puede generalizar o si es tabla por código.

1. Abrir CADe_SIMU (la clave shareware usada antes: `4962`, ver `docs/re/cadesimu-v4-rea.md`).
2. Plano nuevo. Insertar **8 copias del mismo componente**, todas con el mismo código. Sugerido
   `6001` (Automático I) porque ya tenemos su base medida; sirve cualquier otro, pero **uno solo**
   por archivo.
3. Ubicarlas en una fila, separadas ~40 unidades, todas con la misma `y`, de izquierda a derecha
   en este orden: sin transformar · 90° · 180° · 270° · espejo · espejo+90° · espejo+180° ·
   espejo+270°.
4. Aplicar a cada copia lo que corresponda con los comandos de CADe («Girar a la derecha /
   izquierda» y «espejo»). Si el menú no tiene un comando de espejo, usar el que exista y
   anotarlo: el valor esperado de `geometry[17]` es el de la tabla de arriba.
5. **Volver a seleccionar las 8** antes de guardar. Si alguna no se deja seleccionar, anotar cuál.
6. Guardar como `orientacion-8-variantes.cad` y copiarlo a `app/samples/rotacion/manual/`.
7. Anotar al lado, en `orientacion-8-variantes.txt`, qué comando se aplicó a cada posición y si
   alguna quedó in-seleccionable.

Qué hago yo con eso (o cualquiera retomando): leer `geometry[12..15]` y `[17]` de los 8
registros, armar la tabla, buscar la fórmula. Si con un componente alcanza para predecir las 8
cajas, se implementa el escritor. Si no, hay que decidir entre tabla por código (inviable a mano
para 227 códigos) o pasar a la Parte B.

Atajo de inspección, desde la raíz del repo:

```bash
node -e "const fs=require('node:fs');Promise.all([import('./app/src/format/cade.ts'),import('./app/src/model/project.ts')]).then(([f,m])=>{const p=m.buildProject(f.parse(fs.readFileSync(process.argv[1],'latin1')));for(const r of p.records.filter(r=>r.code!==20000)){const g=r.geometry;console.log('id'+r.id,'c'+r.code,'t='+g[17],'off('+g[12]+','+g[13]+')',g[14]+'x'+g[15])}})" app/samples/rotacion/manual/orientacion-8-variantes.cad
```

## 5. Parte B — REA / Ghidra en Windows

Objetivo: saber **quién calcula y escribe** `geometry[12..15]` cuando CADe rota un componente, y
si al cargar un archivo CADe recalcula esos campos a partir de `[17]`.

Datos del target (verificados en este repo):

| Campo | Valor |
| --- | --- |
| Ruta en Windows | `E:\FP SISTEMAS\CADe_SIMU V4\CADe_SIMU.exe` |
| SHA-256 | `a5208930140862dd89bd01b1ee981fe0443235ccc9bf0119e7b2aee8f2fe8e91` |
| Tamaño | 46.833.717 bytes, PE32 x86, MFC 4.2 build debug |
| Copia local (macOS) | `data/CADe_SIMU V4/CADe_SIMU.exe` (gitignored, mismo hash) |
| Análisis previo | `docs/re/cadesimu-v4-rea.md` (identidad, imports, recursos, funciones del serializer) |

Hipótesis a resolver, en orden de valor:

1. ¿Existe una función que, dado `(código, orientación)`, devuelva u escriba los cuatro números?
   Si existe, ¿es una tabla por código o una fórmula sobre la geometría del símbolo?
2. ¿El loader recalcula `[12..15]` desde `[17]`, o los usa tal cual (y por eso un valor
   inconsistente rompe la selección)?
3. Semántica de `geometry[16]`, `[18]`, `[20]`, `[21]`, `[22]` (sólo si el resto queda cerrado).
4. Confirmar el mapeo 0-7 del bitfield dentro del binario (tabla de transformaciones).

Cómo levantar REA en Windows:

```bash
npx -y rea-agents@6.8.0 doctor --json            # qué falta: motor, registro, node
set GHIDRA_INSTALL_DIR=C:\ruta\a\ghidra_12.1.x   # motor de análisis (PE32 x86)
npx -y rea-agents@6.8.0 setup --client <cliente> --dry-run --json   # plan read-only antes de escribir
```

Después de registrar el MCP hay que **reiniciar el cliente** para que aparezcan las herramientas.
Nada de esto se hizo en macOS: allí faltaba Ghidra y el registro MCP, y el binario estaba igual.

Pistas de entrada para el análisis:

- Las funciones del serializer ya identificadas están en `docs/re/cadesimu-v4-rea.md`; conviene
  arrancar por la que arma los registros `#`-delimitados y sigue desde el campo 11.
- Buscar las cadenas `Girar a la derecha` / `Girar a la izquierda` / `espejo horizontal` /
  `Espejo vertical` (`docs/re/cade-resource-strings.txt`, líneas ~610, ~524) para localizar el
  comando de UI y, desde ahí, la rutina que muta el registro.
- Los cuatro números son enteros pequeños (3, 12, 15, 24) con signo: una tabla de bytes o de
  enteros de 32 bits en `.rdata` es el candidato natural si no hay fórmula.

## 6. Cómo retomar

```bash
pnpm install
cd app && node --test        # 584 tests hoy
npx tsc --noEmit && npx vite build
pnpm dev                     # app
```

Docs y memoria:

- `odd/tasks/orientacion-componentes.md` — specs, tasks y log completo con la evidencia.
- `docs/cade-format.md` — gramática del formato.
- `docs/re/cadesimu-v4-rea.md`, `docs/re/traspaso-windows.md` — el análisis previo y la mudanza.
- Engram: `format/orientacion-componentes` (formato y hallazgos), `odd/orientacion-componentes/tasks` (estado), `ui/paleta-buscador` (buscador y dedupe).

## 7. Trampas ya pagadas (no repetirlas)

1. **No tocar `geometry[12..15]`** al rotar: transponer la caja deja la pieza rota e
   in-seleccionable.
2. **Escribir sólo `geometry[17]` no alcanza**: funciona para algunas variantes y rompe otras.
3. **`geometry[17]` no es un contador de instancia**: vale 0 en todo el corpus y `t=6` tiene
   semántica real de dibujo.
4. **La caja del archivo en variantes giradas no es el tamaño de dibujo**: la app dibuja con el
   tamaño canónico del símbolo (`symbolFor(code).size`) cuando hay transformación, porque CADe
   muestra las piezas del mismo tamaño. Con identidad se usa la caja del registro.
5. **Al armar `.cad` de prueba, el bloque de título ocupa `id 5`**: un componente con ese id se
   pierde en `buildProject`. Usar ids 0..4.
6. **Los `.cad` son latin1** (un byte por carácter): leerlos como UTF-8 rompe acentos y el
   round-trip.
7. `agent-browser screenshot` puede devolver un frame cacheado: verificar por DOM antes de creer
   que algo no se renderizó.
