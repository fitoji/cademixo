import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../src/format/cade.ts';
import { buildProject, roundTrips } from '../src/model/project.ts';
import { buildNetwork } from '../src/editor/network.ts';
import { createEditor, projectOf, addWire, setCableNumber, moveSegment } from '../src/editor/state.ts';
import { wirePathsOf, pathPoints } from '../src/editor/wiring/types.ts';
import { WIRE_TEMPLATES } from '../src/symbols/templates.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const ARRANQUE = readFileSync(join(FIXTURES, 'arranque-paro-motor-3f.cad'), 'latin1');
const WIRE = WIRE_TEMPLATES[4000]!;

/** Cable A de tres tramos y, después, cable B con ids más altos. */
function dosCables() {
  let s = createEditor(ARRANQUE);
  s = addWire(s, { x: 300, y: 300 }, { x: 300, y: 330 }, WIRE);
  const a1 = s.selection[0]!;
  s = addWire(s, { x: 300, y: 330 }, { x: 330, y: 330 }, WIRE);
  const a2 = s.selection[0]!;
  s = addWire(s, { x: 330, y: 330 }, { x: 330, y: 360 }, WIRE);
  const a3 = s.selection[0]!;
  s = setCableNumber(s, [a1, a2, a3], 88);

  s = addWire(s, { x: 400, y: 400 }, { x: 400, y: 430 }, WIRE);
  const b1 = s.selection[0]!;
  s = addWire(s, { x: 400, y: 430 }, { x: 430, y: 430 }, WIRE);
  const b2 = s.selection[0]!;
  s = addWire(s, { x: 430, y: 430 }, { x: 430, y: 460 }, WIRE);
  const b3 = s.selection[0]!;
  return { s, a1, a2, a3, b1, b2, b3 };
}

test('mover un cable que no es el último conserva sus registros', () => {
  const { s, a1, a2, a3, b3 } = dosCables();
  const beforeCount = projectOf(s).records.length;
  const lastBefore = projectOf(s).records.find((r) => r.id === b3)!.raw;

  const moved = moveSegment(s, a2, { x: 315, y: 330 }, { x: 315, y: 345 });
  const records = projectOf(moved).records;

  assert.deepEqual(
    [a1, a2, a3].filter((id) => records.some((r) => r.id === id)),
    [a1, a2, a3],
    'los tres tramos de A siguen en el modelo',
  );
  assert.equal(records.length, beforeCount, 'no se pierden registros');
  assert.equal(records.find((r) => r.id === b3)!.raw, lastBefore, 'el último raw no absorbe texto ajeno');
  assert.equal(roundTrips(moved.text), true);
});

test('la geometría movida es la esperada y el id del cable no cambia', () => {
  const { s, a2 } = dosCables();
  const moved = moveSegment(s, a2, { x: 315, y: 330 }, { x: 315, y: 345 });
  const net = buildNetwork(projectOf(moved).records);
  const path = wirePathsOf(net).find((p) => p.cable === 88)!;
  assert.deepEqual(pathPoints(net, path), [
    { x: 300, y: 300 },
    { x: 300, y: 345 },
    { x: 330, y: 345 },
    { x: 330, y: 360 },
  ]);
});

test('mover un cable importado (cable 17 del fixture) no lo borra', () => {
  const net = buildNetwork(buildProject(parse(ARRANQUE)).records);
  const path = wirePathsOf(net).find((p) => p.cable === 17)!;
  const target = path.segmentIds[1]!;
  const seg = net.segments.get(target)!;

  const moved = moveSegment(createEditor(ARRANQUE), target, { x: seg.points.x1, y: seg.points.y1 }, {
    x: seg.points.x1,
    y: seg.points.y1 + 3,
  });
  const records = projectOf(moved).records;
  assert.deepEqual(
    path.segmentIds.filter((id) => records.some((r) => r.id === id)),
    path.segmentIds,
    'el cable importado sigue completo',
  );
  assert.equal(roundTrips(moved.text), true);
});

test('un movimiento que reduce tramos borra el sobrante sin duplicar ids', () => {
  const { s, a2 } = dosCables();
  const moved = moveSegment(s, a2, { x: 315, y: 330 }, { x: 315, y: 300 });
  const records = projectOf(moved).records;
  const ids = records.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, 'ids únicos');
  for (let i = 1; i < ids.length; i++) assert.ok(ids[i]! > ids[i - 1]!, 'ids crecientes');
});
