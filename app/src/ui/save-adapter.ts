/**
 * Adaptador de almacenamiento: preservar, publicar, verificar y rotar.
 *
 * No conoce React ni el documento: recibe bytes ya validados por el códec y un
 * handle. Es el único sitio donde se toca el destino del usuario. Si no puede
 * conservar la generación anterior, NO escribe: el llamador ofrecerá «guardar
 * como archivo nuevo».
 */

import { decodeLatin1 } from '../format/latin1.ts';
import { VerificationError, readHandleBytes, writeVerifiedBytes } from './files.ts';
import { inspectTextForOpen } from './mixo-open.ts';
import {
  keepLatestGenerations,
  projectIdFor,
  revisionIdForBytes,
  type RecoveryEntry,
  type RecoverySnapshotStore,
} from './recovery-store.ts';

export type PublishOutcome =
  | { ok: true; previous: RecoveryEntry | null }
  | { ok: false; reason: 'preserve-failed' | 'write-failed' | 'verification-failed'; detail: string };

export interface PublishInput {
  readonly handle: FileSystemFileHandle;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly store: RecoverySnapshotStore;
  readonly now?: () => number;
  readonly keep?: number;
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'NotFoundError';
}

function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function publishRevision(input: PublishInput): Promise<PublishOutcome> {
  const clock = input.now ?? (() => Date.now());
  const projectId = projectIdFor(input.handle.name);
  const revisionId = revisionIdForBytes(input.bytes);
  let previous: RecoveryEntry | null = null;

  // 1. Leer y validar lo que hay hoy, antes de tocar el destino.
  let existing: Uint8Array<ArrayBuffer> | null = null;
  try {
    existing = await readHandleBytes(input.handle);
  } catch (error) {
    if (!isMissing(error)) {
      return { ok: false, reason: 'preserve-failed', detail: `no se pudo leer el archivo actual: ${describeFailure(error)}` };
    }
  }
  if (existing !== null && existing.byteLength > 0) {
    const text = decodeLatin1(existing);
    if (inspectTextForOpen(text).kind === 'rejected') {
      return { ok: false, reason: 'preserve-failed', detail: 'el archivo actual no es una generación válida' };
    }
    previous = {
      projectId,
      revisionId: revisionIdForBytes(existing),
      name: input.handle.name,
      bytes: existing,
      createdAt: clock(),
      verified: true,
    };
    try {
      await input.store.put(previous);
    } catch (error) {
      return { ok: false, reason: 'preserve-failed', detail: `no se pudo conservar la generación anterior: ${describeFailure(error)}` };
    }
  }

  // 2. Escribir la candidata y confirmarla por relectura.
  try {
    await writeVerifiedBytes(input.handle, input.bytes);
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof VerificationError ? 'verification-failed' : 'write-failed',
      detail: describeFailure(error),
    };
  }

  // 3. Sólo después de verificar la sucesora se rota: se guarda la nueva y se
  //    descartan las generaciones que exceden el mínimo acordado.
  const successor: RecoveryEntry = {
    projectId,
    revisionId,
    name: input.handle.name,
    bytes: input.bytes,
    createdAt: clock(),
    verified: true,
  };
  try {
    const before = await input.store.list(projectId);
    await input.store.put(successor);
    const keep = keepLatestGenerations([...before, successor], input.keep ?? 3);
    const kept = new Set(keep.map((e) => e.revisionId));
    for (const entry of before) {
      if (!kept.has(entry.revisionId)) await input.store.delete({ projectId, revisionId: entry.revisionId });
    }
  } catch {
    // La escritura confirmada vale aunque la rotación falle: nunca se pierde
    // la copia anterior por no poder podar las más viejas.
  }
  return { ok: true, previous };
}
