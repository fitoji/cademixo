/**
 * Cajetín de CADe_SIMU: bloque de texto al final del `.cad`.
 *
 * No se inventa un formato nuevo: se parsean los tokens que escribe CADe y se
 * vuelven a pegar en su sitio sin tocar ningún otro byte del documento. El
 * escritor del binario es `FUN_00432710` (Ghidra `0x432710`); el mapeo de
 * campos quedó confirmado en GUI con `Editar → Cajetín` (ver
 * `docs/re/cajetin-formato.md`).
 *
 * Cadena canónica:
 *   $$$*<11 numéricos>&&&*<10 textos de ancho fijo>*<14 flags>***$$$&&&
 *
 * CADe también escribe una variante de 12 tokens de texto, con dos campos
 * vacíos intercalados entre fecha, número y archivo. Los dos se aceptan.
 */

export const TITLE_BLOCK_LABELS = [
  'Dibujado 1',
  'Dibujado 2',
  'Comprobado 1',
  'Comprobado 2',
  'Entidad',
  'Título',
  'Fecha',
  'Número',
  'De',
  'Archivo',
] as const;

export type TitleFieldIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

const TERMINATOR = '***$$$&&&';
const FLAG_COUNT = 14;
const TEXT_FIELD_COUNT = 10;

interface TextField {
  /** índice del token dentro del trailer (noFieldIndex) */
  token: number;
  /** ancho original, para rellenar al reescribir */
  width: number;
  value: string;
}

export interface TitleBlock {
  /** trailer completo, tal cual está en el archivo */
  raw: string;
  /** desplazamiento del trailer dentro del documento */
  start: number;
  end: number;
  /** los 11 numéricos (el último trae el sufijo `&&&`) */
  numeric: string[];
  fields: TextField[];
  /** 7 flags de visibilidad, en orden de fila del diálogo */
  visibility: boolean[];
  /** 7 alineaciones: 0 = Izq, 1 = Cen, 2 = Der */
  alignment: number[];
}

const isFlag = (token: string): boolean => /^[012]$/.test(token);

/** Devuelve los índices de token que corresponden a los 10 campos de texto. */
function fieldTokens(tokens: string[], first: number): number[] {
  const rest = tokens.slice(first);
  const flagAt = rest.findIndex((token, i) => i >= TEXT_FIELD_COUNT && isFlag(token));
  const textCount = flagAt < 0 ? rest.length : flagAt;
  const indexes = rest.slice(0, textCount).map((_, i) => first + i);
  if (textCount === TEXT_FIELD_COUNT) return indexes;
  // Variante de 12 tokens: fecha, vacío, número, vacío, de, archivo.
  if (textCount === TEXT_FIELD_COUNT + 2) {
    return [
      indexes[0]!, indexes[1]!, indexes[2]!, indexes[3]!, indexes[4]!, indexes[5]!,
      indexes[6]!, indexes[8]!, indexes[10]!, indexes[11]!,
    ];
  }
  return [];
}

export function parseTitleBlock(text: string): TitleBlock | null {
  const start = text.lastIndexOf('$$$*');
  if (start < 0) return null;
  const term = text.indexOf(TERMINATOR, start);
  if (term < 0) return null;
  const end = term + TERMINATOR.length;
  const raw = text.slice(start, end);
  const tokens = raw.split('*');
  // tokens[0] = '$$$', tokens[1..11] = numéricos, tokens[11] termina en '&&&'.
  if (tokens.length < 12 + TEXT_FIELD_COUNT + FLAG_COUNT) return null;

  const numeric = tokens.slice(1, 12);
  const fieldsAt = fieldTokens(tokens, 12);
  if (fieldsAt.length !== TEXT_FIELD_COUNT) return null;
  const fields = fieldsAt.map((token) => ({
    token,
    width: tokens[token]!.length,
    value: tokens[token]!,
  }));
  const flagStart = Math.max(...fieldsAt) + 1;
  const flags = tokens.slice(flagStart, flagStart + FLAG_COUNT);
  if (flags.length !== FLAG_COUNT || !flags.every(isFlag)) return null;
  const numbers = flags.map((f) => Number(f));

  return {
    raw,
    start,
    end,
    numeric,
    fields,
    visibility: numbers.slice(0, 7).map((n) => n === 1),
    alignment: numbers.slice(7, 14),
  };
}

/** Reemplaza los tokens del trailer dentro del texto original. */
function replaceTokens(text: string, block: TitleBlock, tokens: string[]): string {
  const rebuilt = tokens.join('*');
  return text.slice(0, block.start) + rebuilt + text.slice(block.end);
}

function tokenList(block: TitleBlock): string[] {
  return block.raw.split('*');
}

/** Escribe un campo con su ancho original; el resto del archivo queda intacto. */
export function withTitleField(text: string, index: TitleFieldIndex, value: string): string {
  const block = parseTitleBlock(text);
  if (!block) return text;
  const field = block.fields[index];
  if (!field) return text;
  // `*` es el delimitador del trailer: escribirlo rompería el cajetín.
  if (value.includes('*')) return text;
  const tokens = tokenList(block);
  const padded = value.slice(0, field.width).padEnd(field.width, ' ');
  tokens[field.token] = padded;
  return replaceTokens(text, block, tokens);
}

