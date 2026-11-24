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
  'Empresa',
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
