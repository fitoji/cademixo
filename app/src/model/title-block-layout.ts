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
 * Factor de escala del bloque. CADe lo dibuja mucho más chico (filas de 6
 * unidades y texto de ~2), pero a esa escala el contenido es ilegible en
 * pantalla, así que acá se duplica: filas de 12, texto de 5.6.
 */
const SCALE = 2;
const BLOCK_WIDTH_NOMINAL = 207 * SCALE;
const ROW_HEIGHT = 6 * SCALE;
const ROW_COUNT = 7;
const LABEL_WIDTH = 27 * SCALE;
const BAND_STEP = 50;

/**
 * El doble del ancho (414) no entra en una hoja de 279. El máximo es el marco
 * interior, así que el bloque se queda con todo el ancho útil y crece en alto.
 */
const blockWidthFor = (pageWidth: number): number =>
  Math.min(BLOCK_WIDTH_NOMINAL, Math.max(1, pageWidth - MARGIN * 2));

export const TITLE_LAYOUT = {
  margin: MARGIN,
  scale: SCALE,
  blockWidth: BLOCK_WIDTH_NOMINAL,
  rowHeight: ROW_HEIGHT,
  rowCount: ROW_COUNT,
  labelWidth: LABEL_WIDTH,
  band: MARGIN,
  fontSize: 2.8 * SCALE,
  captionSize: 2 * SCALE,
  rowLabelSize: 2.6 * SCALE,
  /** Borde superior del bloque completo, medido desde el borde superior de la hoja. */
  blockTop: (_pageWidth: number, pageHeight: number): number =>
    pageHeight - MARGIN - ROW_COUNT * ROW_HEIGHT,
  /** Borde izquierdo del bloque, medido desde el borde izquierdo de la hoja. */
  blockLeft: (pageWidth: number): number => pageWidth - MARGIN - blockWidthFor(pageWidth),
  /** Ancho efectivo del bloque en una hoja de ese ancho. */
  widthFor: blockWidthFor,
};

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
export function titleBlockLayout(block: TitleBlock | null): SheetLayout | null {
  if (!block) return null;
  if (titleCajetin(block) !== 2) return null;
  if (titlePageFormat(block) !== 1) return null;

  const size = titlePageSize(block);
  const width = Math.max(size.alto, size.ancho);
  const height = Math.min(size.alto, size.ancho);
  if (width <= 0 || height <= 0) return null;

  const contorno = titleContorno(block);
  const referenciado = titleReferenciado(block);
  const values = titleValues(block);

  // Las filas ocultas desde `Editar → Cajetín` no se dibujan y el bloque se
  // acorta: la caja queda anclada al borde inferior del marco.
  const rows = ROW_FIELDS.map((fields, row) => ({ fields, row })).filter(
    ({ row }) => block.visibility[row] !== false,
  );

  const blockWidth = TITLE_LAYOUT.widthFor(width);
  const blockHeight = rows.length * ROW_HEIGHT;
  const left = width - MARGIN - blockWidth;
  const top = height - MARGIN - blockHeight;
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
      y: rowY + ROW_HEIGHT - 1.6 * SCALE,
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