/** Cambia visibilidad y/o alineación sin tocar los demás flags. */
export function withTitleFlags(
  text: string,
  changes: { visibility?: Partial<Record<number, boolean>>; alignment?: Partial<Record<number, 0 | 1 | 2>> },
): string {
  const block = parseTitleBlock(text);
  if (!block) return text;
  const tokens = tokenList(block);
  const flagStart = block.fields[block.fields.length - 1]!.token + 1;
  for (const [key, value] of Object.entries(changes.visibility ?? {})) {
    const i = Number(key);
    if (i >= 0 && i < 7 && typeof value === 'boolean') tokens[flagStart + i] = value ? '1' : '0';
  }
  for (const [key, value] of Object.entries(changes.alignment ?? {})) {
    const i = Number(key);
    if (i >= 0 && i < 7 && (value === 0 || value === 1 || value === 2)) tokens[flagStart + 7 + i] = String(value);
  }
  return replaceTokens(text, block, tokens);
}

/** Los 10 valores del cajetín, ya recortados de su relleno. */
export function titleValues(block: TitleBlock): string[] {
  return block.fields.map((f) => f.value.trimEnd());
}

/**
 * Índices de los numéricos del trailer, en el orden del `sprintf` del binario
 * (`FUN_00432710`). Todos menos el zoom están confirmados en la GUI de CADe
 * abriendo archivos con valores inyectados y comparando el diálogo
 * `Archivo → Configuración`.
 */
export const TITLE_NUMERIC_INDEX = {
  /** 0 A4 Vertical, 1 A4 Horizontal, 2 A3 Formato 1, 3 A3 Formato 2, 4 Personalizado */
  formato: 0,
  /** check «Contorno» */
  contorno: 1,
  /** check «Visualizar referenciado» */
  referenciado: 2,
  /** 0 Ninguno, 1 Cajetín 1, 2 Cajetín 2 */
  cajetin: 3,
  /** zoom de la vista al guardar (se guarda como double) */
  zoom: 4,
  /** 0 Horizontal, 1 Vertical («Orientación referenciado») */
  orientacion: 5,
  /** 1 = rejilla visible (`Ver → Rejilla`) */
  rejilla: 6,
  /** check «Visualizar conexiones símbolo» */
  simbolos: 7,
  /** check «Visualizar número de cable» */
  numeroCable: 8,
  /** alto de la página, en mm (279 en los fixtures) */
  alto: 9,
  /** ancho de la página, en mm (210 en los fixtures) */
  ancho: 10,
} as const;

export type CajetinKind = 0 | 1 | 2;
export type PageFormat = 0 | 1 | 2 | 3 | 4;

/** Valor numérico de un token, ignorando el sufijo `&&&` del último. */
function numericAt(block: TitleBlock, index: number): number {
  const match = /^-?\d+/.exec(block.numeric[index] ?? '');
  return match ? Number(match[0]) : 0;
}

/** Formato de hoja elegido en `Archivo → Configuración`. */
export function titlePageFormat(block: TitleBlock): PageFormat {
  const value = numericAt(block, TITLE_NUMERIC_INDEX.formato);
  return (value >= 0 && value <= 4 ? value : 0) as PageFormat;
}

/** Si el cajetín dibuja su contorno (check «Contorno»). */
export function titleContorno(block: TitleBlock): boolean {
  return numericAt(block, TITLE_NUMERIC_INDEX.contorno) === 1;
}

/** Si se dibuja el referenciado de los bornes. */
export function titleReferenciado(block: TitleBlock): boolean {
  return numericAt(block, TITLE_NUMERIC_INDEX.referenciado) === 1;
}

/** Qué cajetín dibuja CADe: ninguno, el 1 o el 2. */
export function titleCajetin(block: TitleBlock): CajetinKind {
  const value = numericAt(block, TITLE_NUMERIC_INDEX.cajetin);
  return value === 2 ? 2 : value === 1 ? 1 : 0;
}

/** Zoom con el que se guardó la vista. */
export function titleZoom(block: TitleBlock): number {
  return numericAt(block, TITLE_NUMERIC_INDEX.zoom);
}

/** Orientación del referenciado: 0 = Horizontal, 1 = Vertical. */
export function titleOrientation(block: TitleBlock): 0 | 1 {
  return numericAt(block, TITLE_NUMERIC_INDEX.orientacion) === 1 ? 1 : 0;
}

/** Si la rejilla está visible (`Ver → Rejilla`). */
export function titleGrid(block: TitleBlock): boolean {
  return numericAt(block, TITLE_NUMERIC_INDEX.rejilla) === 1;
}

/** Si se dibujan las conexiones de los símbolos. */
export function titleSymbolConnections(block: TitleBlock): boolean {
  return numericAt(block, TITLE_NUMERIC_INDEX.simbolos) === 1;
}

/** Si se numera cada cable. */
export function titleCableNumbers(block: TitleBlock): boolean {
  return numericAt(block, TITLE_NUMERIC_INDEX.numeroCable) === 1;
}

/** Tamaño de página en mm, en el orden en que lo muestra CADe. */
export function titlePageSize(block: TitleBlock): { alto: number; ancho: number } {
  return {
    alto: numericAt(block, TITLE_NUMERIC_INDEX.alto),
    ancho: numericAt(block, TITLE_NUMERIC_INDEX.ancho),
  };
}

/** Escribe un numérico conservando el ancho del token y el sufijo `&&&`. */
export function withTitleNumeric(text: string, index: number, value: number): string {
  const block = parseTitleBlock(text);
  if (!block) return text;
  if (!Number.isInteger(value) || index < 0 || index >= block.numeric.length) return text;
  const tokens = tokenList(block);
  const tokenIndex = index + 1;
  const current = tokens[tokenIndex] ?? '';
  const suffix = current.endsWith('&&&') ? '&&&' : '';
  const width = Math.max(1, current.length - suffix.length);
  const digits = String(value).slice(0, width);
  tokens[tokenIndex] = digits.padStart(width, ' ') + suffix;
  return replaceTokens(text, block, tokens);
}
