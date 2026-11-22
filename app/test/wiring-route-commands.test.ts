import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../src/format/cade.ts';
import { buildProject, wirePoints } from '../src/model/project.ts';
import { buildNetwork, cableNumberOf } from '../src/editor/network.ts';
import { createEditor, projectOf, addRoutedWire, undo } from '../src/editor/state.ts';
import { wirePathsOf } from '../src/editor/wiring/types.ts';
import { WIRE_TEMPLATES } from '../src/symbols/templates.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const ARRANQUE = readFileSync(join(FIXTURES, 'arranque-paro-motor-3f.cad'), 'latin1');
const WIRE = WIRE_TEMPLATES[4000]!;

test('addRoutedWire escribe una polilínea ortogonal con un número de cable nuevo', () => {
  let s = createEditor(ARRANQUE);
  const before = buildProject(parse(ARRANQUE)).records.filter((r) => r.kind === 'connection');
  const maxCable = Math.max(...before.map(cableNumberOf));

  s = addRoutedWire(s, { x: 500, y: 500 }, { x: 560, y: 530 }, [], WIRE);
  const records = projectOf(s).records;
  const added = records.filter((r) => r.kind === 'connection' && r.id > Math.max(...before.map((r) => r.id)));
  assert.equal(added.length, 2, 'HV con un codo = dos tramos');
  for (const rec of added) assert.equal(cableNumberOf(rec), maxCable + 1, 'todos comparten número');

  const path = wirePathsOf(buildNetwork(records)).find((p) => p.cable === maxCable + 1)!;
  assert.equal(path.segmentIds.length, 2);
  assert.equal(path.vertices.length, 1, 'un vértice interior');
  assert.deepEqual(path.vertices[0], { x: 560, y: 500 });
});

test('la ruta escrita es ortogonal y respeta los extremos exactos', () => {
  let s = createEditor(ARRANQUE);
  s = addRoutedWire(s, { x: 500, y: 500 }, { x: 560, y: 530 }, [], WIRE);
  const records = projectOf(s).records;
  const ids = s.selection;
  const segs = ids.map((id) => wirePoints(records.find((r) => r.id === id)!)!);
  assert.deepEqual({ x: segs[0]!.x1, y: segs[0]!.y1 }, { x: 500, y: 500 });
  assert.deepEqual({ x: segs.at(-1)!.x2, y: segs.at(-1)!.y2 }, { x: 560, y: 530 });
  for (const p of segs) {
    assert.ok(Math.abs(p.x1 - p.x2) < 0.01 || Math.abs(p.y1 - p.y2) < 0.01);
  }
});

test('con un obstáculo la ruta escribe más tramos y no lo atraviesa', () => {
  let s = createEditor(ARRANQUE);
  s = addRoutedWire(s, { x: 500, y: 500 }, { x: 560, y: 500 }, [
    { minX: 520, minY: 490, maxX: 540, maxY: 510 },
  ], WIRE);
  const records = projectOf(s).records;
  const segs = s.selection.map((id) => wirePoints(records.find((r) => r.id === id)!)!);
  assert.ok(segs.length >= 3, 'tuvo que desviarse');
  for (const p of segs) {
    const insideX = p.x1 > 520 && p.x1 < 540 && p.x2 > 520 && p.x2 < 540;
    const insideY = p.y1 > 490 && p.y1 < 510 && p.y2 > 490 && p.y2 < 510;
    assert.equal(insideX && insideY, false);
  }
});

test('addRoutedWire es una sola operación de deshacer', () => {
  const base = createEditor(ARRANQUE);
  const routed = addRoutedWire(base, { x: 500, y: 500 }, { x: 560, y: 530 }, [], WIRE);
  assert.equal(undo(routed).text, base.text, 'un undo restaura el archivo original');
});
