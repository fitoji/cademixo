/**
 * Revisión inmutable de un proyecto MIXO/1 y codec de los bytes que se van a
 * escribir. La escritura NO vuelve a serializar: escribe exactamente los bytes
 * que acá se verificaron leyéndolos de vuelta.
 */

import { drawingHash } from './hash.ts';
import { decodeLatin1, encodeLatin1 } from './latin1.ts';
import { parseMixo, serializeMixo, type MixoManifest } from './mixo.ts';

export interface MixoRevision {
  readonly id: string;
  readonly manifest: Readonly<MixoManifest>;
  readonly drawing: string;
  readonly keys: string;
}

export interface EncodedRevision {
  readonly text: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

export type RevisionCheck =
  | { ok: true }
  | { ok: false; reason: 'parse' | 'mismatch'; detail: string };

export interface DocumentBytes {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly revisionId: string | null;
}

/**
 * Los bytes que se van a escribir o descargar. Devuelve `null` si la revisión
 * no sobrevive al viaje a bytes: en ese caso el llamador NO debe tocar el
 * destino, ni siquiera iniciar una descarga.
 */
export function buildVerifiedDocumentBytes(input: {
  drawing: string;
  native: boolean;
  keys?: string;
  manifest?: MixoManifest;
}): DocumentBytes | null {
  if (input.native) {
    if (input.keys === undefined || input.manifest === undefined) return null;
    const revision = captureMixoRevision({
      drawing: input.drawing,
      keys: input.keys,
      manifest: input.manifest,
    });
    const encoded = encodeRevision(revision);
    return verifyRevisionBytes(encoded.bytes, revision).ok
      ? { bytes: encoded.bytes, revisionId: revision.id }
      : null;
  }
  const bytes = encodeLatin1(input.drawing);
  return decodeLatin1(bytes) === input.drawing ? { bytes, revisionId: null } : null;
}

export function captureMixoRevision(input: {
  drawing: string;
  keys: string;
  manifest: MixoManifest;
}): MixoRevision {
  const manifest: MixoManifest = {
    format: 'cademixo',
    version: 1,
    ...(input.manifest.sourceName ? { sourceName: input.manifest.sourceName } : {}),
  };
  const text = serializeMixo({ drawing: input.drawing, keys: input.keys, manifest });
  return Object.freeze({
    id: drawingHash(text),
    manifest: Object.freeze(manifest),
    drawing: input.drawing,
    keys: input.keys,
  });
}

export function encodeRevision(revision: MixoRevision): EncodedRevision {
  const text = serializeMixo({
    drawing: revision.drawing,
    keys: revision.keys,
    manifest: revision.manifest as MixoManifest,
  });
  return { text, bytes: encodeLatin1(text) };
}

/**
 * Vuelve a leer los bytes y compara la revisión completa, no sólo el dibujo:
 * manifiesto, atajos, longitud e identidad. Un byte cambiado sin cambiar el
 * tamaño y un truncamiento se rechazan antes de tocar el archivo del usuario.
 */
export function verifyRevisionBytes(bytes: Uint8Array, revision: MixoRevision): RevisionCheck {
  const text = decodeLatin1(bytes);
  const parsed = parseMixo(text);
  if (parsed === null) return { ok: false, reason: 'parse', detail: 'los bytes no re-parsean como MIXO/1' };

  if (
    parsed.drawing !== revision.drawing ||
    parsed.keys !== revision.keys ||
    parsed.manifest.format !== revision.manifest.format ||
    parsed.manifest.version !== revision.manifest.version ||
    parsed.manifest.sourceName !== revision.manifest.sourceName ||
    drawingHash(text) !== revision.id
  ) {
    return { ok: false, reason: 'mismatch', detail: 'los bytes leídos no coinciden con la revisión capturada' };
  }
  return { ok: true };
}
