/**
 * Geometría del cajetín dibujado sobre la hoja.
 *
 * **Feature propia**: el contenido y el orden de las filas salen del binario
 * (`FUN_00854d30`, ver `docs/re/cajetin-render.md`), pero las medidas son de
 * diseño. CADe dibuja el marco *inline* en `OnDraw` y esa geometría no se pudo
 * extraer, así que acá no se inventa como si fuera dato: es la propuesta del
 * documento y se ajusta en el gate visual.
 *
 * Todo se expresa en unidades del documento (mm), con **y hacia abajo** y el
 * origen en la esquina superior izquierda de la hoja.
 *
 * Alcance: sólo A4 horizontal con cajetín 2. Cualquier otra combinación
 * devuelve `null` en vez de dibujar algo que no corresponde.
 */

import {
  titleCajetin,
  titleContorno,
  titlePageFormat,
  titlePageSize,
  titleReferenciado,
  titleValues,
  type TitleBlock,
} from './title-block.ts';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 2 = marco/bloque, 1 = división interna. */
  weight: 1 | 2;
}

export interface Cell {
  rect: Rect;
  /** 0 = izquierda, 1 = centro, 2 = derecha (fila del diálogo). */
  align: 0 | 1 | 2;
  text: string;
  /** Encabezado de columna, para las filas de dos campos. */
  caption?: string;
  /** Entidad y Título se destacan. */
  emphasis: boolean;
}

export interface SheetLabel {
  text: string;
  x: number;
  y: number;
  anchor: 'start' | 'middle';
}

export interface SheetLayout {
  page: { width: number; height: number };
  lines: Line[];
  cells: Cell[];
  labels: SheetLabel[];
}

const MARGIN = 10;
/**
 * Geometría medida en CADe_SIMU V4, no propuesta de diseño.
 *
 * En pantalla a 5 px/unidad las divisiones verticales del bloque caen cada
 * 150 px (= 30 unidades) y el marco empieza 3 unidades dentro de la hoja:
 * bloque de 207 × 42 unidades (7 filas de 6), con columnas en
 * 0 / 30 / 60 / 90 / 120 / 156 / 207. Es lo que también sale del dibujante
 * `FUN_00854d30` (ver `docs/re/cajetin-render.md`).
 */
const BLOCK_WIDTH = 207;
const ROW_HEIGHT = 6;
const ROW_COUNT = 7;
const LABEL_WIDTH = 30;
/** Inset del bloque respecto del borde inferior e izquierdo de la hoja. */
const BLOCK_INSET = 3;
const BAND_STEP = 50;

/** Segundo bloque del diálogo: medido en `cajetin1-medido.cad` (A4 horizontal). */
const BLOCK1 = {
  width: 207,
  rows: [6, 6, 6, 9, 9],
  columns: [0, 30, 60, 90, 156, 207],
  height: 36,
} as const;

export const TITLE_LAYOUT = {
  margin: MARGIN,
  blockWidth: BLOCK_WIDTH,
  rowHeight: ROW_HEIGHT,
  rowCount: ROW_COUNT,
  labelWidth: LABEL_WIDTH,
  band: MARGIN,
  fontSize: 2.8,
  captionSize: 2,
  rowLabelSize: 2.6,
  /** Borde superior del bloque completo, medido desde el borde superior de la hoja. */
  blockTop: (_pageWidth: number, pageHeight: number, rows = ROW_COUNT): number =>
    pageHeight - BLOCK_INSET - rows * ROW_HEIGHT,
  /** Borde izquierdo del bloque, medido desde el borde izquierdo de la hoja. */
  blockLeft: (_pageWidth: number): number => BLOCK_INSET,
  /** Ancho del bloque en una hoja de ese ancho. */
  widthFor: (_pageWidth: number): number => BLOCK_WIDTH,
};

