# Informe: trabajo sobre cajetín, símbolos y paleta (2026-11-24/25)

> Informe de cierre de las últimas dos sesiones. Consolidado de `docs/reportes/informe-cajetin-cadesimu.md`,
> `docs/reportes/informe-cajetin-ocultamiento-y-guardado.md`, `docs/reportes/informe-calibracion-simbolos.md`,
> `docs/re/cajetin-formato.md` y `docs/re/cajetin-render.md`. Evidencia: binario con Ghidra/REA, GUI real de
> CADe_SIMU V4, fixtures `.cad` y capturas del despliegue.

## 1. Resumen

Se cerró el análisis del cajetín (formato, campos, banderas), se corrigieron dos defectos de calibración de
símbolos, se ordenó la paleta por numeración y se ajustó el tamaño del bloque de título dibujado en el lienzo
para acercarlo al de CADe en A4. Queda una decisión abierta sobre la proporción circuito/cajetín.

## 2. Cajetín: lo que se aprendió

### 2.1 Formato y ubicación

- Vive en dos sitios: registro `20000` (cabecera de hoja) y un trailer al final del archivo:
  `$$$*<11 numéricos>&&&*<10 textos de ancho fijo>*<14 flags>***$$$&&&`.
- Escritor `FUN_00432710` (`0x432710`), armador `FUN_004315f0` (`0x4315f0`), constructor
  `FUN_00408840` (`0x408840`), loader `FUN_0042c290` (`0x42c290`). Direcciones Ghidra con image base
  `0x800000`; VA del PE = dirección − `0x400000`.
- Cuatro format strings: numéricos `0xb4ccf4`, textos `0xb4cca8`, flags `0xb4cc64`, terminador
  `0xb4cc58`.
- El loader parsea carácter por carácter (1 dígito por numérico, anchos fijos 11/25/21 en los textos).

### 2.2 Los 11 numéricos

| Campo | Offset | Significado |
|-------|--------|-------------|
| 1 | `+0x88` | formato (0 A4 Vertical, 1 A4 Horizontal, 2 A3 F1, 3 A3 F2, 4 Personalizado) |
| 2 | `+0x8c` | contorno |
| 3 | `+0xa4` | visualizar referenciado |
| 4 | `+0x90` | **cajetín**: 0 Ninguno, 1 Cajetín 1, 2 Cajetín 2 |
| 5 | `+0x58` (double) | zoom |
| 6 | `+0xa0` | orientación del referenciado (0 Horizontal, 1 Vertical) |
| 7 | `+0x80` | rejilla |
| 8 | `+0xa8` | conexiones símbolo |
| 9 | `+0xac` | número de cable |
| 10 | `+0xc4` | alto de página (279) |
| 11 | `+0xc0` | ancho de página (210) |

Corrección clave: el campo 1 **no** es el número de hoja; la hoja está en los textos 8/9 (`"%s de %s"`).
Los 11 se verificaron en los dos sentidos (cambiar la opción en GUI y ver el campo, e inyectar el campo y
ver la opción). Defaults del constructor: `1,1,1,2,2.0,0,1,0,0,279,210`.

### 2.3 Los 14 flags

- `flags[0..6]` = visibilidad de Dibujado, Comprobado, Entidad, Título, Fecha, Número, Archivo.
- `flags[7..13]` = alineación de esas filas (`0` Izq, `1` Cen, `2` Der).
- Son **de sólo escritura** en CADe: se escriben al aceptar el diálogo pero no se leen al abrir (el diálogo
  arranca con estado interno) ni afectan el dibujo o la impresión (verificado con 5 archivos y vista previa).
- El loader guarda solo 13 de 14 (nunca escribe `+0x108`).
- Nuestro editor los lee tal como están: es la única forma de no perder información.

### 2.4 Ocultar y guardar

- CADe oculta el bloque con el **campo 4 = 0** («Cajetín: Ninguno» de `Archivo → Configuración`), no con
  los flags. Evidencia: `arranque-paro-motor-3f.cad` (campo 4 = 2) contra
  `arranque-paro-motor-3fcajetinoculto` (campo 4 = 0), con textos y flags intactos.
- Al guardar, CADe reescribe el trailer desde su estado interno: cambia contorno, zoom y el texto «Archivo»
  (se regenera del nombre guardado); puede emitir 10 o 12 tokens de texto; descarta registros desconocidos
  (gate T3, de ahí el sidecar de atajos).
- `config.cfg` es otro archivo, con formato propio (`CADe_SIMU*%1d…*%0.4f…*%4d$$$`, `0xb6f550`).

### 2.5 Implementación en la app

- `app/src/model/title-block.ts`: parser/editor que reescribe solo los tokens del trailer, preserva el
  resto byte a byte, acepta 10 y 12 tokens y expone lectores para los 11 numéricos.
- `app/src/editor/state.ts`: `setTitleBlock` pasa por `commit` → entra al undo/redo.
- `app/src/ui/TitleBlockDialog.tsx` + menú `Editar → Cajetín`: 7 filas con check, alineación y campos.
- `app/src/model/title-block-layout.ts` + `TitleBlockLayer.tsx`: bloque dibujado en el lienzo, con
  geometría medida (ver §4).

