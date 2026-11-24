/**
 * Nombre de archivo con el que se guarda un esquema.
 *
 * Decisión del producto: se guarda **siempre** `.cad`, nunca `.cade`. Los
 * `.cade` se abren igual —.cad y .cade son el mismo formato de texto— pero al
 * volver a guardarlos quedan con la extensión que escribe CADe_SIMU.
 *
 * Vive fuera de `ui/samples.ts` porque ahí el módulo importa fixtures con la
 * sintaxis `?url` de Vite y no se puede cargar desde `node --test`.
 */

export const SAVE_EXTENSION = '.cad';
/** Proyecto nativo: `.cad` + keys custom en un solo archivo. */
export const NATIVE_EXTENSION = '.mixo';

export const DEFAULT_FILE_NAME = `sin título${SAVE_EXTENSION}`;

const KNOWN_EXTENSION = /\.(cade|cad|mixo)$/i;

/**
 * Nombre normalizado para guardar: reemplaza una extensión final `.cade`/`.cad`
 * por `.cad`, y agrega `.cad` si el nombre no trae ninguna de las dos.
 *
 * Sólo mira el final: un punto en el medio (`mi.tablero`) no es extensión.
 */
export function cadFileName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') return DEFAULT_FILE_NAME;
  return trimmed.replace(KNOWN_EXTENSION, '') + SAVE_EXTENSION;
}

/** Nombre de proyecto nativo: misma base, extensión `.mixo`. */
export function mixoFileName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') return `sin título${NATIVE_EXTENSION}`;
  return trimmed.replace(KNOWN_EXTENSION, '') + NATIVE_EXTENSION;
}

export function isMixoFileName(name: string): boolean {
  return /\.mixo$/i.test(name.trim());
}

/** Nombre sugerido para el destino elegido; no cambia el archivo actual. */
export function suggestedSaveName(current: string, native = false): string {
  return native ? mixoFileName(current) : cadFileName(current);
}