function cajetin1Layout(values: string[], alignOfRow: (row: number) => 0 | 1 | 2): SheetLayout {
  const width = 279;
  const height = 210;
  const left = width - BLOCK_INSET - BLOCK1.width;
  const top = height - BLOCK_INSET - BLOCK1.height;
  const [, c1, c2, c3, c4, c5] = BLOCK1.columns;
  const [, r1, r2, r3, r4, r5] = [0, 6, 12, 18, 27, 36].map((y) => top + y);

  const lines: Line[] = [
    ...rectLines(left, top, BLOCK1.width, BLOCK1.height, 2),
    { x1: left + c1, y1: top, x2: left + c1, y2: r3, weight: 1 },
    { x1: left + c2, y1: top, x2: left + c2, y2: r3, weight: 1 },
    { x1: left + c3, y1: top, x2: left + c3, y2: r3, weight: 1 },
    { x1: left + c4, y1: top, x2: left + c4, y2: r5, weight: 1 },
    { x1: left + c1, y1: r1, x2: left + c3, y2: r1, weight: 1 },
    { x1: left + c1, y1: r2, x2: left + c3, y2: r2, weight: 1 },
    { x1: left + c1, y1: r3, x2: left + c5, y2: r3, weight: 1 },
    { x1: left + c4, y1: r4, x2: left + c5, y2: r4, weight: 1 },
  ];

  const cell = (
    field: number,
    x: number,
    y: number,
    w: number,
    h: number,
    caption?: string,
    emphasis = false,
  ): Cell => ({
    rect: { x: left + x, y: top + y, w, h },
    align: alignOfRow(field === 4 ? 2 : field === 5 ? 3 : field === 9 ? 6 : Math.floor(field / 2)),
    text: values[field] ?? '',
    caption,
    emphasis,
  });

  return {
    page: { width, height },
    lines,
    cells: [
      cell(6, c1, 0, c2 - c1, r1 - top, 'Fecha'),
      cell(4, c4, 0, c5 - c4, r3 - top, 'Entidad', true),
      cell(0, c1, r1 - top, c2 - c1, r2 - r1, 'Fecha'),
      cell(1, c2, r1 - top, c3 - c2, r2 - r1, 'Nombre'),
      cell(2, c1, r2 - top, c2 - c1, r3 - r2, 'Fecha'),
      cell(3, c2, r2 - top, c3 - c2, r3 - r2, 'Nombre'),
      cell(5, c1, r3 - top, c4 - c1, r5 - r3, undefined, true),
      {
        rect: { x: left + c4, y: r3, w: c5 - c4, h: r4 - r3 },
        align: alignOfRow(5),
        text: `${values[7] ?? ''} de ${values[8] ?? ''}`,
        caption: 'Hoja',
        emphasis: false,
      },
      cell(9, c4, r4 - top, c5 - c4, r5 - r4, 'Archivo'),
    ],
    labels: [
      { text: 'Dibujado', x: left + 2, y: r1 - 2, anchor: 'start' },
      { text: 'Comprobado', x: left + 2, y: r2 - 2, anchor: 'start' },
      { text: 'Fecha', x: left + 2, y: r4 - 2, anchor: 'start' },
    ],
  };
}

/**
 * Filas encendidas al abrir un documento: las tres primeras, que es lo que
 * muestra la vista previa de CADe. El resto se prende desde `Editar → Cajetín`
 * y ahí el bloque crece hacia arriba, encima del dibujo si hace falta.
 */
export const DEFAULT_VISIBLE_ROWS: readonly boolean[] = [true, true, true, false, false, false, false];

/** Rótulo de cada fila, en el orden del diálogo `Editar → Cajetín`. */
const ROW_LABELS = [
  'Dibujado',
  'Comprobado',
  'Entidad',
  'Título',
  'Fecha',
  'Número',
  'Archivo',
] as const;

/** Qué campos de texto caen en cada fila, en el orden de `TITLE_BLOCK_LABELS`. */
const ROW_FIELDS: ReadonlyArray<ReadonlyArray<number>> = [
  [0, 1],
  [2, 3],
  [4],
  [5],
  [6],
  [7, 8],
  [9],
];

/**
 * Encabezados de columna. Las filas de firmas llevan fecha y nombre; la de
 * numeración lleva la hoja y el total, que es lo que CADe escribe con
 * `"%s de %s"`.
 */
const CELL_CAPTIONS: Readonly<Record<number, string>> = {
  0: 'Fecha',
  1: 'Nombre',
  2: 'Fecha',
  3: 'Nombre',
  7: 'Hoja',
  8: 'Total',
};

/** Entidad y Título son los campos que CADe resalta. */
const EMPHASIS = new Set([4, 5]);

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const alignOf = (value: number | undefined): 0 | 1 | 2 =>
  value === 1 ? 1 : value === 2 ? 2 : 0;

function rectLines(x: number, y: number, w: number, h: number, weight: 1 | 2): Line[] {
  return [
    { x1: x, y1: y, x2: x + w, y2: y, weight },
    { x1: x, y1: y + h, x2: x + w, y2: y + h, weight },
    { x1: x, y1: y, x2: x, y2: y + h, weight },
    { x1: x + w, y1: y, x2: x + w, y2: y + h, weight },
  ];
}

