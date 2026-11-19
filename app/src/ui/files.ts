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

import { cadFileName } from '../format/filename.ts';

/** Lo poco que se usa de los selectores del navegador. */
interface PickerScope {
  showSaveFilePicker?: (options?: { suggestedName?: string }) => Promise<FileSystemFileHandle>;
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    types?: { description?: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandle[]>;
}

/**
 * El filtro del selector de apertura: el mismo que el `accept` del input oculto
 * (`.cade,.cad`), para que el diálogo del sistema no ofrezca cualquier archivo.
 */
const OPEN_TYPES = [
  { description: 'Documentos CADe_SIMU', accept: { 'application/octet-stream': ['.cade', '.cad'] } },
];

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
export function suggestedSaveName(current: string): string {
  return cadFileName(current);
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
  return cadFileName(trimmed);
}

export type SaveShortcut = 'save' | 'save-as';

/**
 * Atajo de guardado de un `keydown`: ⌘S / Ctrl+S guarda, con Shift guarda como.
 * Es puro para que el manejador de React quede en una línea.
 *
 * El tipo describe lo que se mira de un `KeyboardEvent`; `altKey` no participa,
 * así que Alt+S no es atajo.
 */
export function saveShortcutOf(event: {
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  key: string;
}): SaveShortcut | null {
  if (!event.metaKey && !event.ctrlKey) return null;
  if (event.key.toLowerCase() !== 's') return null;
  return event.shiftKey ? 'save-as' : 'save';
}

// --- envoltorios de navegador ------------------------------------------------

/**
 * Pide destino y nombre. Devuelve `null` si el navegador no sabe elegir o si el
 * usuario cierra el diálogo: quien llama no debe escribir nada. Si el selector
 * falla, lanza `PickerError`, que es otra cosa y se avisa distinto.
 */
export async function pickSaveHandle(name: string): Promise<FileSystemFileHandle | null> {
  const scope = globalThis as PickerScope;
  if (typeof scope.showSaveFilePicker !== 'function') return null;
  try {
    return await scope.showSaveFilePicker({ suggestedName: name });
  } catch (error) {
    if (isAbort(error)) return null;
    throw new PickerError('no se pudo abrir el selector de destino');
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
    [handle] = await scope.showOpenFilePicker({ multiple: false, types: OPEN_TYPES });
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
 * Codifica de vuelta a bytes: un carácter por byte, sin tocar nada.
 *
 * El tipo lleva `ArrayBuffer` explícito: con la lib de TypeScript instalada el
 * `Uint8Array` sin parámetro admite `SharedArrayBuffer`, y `createWritable` sólo
 * acepta buffers propios.
 */
export function encodeLatin1(text: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

/**
 * Escribe `text` en el archivo del handle, con los mismos bytes que la descarga
 * (latin1, un carácter por byte).
 *
 * Tanto `write` como `close` pueden fallar: `close` es donde el navegador
 * confirma el archivo, así que un fallo ahí deja el archivo a medio escribir.
 * En los dos casos se aborta el stream y se propaga el error original, para que
 * quien llama informe el fallo en vez de dar el guardado por bueno.
 */
export async function writeHandle(handle: FileSystemFileHandle, text: string): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(encodeLatin1(text));
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
