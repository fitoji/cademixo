import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEditor, applyDrag, projectOf, select } from '../src/editor/state.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const ARRANQUE = readFileSync(join(FIXTURES, 'arranque-paro-motor-3f.cad'), 'latin1');

test('el preview del arrastre cuesta menos de 2,5 ms por evento', () => {
  const state = select(createEditor(ARRANQUE), [5]);
  const ops = [
    { kind: 'move' as const, dx: 3, dy: 1 },
    { kind: 'bend' as const, id: 18, at: { x: 48, y: 108 }, to: { x: 52, y: 110 }, sheet: 0 },
    { kind: 'segment' as const, id: 18, at: { x: 48, y: 108 }, to: { x: 52, y: 110 }, sheet: 0 },
  ];
  const start = performance.now();
  for (let i = 0; i < 120; i++) {
    projectOf(applyDrag(state, ops[i % ops.length]!));
  }
  const perEvent = (performance.now() - start) / 120;
  assert.ok(perEvent < 2.5, `120 previews tardaron ${(perEvent * 120).toFixed(1)} ms (${perEvent.toFixed(2)} ms/evento)`);
});
