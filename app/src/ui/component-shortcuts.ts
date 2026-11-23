/**
 * Plan B de `odd/tasks/atajos-componentes-cadesimu.md`: CADe_SIMU descarta el
 * registro propio `99999` al guardar (T3 medido en Windows), así que los atajos
 * por componente viven en un sidecar `.cad.keys.json` y el `.cad` no se toca.
 *
 * En el navegador no se puede leer/escribir un archivo hermano del que se abrió
 * sin pedir otro handle, así que el sidecar se guarda en `localStorage` claveado
 * por nombre de archivo y se puede exportar/importar como `.cad.keys.json`.
 */

import type { ComponentShortcuts } from '../format/cade-shortcuts.ts';
export type { ComponentShortcuts } from '../format/cade-shortcuts.ts';
import type { Bindings } from './shortcut-bindings.ts';
import { canonicalKeys, isValidBinding } from './shortcut-bindings.ts';

const STORAGE_PREFIX = 'simuelectro:atajos-componentes:';
const EMPTY: ComponentShortcuts = { version: 1, bindings: {} };

export type BindingCheck = { ok: true } | { ok: false; reason: 'invalid' | 'reserved' | 'conflict'; conflictWith?: string };

export function sidecarFileName(fileName: string): string {
  return `${fileName}.keys.json`;
}

function storageKey(fileName: string): string {
  return STORAGE_PREFIX + fileName.toLowerCase();
}

export function parseSidecar(text: string): ComponentShortcuts | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const raw = data as { version?: unknown; bindings?: unknown };
  if (raw.version !== 1 || typeof raw.bindings !== 'object' || raw.bindings === null || Array.isArray(raw.bindings)) {
    return null;
  }
  const bindings: Record<string, string> = {};
  for (const [designator, keys] of Object.entries(raw.bindings as Record<string, unknown>)) {
    if (designator === '' || typeof keys !== 'string') continue;
    const canonical = canonicalKeys(keys);
    if (canonical === null || !isValidBinding(canonical)) continue;
    bindings[designator] = canonical;
  }
  return { version: 1, bindings };
}

export function serializeSidecar(metadata: ComponentShortcuts): string {
  return JSON.stringify({ version: 1, bindings: metadata.bindings }, null, 2);
}

export function readComponentBindings(fileName: string): ComponentShortcuts {
  try {
    const raw = localStorage.getItem(storageKey(fileName));
    return raw === null ? { version: 1, bindings: {} } : (parseSidecar(raw) ?? { version: 1, bindings: {} });
  } catch {
    return { version: 1, bindings: {} };
  }
}

export function writeComponentBindings(fileName: string, bindings: Record<string, string>): ComponentShortcuts {
  const next: ComponentShortcuts = { version: 1, bindings: { ...bindings } };
  try {
    localStorage.setItem(storageKey(fileName), serializeSidecar(next));
  } catch {
    // Sin storage el cambio vale sólo para esta sesión.
  }
  return next;
}

/**
 * Un atajo de componente no puede repetirse entre componentes ni contra los
 * atajos globales (S8). Escape y Espacio ya quedan afuera en `isValidBinding`.
 */
export function checkComponentBinding(
  keys: string,
  designator: string,
  bindings: Record<string, string>,
  globals: Bindings,
): BindingCheck {
  const canonical = canonicalKeys(keys);
  if (canonical === null) return { ok: false, reason: 'invalid' };
  if (!isValidBinding(canonical)) return { ok: false, reason: 'reserved' };
  const conflictWith =
    Object.entries(globals).find(([, value]) => canonicalKeys(value) === canonical)?.[0] ??
    Object.entries(bindings).find(([key, value]) => key !== designator && canonicalKeys(value) === canonical)?.[0];
  if (conflictWith) return { ok: false, reason: 'conflict', conflictWith };
  return { ok: true };
}

export function downloadSidecar(fileName: string, metadata: ComponentShortcuts): void {
  const blob = new Blob([serializeSidecar(metadata)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = sidecarFileName(fileName);
  anchor.click();
  URL.revokeObjectURL(url);
}

/** El sidecar vacío para un archivo que nunca tuvo atajos. */
export function emptySidecar(): ComponentShortcuts {
  return { version: 1, bindings: { ...EMPTY.bindings } };
}
