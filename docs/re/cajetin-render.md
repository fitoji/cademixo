# Render del cajetín en el canvas

> Anexo de `docs/reportes/informe-cajetin-cadesimu.md` (auditoría) y `docs/re/cajetin-formato.md`
> (formato del trailer). Acá va la geometría disponible y el plan para dibujar el bloque
> de título en el lienzo.

## Alcance

- **Formato**: A4 horizontal (`formato = 1`) con **cajetín 2** (`cajetin = 2`).
- **Sólo lectura en el canvas**: la edición sigue en `Editar → Cajetín`.
- Fuera de alcance: A3, cajetín 1, multi-hoja y calco exacto de CADe.
- `contorno` y `referenciado` se leen del documento (`TITLE_NUMERIC_INDEX`), no de la UI.

## Lo que ya está resuelto

| Pieza | Dónde |
| --- | --- |
| Textos, flags, formato, contorno, referenciado, tamaño de página | `app/src/model/title-block.ts` |
| Edición del bloque | `app/src/ui/TitleBlockDialog.tsx` |
| Coordenadas del plano | `Canvas` trabaja en unidades del documento |

Los componentes de los fixtures viven en `[0..279] × [0..210]`, así que la página útil es
**279 de ancho × 210 de alto**, en milímetros y con **y hacia abajo**. Los labels
`alto`/`ancho` del modelo están invertidos respecto de esa convención: `alto = 279` es el
ancho. No hace falta corregirlos para dibujar, pero sí tenerlo presente.

`parseTitleBlock` devuelve **el último** trailer del archivo. Con una hoja por documento
eso es correcto; para multi-hoja hay que cambiar el parser (ver *Pendientes*).

## Evidencia extraída del binario

`FUN_00854d30` (VA `0x854d30`, 7.945 bytes) es el dibujante del cajetín 2. Contiene
**19 `CDC::TextOut` y ninguna llamada de línea o rectángulo**: este método sólo escribe
texto. Las líneas del marco van en otro lado.

Datos confirmados por lectura directa del código:

- **Fuente**: `Arial`, alto `20.0 × doc[0x58]` (constante en `0xb4c7e0`).
- **Escala y pan**: cada coordenada se multiplica por `doc[0x58]` y se le suma `doc[0xc8]`
  (x) o `doc[0xcc]` (y). Son las mismas cuentas que usan los componentes.
- **Alineación**: `0 = izquierda`, `1 = centro`, `2 = derecha` (`Ordinal_4884`), y cada
  celda define el trío de anclas. Por ejemplo `33 / 45 / 57` es una celda de 24 unidades
  que va de 33 a 57.
- **Idioma**: `DAT_00bd9580` → `0` español, `1` inglés, `2` italiano, `3` francés,
  `4` portugués. Tabla completa de rótulos:

| Campo | Español | Inglés | Italiano | Francés | Portugués |
| --- | --- | --- | --- | --- | --- |
| Fecha | Fecha | Date | Data | Date | Data |
| Nombre | Nombre | Name | Nome | Nom | Nome |
| Firmas | Firmas | Signature | Azienda | Signatures | Assinaturas |
| Dibujado | Dibujado | Drawn | Disegnato | *(sin rótulo)* | Desenhado |
| Comprobado | Comprobado | Drawn | Verificato | *(sin rótulo)* | Verificado |
| Entidad | Entidad | Designed by | *(sin rótulo)* | *(sin rótulo)* | Entidade |
| Título | *(sin rótulo)* | Title | Titolo | Titre | *(sin rótulo)* |
| Fecha: | Fecha: | Date: | Data: | Date: | Data: |
| Número | *(sin rótulo)* | Page: | Num: | Num: | Num: |
| Archivo: | Archivo: | File: | File: | Archives: | Arquivo: |

- **Coordenadas de texto** relativas al origen del bloque (unidades del documento):

  - `x`: `0, 3, 15, 27, 30, 33, 45, 57, 60, 63, 73, 76, 87, 90, 120, 123, 124, 156, 159, 164, 170, 185, 200, 204, 207`
  - `y` (línea base): `2, 6, 8, 12, 14, 18, 20, 21, 26, 27, 30, 36`
  - El bloque mide **207 de ancho**; las divisiones verticales caen en
    `0 / 30 / 60 / 90 / 120 / 156 / 207`.

- **Filas y flags**: las 7 filas del diálogo comparten visibilidad y alineación
  (`doc+0x104..0x11c` y `doc+0x120..0x138`). `Dibujado 1/2` y `Comprobado 1/2` usan el
  mismo flag de fila y se dibujan en dos posiciones distintas.

