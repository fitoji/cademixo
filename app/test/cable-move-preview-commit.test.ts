/**
 * Preview y confirmación deben decidir lo mismo.
 *
 * El preview del lienzo usa `planCableMove(..., { validate: false })`; el commit
 * vuelve a pasar por la comprobación de identidades de borne. Estas pruebas
 * recorren un rango de desplazamientos de K2M y exigen que ambos lados acepten
 * o rechacen a la vez, y que cuando aceptan la geometría sea idéntica.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { wirePoints } from '../src/model/project.ts';
import { applyDragResult, createEditor, projectOf, select } from '../src/editor/state.ts';
import { cablePlanToDelta, planCableMove, prepareCableMove } from '../src/editor/wiring/cable-move.ts';

const FIXTURE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'motor_con_inversion_giro.cad'), 'latin1');
const K2M = 55;

test('el preview y la confirmación aceptan o rechazan K2M a la vez', () => {
  const records = projectOf(createEditor(FIXTURE)).records;
  const mismatch: string[] = [];
  for (const dx of [-24, -12, -6, 6, 12, 18, 24, 30, 36]) {
    for (const dy of [0, -6, 6, -12, 12]) {
      const preview = planCableMove(prepareCableMove(records, new Set([K2M])), dx, dy, { validate: false });
      const commit = applyDragResult(select(createEditor(FIXTURE), [K2M]), { kind: 'move', dx, dy }, 'ortogonal');
      if (preview.ok !== commit.ok) mismatch.push(`(${dx},${dy}) preview=${preview.ok} commit=${commit.ok}`);
    }
  }
  assert.deepEqual(mismatch, []);
});

test('cuando ambos aceptan, el preview es la geometría confirmada', () => {
  const records = projectOf(createEditor(FIXTURE)).records;
  for (const [dx, dy] of [
    [12, 0],
    [-12, 0],
    [24, 0],
  ] as const) {
    const preview = planCableMove(prepareCableMove(records, new Set([K2M])), dx, dy, { validate: false });
    const commit = applyDragResult(select(createEditor(FIXTURE), [K2M]), { kind: 'move', dx, dy }, 'ortogonal');
    assert.ok(preview.ok && commit.ok);
    const byId = new Map(projectOf(commit.state).records.map((r) => [r.id, r] as const));
    for (const [id, pts] of cablePlanToDelta(preview.proposal).wires) {
      assert.deepEqual(wirePoints(byId.get(id)!), pts);
    }
  }
});
