import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createMemoryRecoveryStore,
  keepLatestGenerations,
  projectIdFor,
  recoveryKey,
  revisionIdForBytes,
  type RecoveryEntry,
} from '../src/ui/recovery-store.ts';
import { serializeMixo } from '../src/format/mixo.ts';
import { encodeLatin1 } from '../src/format/latin1.ts';

const drawing = 'CADe_SIMU*1*3000#-X##1#2##*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0*0#';
const keys = JSON.stringify({ version: 2, bindings: { Q1: 'q' } });
const bytes = (text: string) => encodeLatin1(text);
const bundle = (n: number) =>
  serializeMixo({ drawing: `${drawing}\n*${n}*`, keys, manifest: { format: 'cademixo', version: 1 } });

function entry(revision: string, createdAt: number, text = bundle(createdAt)): RecoveryEntry {
  return {
    projectId: 'plano.mixo',
    revisionId: revision,
    name: 'plano.mixo',
    bytes: bytes(text),
    createdAt,
    verified: true,
  };
}

test('proyecto y revisión identifican cada copia sin depender del archivo candidato', () => {
  assert.equal(projectIdFor('PLANO.MIXO'), 'plano.cad');
  assert.equal(projectIdFor('plano.cade'), 'plano.cad');
  assert.equal(recoveryKey('plano.mixo', 'abc'), 'plano.mixo:abc');
  assert.notEqual(revisionIdForBytes(bytes(bundle(1))), revisionIdForBytes(bytes(bundle(2))));
});

test('sólo se conservan las últimas generaciones verificadas', () => {
  const entries = [entry('a', 1), entry('b', 2), entry('c', 3), entry('d', 4)];
  const kept = keepLatestGenerations(entries, 3);
  assert.deepEqual(
    kept.map((e) => e.revisionId),
    ['b', 'c', 'd'],
  );
  assert.deepEqual(
    keepLatestGenerations(entries.slice(0, 2), 3).map((e) => e.revisionId),
    ['a', 'b'],
  );
});

test('la tienda en memoria clona los bytes y permite borrar por proyecto', async () => {
  const store = createMemoryRecoveryStore();
  const first = entry('a', 1);
  await store.put(first);
  first.bytes[0] = 0x00;

  const listed = await store.list('plano.mixo');
  assert.equal(listed.length, 1);
  assert.notEqual(listed[0]?.bytes[0], 0x00);
  assert.equal((await store.list('otro.mixo')).length, 0);

  await store.delete({ projectId: 'plano.mixo', revisionId: 'a' });
  assert.equal((await store.list('plano.mixo')).length, 0);
});
