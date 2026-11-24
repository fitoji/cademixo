/**
 * Sidecar de atajos por componente: `<archivo>.keys.json`.
 *
 * CADe_SIMU descarta el registro propio `99999` al guardar (gate T3 en Windows),
 * así que los atajos no viven en el `.cad`: viven en este archivo hermano y en
 * `localStorage`. El `.cad` queda intacto y CADe lo abre sin saber que existen.
 *
 * La asociación es por **hash del texto CADe**, no por nombre de archivo:
 * renombrar el plano no pierde los atajos y un re-guardado en CADe (que cambia
 * ids) se detecta como un dibujo distinto.
 */

import type { Bindings } from './shortcut-bindings.ts';
import { canonicalKeys, isValidBinding } from './shortcut-bindings.ts';

export interface ComponentShortcuts {
  version: 2;
  /** hash del texto `.cad` al que pertenecen estos atajos */
  drawingHash?: string;
  /** nombre del archivo cuando se exportó, sólo para diagnóstico */
  sourceName?: string;
  bindings: Record<string, string>;
}

const STORAGE_PREFIX = 'simuelectro:atajos-componentes:';
const EMPTY: ComponentShortcuts = { version: 2, bindings: {} };

export type BindingCheck =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'reserved' | 'conflict'; conflictWith?: string };

/** Hash estable y síncrono del texto: sirve para asociar, no para seguridad. */
export function drawingHash(text: string): string {
  let h1 = 0xdeadbeef ^ text.length;
  let h2 = 0x41c6ce57 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

export function sidecarFileName(fileName: string): string {
  return `${fileName}.keys.json`;
}

function storageKey(key: string): string {
  return STORAGE_PREFIX + key.toLowerCase();
}

function validateBindings(input: unknown): Record<string, string> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return {};
  const bindings: Record<string, string> = {};
  const used = new Set<string>();
  for (const [designator, keys] of Object.entries(input as Record<string, unknown>)) {
    if (designator === '' || typeof keys !== 'string') continue;
    const canonical = canonicalKeys(keys);
    if (canonical === null || !isValidBinding(canonical) || used.has(canonical)) continue;
    used.add(canonical);
    bindings[designator] = canonical;
  }
  return bindings;
}

/** Acepta v1 (sin hash) y v2; cualquier basura devuelve `null`. */
export function parseSidecar(text: string): ComponentShortcuts | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const raw = data as { version?: unknown; bindings?: unknown; drawingHash?: unknown; sourceName?: unknown };
  if (raw.version !== 1 && raw.version !== 2) return null;
  return {
    version: 2,
    ...(typeof raw.drawingHash === 'string' && raw.drawingHash !== '' ? { drawingHash: raw.drawingHash } : {}),
    ...(typeof raw.sourceName === 'string' && raw.sourceName !== '' ? { sourceName: raw.sourceName } : {}),
    bindings: validateBindings(raw.bindings),
  };
}

export function serializeSidecar(metadata: ComponentShortcuts): string {
  return JSON.stringify(
    {
      version: 2,
      ...(metadata.drawingHash ? { drawingHash: metadata.drawingHash } : {}),
      ...(metadata.sourceName ? { sourceName: metadata.sourceName } : {}),
      bindings: metadata.bindings,
    },
    null,
    2,
  );
}

export function readComponentBindings(key: string): ComponentShortcuts {
  try {
    const raw = localStorage.getItem(storageKey(key));
    return raw === null ? emptySidecar() : (parseSidecar(raw) ?? emptySidecar());
  } catch {
    return emptySidecar();
  }
}

/**
 * Busca por hash y, si no hay nada, cae a la clave vieja por nombre de archivo.
 * Eso migra los atajos que ya tenía guardados la versión anterior.
 */
export function readBindingsForDocument(fileName: string, hash: string): ComponentShortcuts {
  const byHash = readComponentBindings(hash);
  if (Object.keys(byHash.bindings).length > 0) return byHash;
  const legacy = readComponentBindings(fileName);
  return Object.keys(legacy.bindings).length > 0 ? legacy : byHash;
}

export function writeComponentBindings(
  key: string,
  bindings: Record<string, string>,
  meta: { drawingHash?: string; sourceName?: string } = {},
): ComponentShortcuts {
  const next: ComponentShortcuts = {
    version: 2,
    ...(meta.drawingHash ? { drawingHash: meta.drawingHash } : {}),
    ...(meta.sourceName ? { sourceName: meta.sourceName } : {}),
    bindings: { ...bindings },
  };
  try {
    localStorage.setItem(storageKey(key), serializeSidecar(next));
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
  return { version: 2, bindings: { ...EMPTY.bindings } };
}
