/**
 * La red final de una edición se reutiliza sólo si representa exactamente el
 * texto confirmado y el mismo alcance (documento completo). Si la última poda
 * cambió los registros, no hay red que reutilizar.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyDrag, createEditor, projectOf, select, takeCommittedNetwork } from '../src/editor/state.ts';
import { buildNetwork, type Network } from '../src/editor/network.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const ARRANQUE = readFileSync(join(FIXTURES, 'arranque-paro-motor-3f.cad'), 'latin1');

const signature = (net: Network) => ({
  nodes: [...net.nodes.keys()].sort(),
  segments: [...net.segments.keys()].sort(),
  junctions: net.junctionPoints.length,
});

test('la red reutilizada corresponde exactamente a los registros finales', () => {
  let reusable = 0;
  for (const dx of [-12, -6, -3, 3, 6, 12]) {
    for (const dy of [-9, -3, 3, 9]) {
      const next = applyDrag(select(createEditor(ARRANQUE), [5]), { kind: 'move', dx, dy });
      const shared = takeCommittedNetwork(next);
      if (shared === null) continue;
      reusable += 1;
      assert.deepEqual(signature(shared), signature(buildNetwork(projectOf(next).records)));
    }
  }
  assert.ok(reusable > 0, 'alguna edición debe dejar red reutilizable');
});

test('si la última poda cambia los registros, no hay red reutilizable', () => {
  // Mover el 21 a (-24, 12) deja una unión huérfana: la poda final la elimina
  // (y el gesto agrega un codo). La red construida antes ya no representa el
  // documento confirmado, así que no se reutiliza.
  const state = select(createEditor(ARRANQUE), [21]);
  const next = applyDrag(state, { kind: 'move', dx: -24, dy: 12 });
  assert.notEqual(next.text, state.text);

  const finalIds = new Set(projectOf(next).records.map((rec) => rec.id));
  const removed = projectOf(state).records.filter((rec) => !finalIds.has(rec.id));
  assert.ok(removed.length > 0, 'el caso debe eliminar registros en la poda final');
  assert.deepEqual(removed.map((rec) => rec.code), [4001], 'la poda elimina una unión');
  assert.equal(takeCommittedNetwork(next), null);
});
