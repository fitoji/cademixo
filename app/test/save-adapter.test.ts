import { test } from 'node:test';
import assert from 'node:assert/strict';

import { encodeLatin1 } from '../src/format/latin1.ts';
import { serializeMixo } from '../src/format/mixo.ts';
import { createMemoryRecoveryStore, revisionIdForBytes } from '../src/ui/recovery-store.ts';
import { publishRevision } from '../src/ui/save-adapter.ts';

const drawing = 'CADe_SIMU*1*3000#-X##1#2##*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0#';
const keys = JSON.stringify({ version: 2, bindings: { Q1: 'q' } });
const text = (n: number) =>
  serializeMixo({ drawing: `${drawing}\n*${n}*`, keys, manifest: { format: 'cademixo', version: 1 } });

function handle(initial: Uint8Array, options: { failWrite?: boolean; corruptAfterWrite?: boolean } = {}) {
  let current = initial;
  const writes: Uint8Array[] = [];
  const h = {
    name: 'plano.mixo',
    async getFile() {
      return new File([new Uint8Array(current)], 'plano.mixo');
    },
    async createWritable() {
      return {
        async write(chunk: Uint8Array) {
          if (options.failWrite) throw new Error('disco lleno');
          writes.push(new Uint8Array(chunk));
        },
        async close() {
          if (!options.failWrite) {
            current = options.corruptAfterWrite ? new Uint8Array([1, 2, 3]) : (writes.at(-1) ?? current);
          }
        },
        async abort() {},
      };
    },
  };
  return { handle: h as unknown as FileSystemFileHandle, writes };
}

test('conserva la generación previa antes de escribir y rota después de verificar', async () => {
  const store = createMemoryRecoveryStore();
  const first = handle(encodeLatin1(text(1)));
  let clock = 0;
  const firstResult = await publishRevision({
    handle: first.handle,
    bytes: encodeLatin1(text(2)),
    store,
    now: () => ++clock,
  });
  assert.equal(firstResult.ok, true);
  assert.ok(firstResult.previous);
  assert.equal(firstResult.previous?.revisionId, revisionIdForBytes(encodeLatin1(text(1))));
  assert.equal((await store.list('plano.cad')).length, 2);
  assert.deepEqual([...first.writes[0]!], [...encodeLatin1(text(2))]);

  const second = handle(encodeLatin1(text(2)));
  await publishRevision({
    handle: second.handle,
    bytes: encodeLatin1(text(3)),
    store,
    now: () => ++clock,
    keep: 2,
  });
  const kept = await store.list('plano.cad');
  assert.equal(kept.length, 2);
  assert.equal(kept.at(-1)?.revisionId, revisionIdForBytes(encodeLatin1(text(3))));
});

test('si no se puede conservar la generación anterior, no escribe', async () => {
  const store = createMemoryRecoveryStore();
  const failing = {
    ...store,
    put: async () => {
      throw new Error('sin cuota');
    },
  };
  const h = handle(encodeLatin1(text(1)));
  const result = await publishRevision({
    handle: h.handle,
    bytes: encodeLatin1(text(2)),
    store: failing,
    now: () => 1,
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? '' : result.reason, 'preserve-failed');
  assert.equal(h.writes.length, 0);
});

test('un archivo actual corrupto no se sobreescribe', async () => {
  const store = createMemoryRecoveryStore();
  const h = handle(new Uint8Array([1, 2, 3]));
  const result = await publishRevision({
    handle: h.handle,
    bytes: encodeLatin1(text(2)),
    store,
    now: () => 1,
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? '' : result.reason, 'preserve-failed');
  assert.equal(h.writes.length, 0);
});

test('un fallo de relectura no confirma el guardado ni rota las copias', async () => {
  const store = createMemoryRecoveryStore();
  const h = handle(encodeLatin1(text(1)), { corruptAfterWrite: true });
  const result = await publishRevision({
    handle: h.handle,
    bytes: encodeLatin1(text(2)),
    store,
    now: () => 1,
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? '' : result.reason, 'verification-failed');
  // La generación anterior quedó guardada; la fallida nunca se rotó ni se guardó.
  const kept = await store.list('plano.cad');
  assert.deepEqual(
    kept.map((e) => e.revisionId),
    [revisionIdForBytes(encodeLatin1(text(1)))],
  );
});
