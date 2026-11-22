import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wirePoints, roundTrips } from '../src/model/project.ts';
import { buildNetwork, cableNumberOf } from '../src/editor/network.ts';
import { createEditor, projectOf, addWire, setCableNumber, moveSegment, undo } from '../src/editor/state.ts';
import { wirePathsOf, pathPoints } from '../src/editor/wiring/types.ts';
import { WIRE_TEMPLATES } from '../src/symbols/templates.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const ARRANQUE = readFileSync(join(FIXTURES, 'arranque-paro-motor-3f.cad'), 'latin1');
const WIRE = WIRE_TEMPLATES[4000]!;

/** Un cable escalonado de tres tramos; devuelve el editor y los ids en orden. */
function stair() {
  let s = createEditor(ARRANQUE);
  s = addWire(s, { x: 100, y: 100 }, { x: 100, y: 130 }, WIRE);
  const first = s.selection[0]!;
  s = addWire(s, { x: 100, y: 130 }, { x: 130, y: 130 }, WIRE);
  const middle = s.selection[0]!;
  s = addWire(s, { x: 130, y: 130 }, { x: 130, y: 160 }, WIRE);
  const last = s.selection[0]!;
  // El fixture ya tiene cables numerados del 1 al 18: éste va aparte.
  s = setCableNumber(s, [first, middle, last], 99);
  return { s, first, middle, last };
}

test('mover un tramo interior desplaza sus dos vértices y mantiene la ortogonalidad', () => {
  const { s, middle } = stair();
  const moved = moveSegment(s, middle, { x: 115, y: 130 }, { x: 115, y: 145 });
  const records = projectOf(moved).records;
  const path = wirePathsOf(buildNetwork(records)).find((p) => p.segmentIds.includes(middle))!;
  const points = pathPoints(buildNetwork(records), path);
  assert.deepEqual(points, [
    { x: 100, y: 100 },
    { x: 100, y: 145 },
    { x: 130, y: 145 },
    { x: 130, y: 160 },
  ]);
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    assert.ok(Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01);
  }
});

test('conserva el número de cable y el round-trip', () => {
  const { s, middle } = stair();
  const beforeCable = cableNumberOf(projectOf(s).records.find((r) => r.id === middle)!);
  const moved = moveSegment(s, middle, { x: 115, y: 130 }, { x: 115, y: 145 });
  assert.equal(roundTrips(moved.text), true);
  const rec = projectOf(moved).records.find((r) => r.id === middle)!;
  assert.equal(cableNumberOf(rec), beforeCable);
});

test('un gesto de tramo es una sola operación de deshacer', () => {
  const { s, middle } = stair();
  const moved = moveSegment(s, middle, { x: 115, y: 130 }, { x: 115, y: 145 });
  assert.equal(undo(moved).text, s.text);
});

test('arrastrar sin cambio de eje no toca el archivo', () => {
  const { s, middle } = stair();
  const moved = moveSegment(s, middle, { x: 115, y: 130 }, { x: 115, y: 130 });
  assert.equal(moved.text, s.text);
});

test('mover un tramo no altera los waypoints fijos del resto del cable', () => {
  let s = createEditor(ARRANQUE);
  s = addWire(s, { x: 200, y: 100 }, { x: 200, y: 130 }, WIRE);
  const a = s.selection[0]!;
  s = addWire(s, { x: 200, y: 130 }, { x: 230, y: 130 }, WIRE);
  const b = s.selection[0]!;
  s = addWire(s, { x: 230, y: 130 }, { x: 230, y: 160 }, WIRE);
  const c = s.selection[0]!;
  s = addWire(s, { x: 230, y: 160 }, { x: 260, y: 160 }, WIRE);
  const d = s.selection[0]!;
  s = setCableNumber(s, [a, b, c, d], 98);

  const moved = moveSegment(s, b, { x: 215, y: 130 }, { x: 215, y: 145 });
  const net = buildNetwork(projectOf(moved).records);
  const path = wirePathsOf(net).find((p) => p.segmentIds.includes(b))!;
  const points = pathPoints(net, path);
  assert.deepEqual(points[0], { x: 200, y: 100 }, 'primer borne intacto');
  assert.deepEqual(points.at(-1), { x: 260, y: 160 }, 'último borne intacto');
  assert.ok(points.some((p) => p.x === 230 && p.y === 160), 'el codo lejano sigue ahí');
});

test('el tramo extremo conserva el borne de origen (comportamiento bend)', () => {
  const { s, first } = stair();
  const before = wirePoints(projectOf(s).records.find((r) => r.id === first)!)!;
  const moved = moveSegment(s, first, { x: 100, y: 115 }, { x: 140, y: 115 });
  const net = buildNetwork(projectOf(moved).records);
  const path = wirePathsOf(net).find((p) => p.segmentIds.includes(first))!;
  const points = pathPoints(net, path);
  assert.deepEqual(points[0], { x: before.x1, y: before.y1 }, 'el pin de origen no se mueve');
  assert.ok(points.length >= 4, 'se insertó un codo');
});