/**
 * Layout de la hoja, o `null` cuando no hay nada que dibujar.
 *
 * Devuelve `null` sin trailer, con cajetín distinto del 2 y con un formato que
 * no sea A4 horizontal: sólo esa combinación está medida.
 */
export function titleBlockLayout(
  block: TitleBlock | null,
  visibility?: readonly boolean[],
): SheetLayout | null {
  if (!block) return null;
  const cajetin = titleCajetin(block);
  if (cajetin !== 1 && cajetin !== 2) return null;
  if (titlePageFormat(block) !== 1) return null;

  const size = titlePageSize(block);
  const width = Math.max(size.alto, size.ancho);
  const height = Math.min(size.alto, size.ancho);
  if (width <= 0 || height <= 0) return null;

  const values = titleValues(block);
  if (cajetin === 1) {
    return cajetin1Layout(values, (row) => alignOf(block.alignment[row]));
  }

  const contorno = titleContorno(block);
  const referenciado = titleReferenciado(block);

  // Las filas apagadas no se dibujan y el bloque se acorta: la caja queda
  // anclada al borde inferior del marco. La visibilidad viene de la sesión y no
  // de los flags del trailer, que CADe escribe y nunca vuelve a leer.
  const rows = ROW_FIELDS.map((fields, row) => ({ fields, row })).filter(
    ({ row }) => visibility?.[row] !== false,
  );

  const blockWidth = TITLE_LAYOUT.widthFor(width);
  const blockHeight = rows.length * ROW_HEIGHT;
  const left = TITLE_LAYOUT.blockLeft(width);
  const top = TITLE_LAYOUT.blockTop(width, height, rows.length);
  const blockBottom = top + blockHeight;
  const blockRight = left + blockWidth;
  const valueLeft = left + LABEL_WIDTH;
  const valueWidth = blockWidth - LABEL_WIDTH;

  const lines: Line[] = [];
  const cells: Cell[] = [];
  const labels: SheetLabel[] = [];

  if (contorno) {
    lines.push(...rectLines(0, 0, width, height, 2));
    lines.push(
      ...rectLines(MARGIN, MARGIN, width - MARGIN * 2, height - MARGIN * 2, 2),
    );
  }

  // Marco del bloque y divisiones internas: van siempre, con o sin contorno.
  if (rows.length > 0) {
    lines.push(...rectLines(left, top, blockWidth, blockHeight, 2));
    lines.push({ x1: valueLeft, y1: top, x2: valueLeft, y2: blockBottom, weight: 1 });
    for (let row = 1; row < rows.length; row += 1) {
      const y = top + row * ROW_HEIGHT;
      lines.push({ x1: left, y1: y, x2: blockRight, y2: y, weight: 1 });
    }
  }

  rows.forEach(({ fields, row }, index) => {
    const rowY = top + index * ROW_HEIGHT;
    const cellWidth = valueWidth / fields.length;

    if (fields.length > 1) {
      for (let i = 1; i < fields.length; i += 1) {
        const x = valueLeft + cellWidth * i;
        lines.push({ x1: x, y1: rowY, x2: x, y2: rowY + ROW_HEIGHT, weight: 1 });
      }
    }

    labels.push({
      text: ROW_LABELS[row]!,
      x: left + 2,
      y: rowY + ROW_HEIGHT - 1.6,
      anchor: 'start',
    });

    fields.forEach((field, i) => {
      cells.push({
        rect: { x: valueLeft + cellWidth * i, y: rowY, w: cellWidth, h: ROW_HEIGHT },
        align: alignOf(block.alignment[row]),
        text: values[field] ?? '',
        caption: CELL_CAPTIONS[field],
        emphasis: EMPHASIS.has(field),
      });
    });
  });

  if (contorno && referenciado) {
    const columns = Math.max(1, Math.round(width / BAND_STEP));
    const rows = Math.max(1, Math.round(height / BAND_STEP));
    const columnWidth = width / columns;
    const rowHeight = height / rows;

    for (let i = 0; i < columns; i += 1) {
      labels.push({
        text: LETTERS[i] ?? '?',
        x: columnWidth * (i + 0.5),
        y: MARGIN / 2,
        anchor: 'middle',
      });
    }
    for (let i = 0; i < rows; i += 1) {
      labels.push({
        text: String(i + 1),
        x: MARGIN / 2,
        y: rowHeight * (i + 0.5) + 1,
        anchor: 'middle',
      });
    }
  }

  return { page: { width, height }, lines, cells, labels };
}
