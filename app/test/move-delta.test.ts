/**
 * El preview del movimiento usa `moveDelta`: la misma regla que el commit,
 * sin serializar, parsear ni reconstruir red. Estas pruebas fijan esa
 * equivalencia y la pureza del cálculo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyDrag, createEditor, moveDelta, projectOf, select } from '../src/editor/state.ts';
import { attachPoints } from '../src/editor/pins.ts';
import { networkStats } from '../src/editor/network.ts';
import { GEOMETRY, wirePoints } from '../src/model/project.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const ARRANQUE = readFileSync(join(FIXTURES, 'arranque-paro-motor-3f.cad'), 'latin1');

test('el delta coincide con la geometría que escribe el commit', () => {
  for (const [dx, dy] of [
    [3, 1],
    [-7, 5],
    [9, -4],
    [0, 6],
  ]) {
    const state = select(createEditor(ARRANQUE), [5]);
    const project = projectOf(state);
    const pins = attachPoints(project.records);
    const delta = moveDelta(project.records, pins, new Set([5]), dx!, dy!);
    const committed = projectOf(applyDrag(state, { kind: 'move', dx: dx!, dy: dy! }));
    const byId = new Map(committed.records.map((rec) => [rec.id, rec]));

    assert.ok(delta.positions.size > 0, `sin componentes para (${dx},${dy})`);
    for (const [id, pos] of delta.positions) {
      const rec = byId.get(id);
      assert.ok(rec, `el commit debe mover ${id}`);
      assert.equal(rec.geometry[GEOMETRY.x], pos.x);
      assert.equal(rec.geometry[GEOMETRY.y], pos.y);
    }
    assert.ok(delta.wires.size > 0, `sin cables afectados para (${dx},${dy})`);
    for (const [id, pts] of delta.wires) {
      const rec = byId.get(id);
      assert.ok(rec, `el commit debe reescribir el cable ${id}`);
      assert.deepEqual(wirePoints(rec), pts);
    }

    // Cada codo del preview es un registro nuevo en el commit, en el mismo orden.
    const before = new Set(project.records.map((rec) => rec.id));
    const added = committed.records.filter((rec) => !before.has(rec.id));
    assert.equal(added.length, delta.codos.length, `codos para (${dx},${dy})`);
    for (let i = 0; i < delta.codos.length; i++) {
      assert.ok(delta.wires.has(delta.codos[i]!.wireId), 'el codo pertenece a un cable afectado');
      assert.deepEqual(wirePoints(added[i]!), delta.codos[i]!.moving);
    }
  }
});

test('el delta no reconstruye red ni toca el texto o el historial', () => {
  const state = select(createEditor(ARRANQUE), [5]);
  const project = projectOf(state);
  const pins = attachPoints(project.records);
  const builds = networkStats.builds;
  const text = state.text;
  const past = state.past.length;

  for (let i = 0; i < 50; i++) {
    const delta = moveDelta(project.records, pins, new Set([5]), i + 1, 1);
    assert.ok(delta.positions.size + delta.wires.size > 0);
  }

  assert.equal(networkStats.builds, builds, 'el preview no debe construir red');
  assert.equal(state.text, text, 'el preview no debe escribir el documento');
  assert.equal(state.past.length, past, 'el preview no debe escribir historial');
  assert.equal(state.dirty, false, 'el preview no debe marcar el documento sucio');
});
