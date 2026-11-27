/**
 * Archivos del usuario: abrir uno existente y guardar sobre él.
 *
 * Decisión central: lo que se puede probar está separado de lo que toca el
 * navegador. La detección de soporte (`hasFileSystemAccess`), la decisión de qué
 * hacer al guardar (`planSaveAction`), el nombre sugerido y el atajo son
 * funciones puras, que prueba `test/files.test.ts`. Los envoltorios
 * (`pickSaveHandle`, `pickOpenHandle`, `writeHandle`) son finos y sólo llaman a
 * la File System Access API cuando alguien los invoca, así que este módulo se
 * puede cargar desde `node --test`.
 *
 * Detalle de tipos: la lib de TypeScript instalada trae `FileSystemFileHandle` y
 * `createWritable`, pero NO los selectores `showSaveFilePicker` /
 * `showOpenFilePicker`. Se declaran acá abajo, con lo mínimo que se usa.
 */

import {
  cadFileName,
  isMixoFileName,
  mixoFileName,
  suggestedSaveName as fileNameFor,
} from '../format/filename.ts';
import { encodeLatin1 } from '../format/latin1.ts';

export { encodeLatin1 } from '../format/latin1.ts';

/** Lo poco que se usa de los selectores del navegador. */
interface PickerScope {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: { description?: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandle>;
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    types?: { description?: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandle[]>;
}

/**
 * El selector no se pudo abrir: sin contexto seguro, permiso denegado o una
 * política que lo prohíba. No es una cancelación y no se puede tratar como tal,
 * porque el usuario no eligió nada y decirle que "no eligió destino" sería
 * culparlo de un fallo de la aplicación.
 */
export class PickerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PickerError';
  }
}

/** ¿El selector se cerró porque el usuario canceló? Esa es la única cancelación. */
function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

/**
 * ¿Este ámbito puede elegir archivo con handle? Se pregunta sobre `scope` (por
 * defecto `globalThis`) para poder probarlo con objetos falsos.
 *
 * Hacen falta los dos selectores: guardar en el archivo abierto no sirve si
 * después no se puede abrir ninguno.
 */
export function hasFileSystemAccess(scope: unknown = globalThis): boolean {
  if (typeof scope !== 'object' || scope === null) return false;
  const pickers = scope as PickerScope;
  return (
    typeof pickers.showSaveFilePicker === 'function' && typeof pickers.showOpenFilePicker === 'function'
  );
}

/** Qué hace «Guardar» (y «Guardar como…») con este documento. */
export type SaveAction = 'write-in-place' | 'pick-location' | 'download';

/**
 * La decisión completa de S3/S4: con archivo asociado se reescribe sin diálogo;
 * sin archivo, se pide destino si el navegador sabe; si no, se descarga.
 *
 * Nunca se inventa un destino: sin handle, escribir en cualquier lado sería
 * perder el archivo que el usuario cree estar guardando.
 */
export function planSaveAction(input: {
  hasHandle: boolean;
  browserSupportsPickers: boolean;
}): SaveAction {
  if (input.hasHandle) return 'write-in-place';
  return input.browserSupportsPickers ? 'pick-location' : 'download';
}

/**
 * Nombre con el que se sugiere guardar: delega en `cadFileName` para que la
 * regla de la extensión `.cad` viva en un solo lugar (`format/filename.ts`).
 */
export function suggestedSaveName(current: string, native = false): string {
  return fileNameFor(current, native);
}

/**
 * Nombre que el usuario escribió en el diálogo de «Guardar como…» cuando el
 * navegador no puede abrir su propio selector. `null` si no escribió nada (ni
 * espacios): un documento sin nombre no se guarda, se vuelve a preguntar.
 *
 * El `.cad` sale de `cadFileName`, igual que el nombre sugerido y la descarga:
 * una sola regla de extensión para todos los caminos.
 */
export function normalizeSaveName(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  // `.mixo` es un destino nativo válido; `.cade`/`.cad` se normalizan a `.cad`.
  return isMixoFileName(trimmed) ? mixoFileName(trimmed) : cadFileName(trimmed);
}

// --- envoltorios de navegador ------------------------------------------------

/**
 * Pide destino y nombre. Devuelve `null` si el navegador no sabe elegir o si el
 * usuario cierra el diálogo: quien llama no debe escribir nada. Si el selector
 * falla, lanza `PickerError`, que es otra cosa y se avisa distinto.
 */