### Lo que falta: el marco

El marco, las líneas de celda y el referenciado **no están en `FUN_00854d30`**. Se dibujan
inline en `FUN_0040d2b0` (`OnDraw`, 0x40d2b0), que en esta sesión Ghidra no pudo
descompilar (*"Response buffer size exceeded"*).

`OnDraw` llama al cajetín desde **6 sitios** con orígenes distintos:

| Sitio | Constantes empujadas | Guarda |
| --- | --- | --- |
| `0x40ecb2` | `0x129` (297), `0x18` (24) | `doc[0x90] == 1` |
| `0x40ecdc` | `0x129` (297), `0x18` (24) | `doc[0x90] == 2` |
| `0x40fa12` | `0xc3` (195), `0x7e` (126) | `doc[0x90] == 1` |
| `0x4107c0` | `0x126` (294), `0x102` (258) | `doc[0x90] == 1` |
| `0x411574` | `0x126` (294), `0x102` (258) | `doc[0x90] == 1` |
| `0x412332` | `X - 0x27` (39), `Y - 0xd2` (210) | — |

`297` y `210` son las medidas de A4 en milímetros, así que al menos un par de estos sitios
corresponde a impresión o vista previa (página vertical de 210 × 297) y el bloque se ubica
en `(24, 297)`, es decir abajo a la izquierda de esa página, para luego rotarse. **Cuál de
los seis es el de pantalla no está resuelto**, y con una página de 279 × 210 las parejas
`(24, 297)` o `(294, 258)` no encajan como `(x, y)` directos.

Conclusión: la posición exacta y las líneas del marco requieren una medición aparte
(anexo al final). **No se van a inventar como si fueran dato del binario.**

## Decisión: feature propia

Fidelidad exacta no es requisito del producto y su costo es alto. Se adopta esta regla:

| Se copia de CADe | Se diseña propio |
| --- | --- |
| Contenido y orden de las filas | Grosor y estilo de las líneas |
| Rótulos en español | Alturas exactas de cada celda |
| Alineación por campo (izq/centro/der) | Tipografía y tamaño |
| Idea del marco doble + referenciado | Ubicación exacta del bloque |
| Semántica de `contorno` / `referenciado` | Colores (tokens del tema) |

Geometría propuesta (unidades del documento, origen del bloque abajo a la derecha de la
página útil):

- Marco exterior `0,0 → 279,210`; marco interior con margen `10`.
- Franja de referenciado de `10` de ancho entre ambos marcos; columnas de `50` rotuladas
  `A`, `B`, `C`… y filas rotuladas `1`, `2`, `3`… desde arriba.
- Bloque de título: `207 × 42`, pegado a la esquina inferior derecha del marco interior
  (`x = 279 - 10 - 207 = 62`, `y = 210 - 10 - 42 = 158`).
- Filas de `6` de alto, en el orden del diálogo: Dibujado, Comprobado, Entidad, Título,
  Fecha, Número, Archivo.

Estos números son **propuesta**, no evidencia; el gate visual de la Fase 4 los ajusta.

## Implementación

### Fase 1 — Layout puro (`app/src/model/title-block-layout.ts`)

```ts
export interface Rect { x: number; y: number; w: number; h: number }
export interface Line { x1: number; y1: number; x2: number; y2: number; weight: 1 | 2 }
export interface Cell {
  rect: Rect;
  align: 0 | 1 | 2;
  text: string;
  caption?: string;
  emphasis: boolean;
}
export interface SheetLabel { text: string; x: number; y: number; anchor: 'start' | 'middle' }
export interface SheetLayout {
  page: { width: number; height: number };
  lines: Line[];
  cells: Cell[];
  labels: SheetLabel[];
}

export function titleBlockLayout(block: TitleBlock | null): SheetLayout | null;
```

- Devuelve `null` sin trailer, con `cajetin != 2` o con `formato != 1`. Sólo esa
  combinación está medida; el cajetín 1 y los A3 no se degradan a una geometría falsa.
- `contorno` decide si se emiten los dos marcos y, junto con `referenciado`, la franja.
  El bloque se dibuja siempre.
- Lee textos con `titleValues()` y alineación con `block.alignment`. Nada de constantes
  del trailer duplicadas.
- Filas (7 × 12 unidades) y campos: `[0,1]`, `[2,3]`, `[4]`, `[5]`, `[6]`, `[7,8]`, `[9]`.
- **Escala ×2** sobre la geometría medida de CADe (que usa filas de 6 y texto de ~2): a esa
  densidad el contenido es ilegible en pantalla. El ancho nominal duplicado (414) no entra
  en la hoja de 279, así que el bloque toma todo el ancho del marco interior (259) y crece
  en alto: `259 × 84`.
