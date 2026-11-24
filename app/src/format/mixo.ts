/**
 * Proyecto nativo de cadeMixo: un solo archivo con el texto `.cad` y las keys
 * custom. CADe_SIMU no lo abre a propósito; para volver a CADe se exporta un
 * `.cad` limpio.
 *
 * Formato de texto, sin ZIP ni base64, para preservar Latin-1 byte a byte y que
 * el archivo sea inspeccionable:
 *
 *   CADEMIXO/1
 *   <manifest JSON en una línea>
 *   DRAWING <largo>
 *   <texto CADe exacto>
 *   KEYS <largo>
 *   <JSON de atajos>
 *
 * Los largos son caracteres = bytes en la codificación del proyecto. Cada
 * sección se valida contra el texto para rechazar archivos truncados.
 */

export const MIXO_MAGIC = 'CADEMIXO/1';

export interface MixoManifest {
  format: 'cademixo';
  version: 1;
  sourceName?: string;
}

export interface MixoBundle {
  drawing: string;
  /** JSON del sidecar de atajos, tal cual lo serializa `serializeSidecar`. */
  keys: string;
  manifest: MixoManifest;
}

export function isMixo(text: string): boolean {
  return text.startsWith(`${MIXO_MAGIC}\n`);
}

export function serializeMixo(bundle: MixoBundle): string {
  const manifest: MixoManifest = {
    format: 'cademixo',
    version: 1,
    ...(bundle.manifest.sourceName ? { sourceName: bundle.manifest.sourceName } : {}),
  };
  return [
    MIXO_MAGIC,
    JSON.stringify(manifest),
    `DRAWING ${bundle.drawing.length}`,
    bundle.drawing,
    `KEYS ${bundle.keys.length}`,
    bundle.keys,
    '',
  ].join('\n');
}

export function parseMixo(text: string): MixoBundle | null {
  if (!isMixo(text)) return null;
  let at = MIXO_MAGIC.length + 1;

  const manifestEnd = text.indexOf('\n', at);
  if (manifestEnd < 0) return null;
  let manifest: unknown;
  try {
    manifest = JSON.parse(text.slice(at, manifestEnd));
  } catch {
    return null;
  }
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    Array.isArray(manifest) ||
    (manifest as { format?: unknown }).format !== 'cademixo' ||
    (manifest as { version?: unknown }).version !== 1
  ) {
    return null;
  }
  at = manifestEnd + 1;

  const section = (name: 'DRAWING' | 'KEYS'): string | null => {
    const prefix = `${name} `;
    if (!text.startsWith(prefix, at)) return null;
    const lineEnd = text.indexOf('\n', at);
    if (lineEnd < 0) return null;
    const length = Number(text.slice(at + prefix.length, lineEnd));
    if (!Number.isInteger(length) || length < 0) return null;
    const start = lineEnd + 1;
    const end = start + length;
    if (end > text.length) return null;
    if (end < text.length && text[end] !== '\n') return null;
    at = end < text.length ? end + 1 : end;
    return text.slice(start, end);
  };

  const drawing = section('DRAWING');
  if (drawing === null) return null;
  const keys = section('KEYS');
  if (keys === null) return null;
  if (text.slice(at).trim() !== '') return null;

  const sourceName = (manifest as { sourceName?: unknown }).sourceName;
  return {
    drawing,
    keys,
    manifest: {
      format: 'cademixo',
      version: 1,
      ...(typeof sourceName === 'string' && sourceName !== '' ? { sourceName } : {}),
    },
  };
}