## 3. Calibración de símbolos

- Verificador `overlay-diff.ts`: gate `stray=0`. **No penaliza tinta que falta** (`refOnly`): por eso un
  cuadrado ausente pasó inadvertido.
- Mapeo correcto de `PR1_Rodolfo_Giusti_03.png`: `S=4, OX=-108, OY=-162`. El default histórico `-138.5`
  estaba 6 unidades corrido (3000/3001/8000/2001 daban `stray≠0`; con `-162` dan 0).
- `test01.png`: `S=6, OX=-501, OY=-193`.
- `componentes02.png` **no es una captura de hoja** (sin marco verde; ningún símbolo cae en su registro
  con el mapeo del task log). El `stray=0` de 3000 era un falso positivo de una grilla de símbolos repetidos.
- `cadesimuPole`: centro del cuadrado de disparo en `(x−3, +5)`, no `+5,9` (stray 47→0 en 6001, 14→0 en
  6002).
- 6001 (Automático IN): cuadro solo en el primer polo (`test01.png`). 6002 (Automático II): cuadro en
  **los dos** polos (PR1: `refOnly` 65→50, `overlap` 151→171). 6003 medido por proporción en
  `cade-6007-vs-6003.png`. 6004 sin captura.
- Paleta: los grupos ahora se ordenan por código (`6000, 6001, 6002, 6003…`) mediante `groupSymbols()` en
  `palette-order.ts`; favoritos, recientes y búsqueda conservan su orden.

## 4. Tamaño del cajetín en el lienzo (A4)

| Cajetín | Geometría medida | Posición |
|---------|------------------|----------|
| 2 | 207 × 42 (7 filas de 6), columnas `0/30/60/90/120/156/207` | abajo a la izquierda, margen 3 |
| 1 | 207 × 36, filas `6/6/6/9/9`, columnas `0/30/60/90/156/207` | abajo a la derecha |

Medición: en pantalla a 5 px/unidad las divisiones caen cada 150 px (=30 u) y las filas cada 30 px (=6 u).
Fixture nuevo: `app/test/fixtures/cajetin1-medido.cad`.

Desviación conocida: CADe ignora los flags y muestra 2–3 filas en estos archivos; nuestra app respeta los
flags y dibuja las 7, así que el bloque es más alto y puede acercarse al circuito.

## 5. Decisión abierta (no implementada)

En `motor_con_inversion_giro.cad` el circuito llega a `y≈192` y la hoja mide 210: quedan 18 unidades libres.
Con 7 filas visibles el bloque de 42 unidades arranca en `y≈165` y se superpone con el circuito (lo muestra
`app/samples/captura_dom.png`). Dos caminos planteados:

1. Escalar el circuito al ~75 % de forma uniforme (componentes y cables) para liberar espacio abajo.
2. Agrandar la hoja virtual (por ejemplo 279 × 240) manteniendo el circuito a escala 1.

Recomendación: la opción 1, porque conserva el tamaño de página del `.cad` y la transformación uniforme no
rompe bornes ni cables. **Pendiente de aprobación del usuario.**

## 6. Commits principales

| Commit | Contenido |
|--------|-----------|
| `a137cbb`, `6120456` | modelo/parser del cajetín y diálogo en el menú |
| `3e3b521`, `96917a4` | los 11 numéricos mapeados y acceso tipado |
| `8ec20f0`, `ef77d05`, `6fc77f9`, `62748d3` | flags de sólo escritura, loader de 13, dibujo ignorado |
| `91ba583`, `28b4d51`, `4afb388` | informes y anexo técnico |
| `0f9ae26` | cuadrado de disparo en su centro medido |
| `10ac95e` (→ `b0c1aad` rebaseado) | segundo cuadrado del 6002 |
| `69f458f` | orden numérico de la paleta |
| `cf8e89c`, `df817b0` | fixture del cajetín oculto e informe |
| `1f03067`, `beab367` | tamaño del cajetín 2 y geometría del 1 |

## 7. Verificación

- `tsc --noEmit`: limpio.
- Suite completa: en el último ciclo **907/908**; el único fallo es `wiring-performance`, sensible a carga.
- Unitarios del cajetín: 10/10. De layout: 18/18. De símbolos: 56/56. De paleta: 11/11.
- E2E `title-block.spec.ts`: 3/3.
- Gates raster: `stray=0` en 6001, 6002, 3000, 3001, 8000 y 2001.
- `main == origin/main` al cerrar; working tree limpio salvo la captura `app/samples/captura_dom.png`.

## 8. Pendientes

1. Decisión circuito/cajetín (§5).
2. Captura con 6004 para medirlo; 6003 solo verificado por proporción.
3. Variante de 12 tokens: regla exacta que la dispara.
4. Registro `20000` (24 numéricos) y multi-hoja (qué trailer manda).
5. Fecha: formato, meses localizados y validación.
6. Importar cajetín desde otro archivo (UI no implementada).