- **Visibilidad**: `block.visibility[row]` decide si la fila se dibuja. Una fila oculta no
  emite celdas ni rótulo, y el bloque se acorta desde arriba contra el borde inferior del
  marco. Es lo que hace que el check «Mostrar» del diálogo actúe sobre el dibujo.
- El fixture `cajetin-probe.cad` trae `visibility[1] = 0` (Comprobado oculto): los tests de
  geometría corren con las siete filas visibles.
- Rótulos de fila: Dibujado, Comprobado, Entidad, Título, Fecha, Número, Archivo.
- Encabezados de columna en las filas de dos campos: `Fecha`/`Nombre` en las firmas y
  `Hoja`/`Total` en la numeración (es el `"%s de %s"` del binario).
- Énfasis en Entidad y Título.
- Tests en `app/test/title-block-layout.test.ts` (17 casos, `cajetin-probe.cad`).

### Fase 2 — Capa SVG (`app/src/ui/TitleBlockLayer.tsx`)

- Un `<g className="title-block" pointer-events="none">` con líneas, rótulos y celdas.
- `vector-effect="non-scaling-stroke"` para que el grosor no dependa del zoom.
- Colores por token en `diagram.css`: `--ink` para lo fuerte, `--ink-soft` para
  divisiones, rótulos y encabezados. Sin fondo blanco: es line art sobre el lienzo.
- Tipografías en unidades del documento: valores `5.6`, rótulos de fila `5.2`,
  encabezados `4`. La fila mide `12`.

### Fase 3 — Integración en `Canvas`

- `App` memoiza `titleBlockLayout(parseTitleBlock(state.text))` y lo pasa a `Canvas`.
- La capa se dibuja **antes** de cables y componentes (queda debajo).
- `fit` no cambia: se agrega **Ver → Encuadrar hoja** (`sheetFitToken`) que encuadra la
  página completa. Sin layout, cae en el encuadre normal.
- **Archivo → Configuración del proyecto… → «Mostrar cajetín en el plano»** apaga la capa
  sin tocar el documento: es preferencia de vista, no ensucia el archivo, y aplica en el
  acto. `Encuadrar hoja` sigue funcionando con la capa apagada porque la geometría se
  conserva. Es el primer ajuste de ese diálogo; ahí van a vivir el formato de hoja, el tipo
  de cajetín y el contorno cuando se implementen.

### Fase 4 — Verificación

- Unitarios de la Fase 1 (puros, sin DOM): 15/15.
- E2E en `app/e2e/title-block.spec.ts`: el bloque existe en el DOM con los textos del
  trailer, `Encuadrar hoja` deja la página dentro del lienzo y editar el Título en el
  diálogo repinta la capa.
- Comparación visual a ojo en moderno y clásico; no se persigue overlay exacto.
- Casos borde cubiertos por unitarios: sin cajetín, formato distinto de A4H,
  `referenciado` apagado, `contorno` apagado.

### Lo que la implementación dejó fijado

| Dato | Valor |
| --- | --- |
| Página útil | `279 × 210` (lado mayor = ancho) |
| Bloque | `259 × 84` (ancho limitado al marco interior), margen `10` → origen `(10, 116)` |
| Filas | 7 de `12`; rótulos a la izquierda en una columna de `54` |
| Franja de referenciado | `10`; columnas `round(279/50) = 6` (A–F), filas `round(210/50) = 4` (1–4) |
| Marcas | `weight 2` marcos y bloque; `weight 1` divisiones internas |

Ninguno de estos números sale de `OnDraw`: son la propuesta del documento, medida a ojo
contra la captura. Si algún día se extrae la geometría real, se reemplazan acá y la capa
SVG no cambia.

## Medición en CADe_SIMU V4 (2026-11-25) — reemplaza la propuesta anterior

Capturas: `Archivo → Presentación preliminar` del fixture `arranque-paro-motor-3f.cad` en A4
horizontal, y vista de hoja a zoom conocido. En pantalla las divisiones verticales del bloque caen
cada **150 px = 30 unidades** (zoom 5 px/unidad), y las filas cada **30 px = 6 unidades**. En la
vista previa (mismo marco para los dos cajetines):

| Cajetín | Posición | Ancho | Alto |
|---------|----------|-------|------|
| 2 | abajo a la izquierda, pegado al marco | ocupa casi todo el marco | 3 filas visibles en estos fixtures |
| 1 | abajo a la derecha | ~61 % del marco | ~2 × el alto del 2 |

