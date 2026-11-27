/**
 * Generaciones buenas conservadas fuera del archivo candidato.
 *
 * El núcleo es puro y se prueba sin navegador; el adaptador de IndexedDB es el
 * único que toca el almacenamiento del perfil. Guardamos el mínimo: la última
 * generación verificada y unas pocas anteriores, por proyecto y revisión.
 * Nunca se usa esta copia para reparar el original sin intervención del usuario.
 */

import { cadFileName } from '../format/filename.ts';
import { drawingHash } from '../format/hash.ts';
import { decodeLatin1 } from '../format/latin1.ts';

export interface RecoveryEntry {
  readonly projectId: string;
  readonly revisionId: string;
  readonly name: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly createdAt: number;
  readonly verified: true;
}

export interface RecoveryKey {
  readonly projectId: string;
  readonly revisionId: string;
}

export interface RecoverySnapshotStore {
  list(projectId: string): Promise<RecoveryEntry[]>;
  put(entry: RecoveryEntry): Promise<void>;
  delete(key: RecoveryKey): Promise<void>;
}

/** La identidad del proyecto no depende de la revisión ni del handle elegido. */
export function projectIdFor(name: string): string {
  return cadFileName(name).toLowerCase();
}

export function revisionIdForBytes(bytes: Uint8Array): string {
  return drawingHash(decodeLatin1(bytes));
}

export function recoveryKey(projectId: string, revisionId: string): string {
  return `${projectId}:${revisionId}`;
}

/** Conserva al menos la última generación; `limit` nunca baja de 1. */
export function keepLatestGenerations(entries: readonly RecoveryEntry[], limit = 3): RecoveryEntry[] {
  const floor = Math.max(1, limit);
  const byRevision = new Map<string, RecoveryEntry>();
  for (const entry of entries) {
    const seen = byRevision.get(entry.revisionId);
    if (!seen || entry.createdAt >= seen.createdAt) byRevision.set(entry.revisionId, entry);
  }
  return [...byRevision.values()].toSorted((a, b) => a.createdAt - b.createdAt).slice(-floor);
}

/** Adaptador en memoria para pruebas: clona los bytes para detectar aliasing. */
export function createMemoryRecoveryStore(): RecoverySnapshotStore {
  const entries = new Map<string, RecoveryEntry>();
  return {
    async list(projectId) {
      return [...entries.values()]
        .filter((e) => e.projectId === projectId)
        .toSorted((a, b) => a.createdAt - b.createdAt);
    },
    async put(entry) {
      entries.set(recoveryKey(entry.projectId, entry.revisionId), structuredClone(entry));
    },
    async delete(key) {
      entries.delete(recoveryKey(key.projectId, key.revisionId));
    },
  };
}

const DB_NAME = 'cademixo-recuperacion';
const DB_STORE = 'generaciones';

type StoredEntry = Omit<RecoveryEntry, 'bytes'> & { key: string; bytes: Uint8Array };

function fail(operation: string, cause: unknown): Error {
  return new Error(`no se pudo ${operation} la copia de recuperación`, { cause });
}

function requestResult<T>(request: IDBRequest<T>, operation: string): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(fail(operation, request.error));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(fail('abrir', request.error));
  });
}

function transactionDone(tx: IDBTransaction, operation: string): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(fail(operation, tx.error));
    tx.onabort = () => reject(fail(operation, tx.error));
  });
}

/** Adaptador del navegador. Si no hay IndexedDB, `put` rechaza y no se sobrescribe. */
export function browserRecoveryStore(): RecoverySnapshotStore {
  return {
    async list(projectId) {
      const db = await openDatabase();
      try {
        const tx = db.transaction(DB_STORE, 'readonly');
        const all = await requestResult(tx.objectStore(DB_STORE).getAll() as IDBRequest<StoredEntry[]>, 'listar');
        return all
          .filter((e) => e.projectId === projectId)
          .toSorted((a, b) => a.createdAt - b.createdAt)
          .map((e) => ({ ...e, bytes: new Uint8Array(e.bytes) }));
      } finally {
        db.close();
      }
    },
    async put(entry) {
      const db = await openDatabase();
      try {
        const tx = db.transaction(DB_STORE, 'readwrite');
        const stored: StoredEntry = {
          ...entry,
          key: recoveryKey(entry.projectId, entry.revisionId),
          bytes: new Uint8Array(entry.bytes),
        };
        tx.objectStore(DB_STORE).put(stored);
        await transactionDone(tx, 'guardar');
      } finally {
        db.close();
      }
    },
    async delete(key) {
      const db = await openDatabase();
      try {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).delete(recoveryKey(key.projectId, key.revisionId));
        await transactionDone(tx, 'borrar');
      } finally {
        db.close();
      }
    },
  };
}
