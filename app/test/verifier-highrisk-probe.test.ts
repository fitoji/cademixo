import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { encodeLatin1 } from '../src/format/latin1.ts';
import { serializeMixo } from '../src/format/mixo.ts';
import { bytesEqual, writeVerifiedBytes } from '../src/ui/files.ts';
import {
  createMemoryRecoveryStore,
  keepLatestGenerations,
  projectIdFor,
  recoveryKey,
  revisionIdForBytes,
  type RecoveryEntry,
  type RecoverySnapshotStore,
} from '../src/ui/recovery-store.ts';
import { publishRevision } from '../src/ui/save-adapter.ts';
import { describeDestination } from '../src/ui/storage-contract.ts';

const drawing = 'CADe_SIMU*1*3000#-X##1#2##*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0#';
const keys = JSON.stringify({ version: 2, bindings: { Q1: 'q' } });
const text = (n: number) =>
  serializeMixo({ drawing: `${drawing}\n*${n}*`, keys, manifest: { format: 'cademixo', version: 1 } });
const bytes = (n: number) => encodeLatin1(text(n));
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

type HandleOpts = { name?: string; failWrite?: boolean; failClose?: boolean; corruptAfterWrite?: boolean };
function handle(initial: Uint8Array, opts: HandleOpts = {}) {
  let current: Uint8Array<ArrayBufferLike> = new Uint8Array(initial);
  const writes: Uint8Array<ArrayBufferLike>[] = [];
  const name = opts.name ?? 'plano.mixo';
  const h = {
    name,
    async getFile() {
      return new File([new Uint8Array(current)], name);
    },
    async createWritable() {
      return {
        async write(chunk: Uint8Array) {
          if (opts.failWrite) throw new Error('disco lleno');
          writes.push(new Uint8Array(chunk));
        },
        async close() {
          if (opts.failClose) throw new Error('close fallo');
          if (opts.failWrite) return;
          current = opts.corruptAfterWrite ? encodeLatin1('basura') : (writes.at(-1) ?? current);
        },
        async abort() {},
      };
    },
  };
  return { handle: h as unknown as FileSystemFileHandle, writes, getBytes: () => new Uint8Array(current) };
}

test('S4/S6: si preservar falla por cuota, archivo byte-idéntico y sin escritura', async () => {
  const store = createMemoryRecoveryStore();
  const realPut = store.put.bind(store);
  let putCalls = 0;
  const quotaStore: RecoverySnapshotStore = {
    list: (p) => store.list(p),
    delete: (k) => store.delete(k),
    put: async (e) => {
      putCalls += 1;
      if (putCalls === 1) throw new Error('cuota excedida');
      return realPut(e);
    },
  };
  const h = handle(bytes(1));
  const before = sha(h.getBytes());
  const result = await publishRevision({ handle: h.handle, bytes: bytes(2), store: quotaStore, now: () => 10 });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'preserve-failed');
    assert.match(result.detail, /cuota excedida/);
  }
  assert.equal(h.writes.length, 0);
  assert.equal(sha(h.getBytes()), before);
});

test('S2: fallo de close no confirma; archivo byte-idéntico con copia previa guardada', async () => {
  const store = createMemoryRecoveryStore();
  const h = handle(bytes(1), { failClose: true });
  const before = sha(h.getBytes());
  const result = await publishRevision({ handle: h.handle, bytes: bytes(2), store, now: () => 1 });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'write-failed');
  assert.equal(sha(h.getBytes()), before);
  const kept = await store.list('plano.cad');
  assert.equal(kept.length, 1);
  assert.equal(kept[0]?.revisionId, revisionIdForBytes(bytes(1)));
});

test('S2: relectura distinta no es éxito y no rota la copia buena', async () => {
  const store = createMemoryRecoveryStore();
  const h = handle(bytes(1), { corruptAfterWrite: true });
  const result = await publishRevision({ handle: h.handle, bytes: bytes(2), store, now: () => 1 });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'verification-failed');
  const kept = await store.list('plano.cad');
  assert.deepEqual(kept.map((e) => e.revisionId), [revisionIdForBytes(bytes(1))]);
});

test('S2/S4: archivo existente vacío no se preserva pero se escribe sin fallar', async () => {
  const store = createMemoryRecoveryStore();
  const h = handle(new Uint8Array(0));
  const result = await publishRevision({ handle: h.handle, bytes: bytes(2), store, now: () => 1 });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.previous, null);
  assert.ok(bytesEqual(h.getBytes(), bytes(2)));
});

test('S4: keep=0 conserva al menos la última generación verificada', () => {
  const e = (rev: string, at: number): RecoveryEntry => ({
    projectId: 'p', revisionId: rev, name: 'p.cad', bytes: bytes(1), createdAt: at, verified: true,
  });
  const kept = keepLatestGenerations([e('a', 1), e('b', 2)], 0);
  assert.equal(kept.length, 1);
  assert.equal(kept[0]?.revisionId, 'b');
});

test('S4: identidad por proyecto/revisión; misma revisión no duplica', async () => {
  const store = createMemoryRecoveryStore();
  assert.equal(projectIdFor('PLANO.MIXO'), 'plano.cad');
  assert.equal(recoveryKey('p', 'r'), 'p:r');
  const a: RecoveryEntry = {
    projectId: 'plano.cad', revisionId: 'r1', name: 'plano.mixo', bytes: bytes(1), createdAt: 1, verified: true,
  };
  await store.put(a);
  await store.put({ ...a, createdAt: 9 });
  const listed = await store.list('plano.cad');
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.createdAt, 9);
});

test('S2: writeVerifiedBytes confirma por relectura; fallo de close no es éxito', async () => {
  const h = handle(new Uint8Array(0));
  await writeVerifiedBytes(h.handle, bytes(3));
  assert.ok(bytesEqual(h.getBytes(), bytes(3)));
  const bad = handle(new Uint8Array(0), { failClose: true });
  await assert.rejects(() => writeVerifiedBytes(bad.handle, bytes(3)), /close fallo/);
  assert.ok(!bytesEqual(new Uint8Array(0), new Uint8Array([1])));
});

test('S1/S3/S6: contrato distingue escritura verificada de descarga iniciada', () => {
  const file = describeDestination('file-handle');
  const dl = describeDestination('download');
  const rec = describeDestination('recovery-copy');
  assert.equal(file.guarantee, 'verified');
  assert.equal(file.preservesPreviousGeneration, true);
  assert.equal(dl.guarantee, 'download-started');
  assert.equal(dl.preservesPreviousGeneration, false);
  for (const c of [file, dl, rec]) assert.equal(c.repairsOriginal, false);
  assert.equal(rec.survivesBrowserDataClear, false);
  assert.match(rec.note, /datos del sitio/);
});

test('S2/S4: guardar dos veces los mismos bytes no pierde la copia buena', async () => {
  const store = createMemoryRecoveryStore();
  let clock = 0;
  const h1 = handle(bytes(1));
  await publishRevision({ handle: h1.handle, bytes: bytes(2), store, now: () => ++clock, keep: 1 });
  const h2 = handle(bytes(2));
  const again = await publishRevision({ handle: h2.handle, bytes: bytes(2), store, now: () => ++clock, keep: 1 });
  assert.equal(again.ok, true);
  const kept = await store.list('plano.cad');
  assert.equal(kept.length, 1);
  assert.ok(bytesEqual(kept[0]!.bytes, bytes(2)));
});