El ancho del cajetín 2 medido en el dibujante es **207 unidades**, con divisiones en
`0 / 30 / 60 / 90 / 120 / 156 / 207`; la altura de una fila es **6 unidades** y el máximo con las
7 filas visibles es **42**. Por eso se quitó el `SCALE = 2` de la implementación: el bloque pasó de
**259 × 84** a **207 × 42** y se ancló abajo a la izquierda con 3 unidades de margen.

**Detalle importante**: en estos fixtures los 14 flags están en `1`, pero CADe no los lee al abrir
(son de sólo escritura) y muestra su estado interno: sólo Dibujado y Comprobado visibles, o sea 3
filas. Nuestro editor sí respeta los flags del archivo y dibuja las 7 filas, así que el bloque es más
alto que en CADe aunque tenga la misma anchura. Esa desviación está documentada en
`docs/reportes/informe-cajetin-ocultamiento-y-guardado.md`.

El cajetín 1 **sí está implementado**, medido en `app/test/fixtures/cajetin1-medido.cad` (A4H):
bloque de **207 × 36** abajo a la derecha (origen `69,171`), con filas `6/6/6/9/9` y columnas
`0/30/60/90/156/207`. Arriba lleva Fecha y Entidad; las dos filas siguientes, Dibujado y
Comprobado con sus subcascillas; abajo, la fecha con el Título centrado y las celdas de Hoja y
Archivo a la derecha. `titleBlockLayout` devuelve su geometría cuando `cajetin === 1`.

## Pendientes fuera de este plan

1. **Multi-hoja**: `parseTitleBlock` toma el último trailer. Para dibujar por hoja hace
   falta `parseTitleBlocks(text): TitleBlock[]` y asociarlos a `Sheet.index` por orden de
   aparición. `Sheet` ya expone `titleBlock` (registro 20000) para ese emparejamiento.
2. **A3 y cajetín 1**: mismo layout, otras medidas.
3. **Fidelidad exacta**: sólo si el producto la pide.

## Anexo — Cómo cerrar la geometría real (Windows)

Sólo si se decide calcar CADe. Dos caminos, en orden de costo.

### A. Medir una hoja (recomendado, ~30 min)

1. En CADe: `Archivo → Configuración`, hoja **A4 horizontal**, **Cajetín 2**, `Contorno` y
   `Referenciado` activos, orientación del referenciado horizontal.
2. Escribir valores distintivos en los 10 campos (`DIB1`, `DIB2`, `COM1`, `TITULO`, …) y
   guardar el `.cad` en el repo como fixture nuevo.
3. `Archivo → Imprimir` a **PDF** (vectorial). Si no hay PDF, captura a zoom conocido con
   la barra de estado mostrando `X=`/`Y=`.
4. Medir sobre el PDF con cualquier editor: borde exterior, borde interior, ancho de la
   franja, divisiones del bloque, alturas de fila, tamaño de fuente.
5. Registrar todo en `docs/re/cajetin-layout.md` con coordenadas en milímetros y el
   `.cad`+PDF como evidencia.

### B. Extraer de `OnDraw` (Ghidra, ~2-3 h)

1. Ghidra 11/12 con el PDB `CADe_SIMU.pdb` al lado del exe (el binario lo referencia:
   NB10, age 1). Con PDB los nombres dejan de ser `FUN_*`.
2. Abrir en `FUN_0040d2b0` (`OnDraw`). Si el decompilador falla por tamaño, usar el
   *Listing* y las xrefs a `0x401843` (thunk del cajetín) en `0x40ecb2`, `0x40ecdc`,
   `0x40fa12`, `0x4107c0`, `0x411574`, `0x412332`.
3. Para las líneas: buscar las llamadas a `CDC::MoveTo` / `CDC::LineTo` /
   `CDC::Rectangle` en la región anterior a cada llamada del cajetín y anotar los
   inmediatos empujados. En esta sesión MFC42D aparece resuelto por ordinal
   (`Ordinal_684` = `TextOut`), así que conviene cargar también `MFC42D.DLL` en el
   proyecto para tener nombres.
4. Confirmar cuál de los seis sitios es el de pantalla (el que usa `doc[0x58]` como escala
   de vista) y con qué origen.
5. Volcar las coordenadas en `docs/re/cajetin-layout.md`.

Con cualquiera de los dos caminos la Fase 1 no cambia de forma: sólo se reemplazan los
números de la geometría propuesta por los medidos.