export async function pickSaveHandle(name: string, native = false): Promise<FileSystemFileHandle | null> {
  const scope = globalThis as PickerScope;
  if (typeof scope.showSaveFilePicker !== 'function') return null;
  const nativeType = {
    description: 'Proyecto cadeMixo',
    accept: { 'application/octet-stream': ['.mixo'] },
  };
  const cadeType = {
    description: 'Esquema CADe',
    accept: { 'text/plain': ['.cad', '.cade'] },
  };
  try {
    return await scope.showSaveFilePicker({
      suggestedName: name,
      types: native ? [nativeType, cadeType] : [cadeType, nativeType],
    });
  } catch (error) {
    if (isAbort(error)) return null;
    throw new PickerError('no se pudo abrir el selector de destino');
  }
}

/**
 * Pide destino para el sidecar `.keys.json`. Mismo contrato que
 * `pickSaveHandle`: `null` es cancelación; un fallo del selector lanza.
 */
export async function pickSidecarHandle(name: string): Promise<FileSystemFileHandle | null> {
  const scope = globalThis as PickerScope;
  if (typeof scope.showSaveFilePicker !== 'function') return null;
  try {
    return await scope.showSaveFilePicker({
      suggestedName: name,
      types: [{ description: 'Atajos de componentes', accept: { 'application/json': ['.json'] } }],
    });
  } catch (error) {
    if (isAbort(error)) return null;
    throw new PickerError('no se pudo abrir el selector del sidecar');
  }
}

/**
 * Pide un archivo y devuelve el handle junto con su contenido, para poder
 * reescribir después ese mismo archivo. `null` si no hay soporte o si el
 * usuario cancela; si el selector falla, lanza `PickerError`.
 */
export async function pickOpenHandle(): Promise<{ handle: FileSystemFileHandle; file: File } | null> {
  const scope = globalThis as PickerScope;
  if (typeof scope.showOpenFilePicker !== 'function') return null;
  let handle: FileSystemFileHandle | undefined;
  try {
    // Sin `types`: el formato no obliga a la extensión, así que el selector
    // ofrece cualquier archivo y la validación se hace por contenido.
    [handle] = await scope.showOpenFilePicker({ multiple: false });
  } catch (error) {
    if (isAbort(error)) return null;
    throw new PickerError('no se pudo abrir el selector de archivos');
  }
  if (!handle) return null;
  // La lectura del archivo elegido queda fuera del `try`: si falla, es un fallo
  // de lectura y no un problema del selector.
  return { handle, file: await handle.getFile() };
}

/**
 * Escribe los bytes ya validados en el archivo del handle.
 *
 * Tanto `write` como `close` pueden fallar: `close` es donde el navegador
 * confirma el archivo, así que un fallo ahí deja el archivo a medio escribir.
 * En los dos casos se aborta el stream y se propaga el error original, para que
 * quien llama informe el fallo en vez de dar el guardado por bueno.
 */
export async function writeBytes(handle: FileSystemFileHandle, bytes: Uint8Array<ArrayBuffer>): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(bytes);
    await writable.close();
  } catch (error) {
    try {
      await writable.abort();
    } catch {
      // El abort es el mejor esfuerzo: manda el error original del guardado.
    }
    throw error;
  }
}

/** Escribe texto con los bytes latin1 de `format/latin1.ts`, sin re-codificar. */
export async function writeHandle(handle: FileSystemFileHandle, text: string): Promise<void> {
  return writeBytes(handle, encodeLatin1(text));
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** El cierre terminó, pero el archivo leído no coincide: no es guardado. */
export class VerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VerificationError';
  }
}

export async function readHandleBytes(handle: FileSystemFileHandle): Promise<Uint8Array<ArrayBuffer>> {
  const file = await handle.getFile();
  return new Uint8Array(await file.arrayBuffer());
}

/**
 * Escribe, espera el cierre y vuelve a leer. Un fallo de `close` ya lanza en
 * `writeBytes`; una relectura distinta lanza `VerificationError`.
 */
export async function writeVerifiedBytes(
  handle: FileSystemFileHandle,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<void> {
  await writeBytes(handle, bytes);
  const read = await readHandleBytes(handle);
  if (!bytesEqual(read, bytes)) throw new VerificationError('la relectura no coincide con los bytes escritos');
}
