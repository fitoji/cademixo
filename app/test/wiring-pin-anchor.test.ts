import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../src/format/cade.ts';
import { buildProject, wirePoints, roundTrips } from '../src/model/project.ts';
import { buildNetwork } from '../src/editor/network.ts';
import { attachPoints } from '../src/editor/pins.ts';
import { createEditor, projectOf, addWire, setCableNumber, moveSelection, undo } from '../src/editor/state.ts';
import { wirePathsOf, pathPoints } from '../src/editor/wiring/types.ts';
import { WIRE_TEMPLATES } from '../src/symbols/templates.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const ARRANQUE = readFileSync(join(FIXTURES, 'arranque-paro-motor-3f.cad'), 'latin1');
const WIRE = WIRE_TEMPLATES[4000]!;

function motor() {
  const recs = buildProject(parse(ARRANQUE)).records;
  const id = recs.find((r) => r.code === 1000)!.id;
  const pin = attachPoints(recs).get(id)![0]!;
  return { id, pin };
}

function cableFrom(pin: { x: number; y: number }, to: { x: number; y: number }, cable: number) {
  let s = createEditor(ARRANQUE);
  s = addWire(s, pin, to, WIRE);
  const id = s.selection[0]!;
  s = setCableNumber(s, [id], cable);
  return { s, id };
}

test('el extremo anclado a un pin sigue al componente', () => {
  const m = motor();
  const { s } = cableFrom(m.pin, { x: 120, y: m.pin.y }, 97);
  const moved = moveSelection({ ...s, selection: [m.id] }, 12, 9);
  const net = buildNetwork(projectOf(moved).records);
  const path = wirePathsOf(net).find((p) => p.cable === 97)!;
  assert.equal(path.from.kind, 'pin');
  if (path.from.kind === 'pin') {
    assert.equal(path.from.componentId, m.id, 'la identidad del borne se conserva');
    assert.equal(path.from.pinIndex, 0);
  }
  assert.deepEqual(pathPoints(net, path)[0], { x: m.pin.x + 12, y: m.pin.y + 9 });
});

test('un cable con el extremo cerca pero fuera de la caja no se mueve', () => {
  const m = motor();
  // La caja del motor termina en x=54. x=57 está a 3 unidades: entraba en el
  // margen ±4 de la regla vieja, pero no es un borne (attachPoints sólo toma
  // extremos DENTRO de la caja).
  const { s, id } = cableFrom({ x: 57, y: 160 }, { x: 120, y: 160 }, 96);
  const before = wirePoints(projectOf(s).records.find((r) => r.id === id)!)!;
  const moved = moveSelection({ ...s, selection: [m.id] }, 12, 9);
  const after = wirePoints(projectOf(moved).records.find((r) => r.id === id)!)!;
  assert.deepEqual(after, before, 'la regla vieja de caja ±4 ya no aplica');
});

test('mover el componente inserta un codo y el cable sigue ortogonal', () => {
  const m = motor();
  const { s } = cableFrom(m.pin, { x: m.pin.x, y: m.pin.y + 40 }, 95);
  const beforeIds = projectOf(s).records.map((r) => r.id);

  const moved = moveSelection({ ...s, selection: [m.id] }, 12, 0);
  const records = projectOf(moved).records;
  const net = buildNetwork(records);
  const path = wirePathsOf(net).find((p) => p.cable === 95)!;
  const points = pathPoints(net, path);

  assert.deepEqual(points[0], { x: m.pin.x + 12, y: m.pin.y }, 'sigue al borne');
  assert.deepEqual(points.at(-1), { x: m.pin.x, y: m.pin.y + 40 }, 'el otro extremo no se mueve');
  assert.equal(points.length, 3, 'se insertó un codo');
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    assert.ok(Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01, 'tramo ortogonal');
  }
  assert.deepEqual(
    beforeIds.filter((id) => !records.some((r) => r.id === id)),
    [],
    'no se pierde ningún registro existente',
  );
  const ids = records.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, 'ids únicos');
  for (let i = 1; i < ids.length; i++) assert.ok(ids[i]! > ids[i - 1]!, 'ids crecientes');
  assert.equal(roundTrips(moved.text), true);
});

test('mover el componente con cable horizontal también inserta el codo', () => {
  const m = motor();
  const { s } = cableFrom(m.pin, { x: m.pin.x + 40, y: m.pin.y }, 94);
  const moved = moveSelection({ ...s, selection: [m.id] }, 0, 12);
  const net = buildNetwork(projectOf(moved).records);
  const path = wirePathsOf(net).find((p) => p.cable === 94)!;
  const points = pathPoints(net, path);
  assert.deepEqual(points[0], { x: m.pin.x, y: m.pin.y + 12 });
  assert.deepEqual(points.at(-1), { x: m.pin.x + 40, y: m.pin.y });
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    assert.ok(Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01, 'tramo ortogonal');
  }
});

test('el extremo del borne se mueve y el otro queda clavado', () => {
  const m = motor();
  const { s } = cableFrom(m.pin, { x: m.pin.x, y: m.pin.y + 40 }, 95);
  const moved = moveSelection({ ...s, selection: [m.id] }, 12, 0);
  const net = buildNetwork(projectOf(moved).records);
  const path = wirePathsOf(net).find((p) => p.cable === 95)!;
  const points = pathPoints(net, path);
  assert.deepEqual(points[0], { x: m.pin.x + 12, y: m.pin.y });
  assert.deepEqual(points.at(-1), { x: m.pin.x, y: m.pin.y + 40 });
});

test('los waypoints interiores lejanos se conservan', () => {
  const m = motor();
  let s = createEditor(ARRANQUE);
  s = addWire(s, m.pin, { x: m.pin.x, y: m.pin.y + 30 }, WIRE);
  const a = s.selection[0]!;
  s = addWire(s, { x: m.pin.x, y: m.pin.y + 30 }, { x: m.pin.x + 40, y: m.pin.y + 30 }, WIRE);
  const b = s.selection[0]!;
  s = addWire(s, { x: m.pin.x + 40, y: m.pin.y + 30 }, { x: m.pin.x + 40, y: m.pin.y + 60 }, WIRE);
  const c = s.selection[0]!;
  s = addWire(s, { x: m.pin.x + 40, y: m.pin.y + 60 }, { x: m.pin.x + 80, y: m.pin.y + 60 }, WIRE);
  const d = s.selection[0]!;
  s = setCableNumber(s, [a, b, c, d], 94);

  const moved = moveSelection({ ...s, selection: [m.id] }, 12, 0);
  const net = buildNetwork(projectOf(moved).records);
  const path = wirePathsOf(net).find((p) => p.cable === 94)!;
  const points = pathPoints(net, path);
  assert.deepEqual(points[0], { x: m.pin.x + 12, y: m.pin.y });
  // El codo adyacente se reubica; los dos de aguas abajo quedan clavados.
  assert.ok(points.some((p) => p.x === m.pin.x + 40 && p.y === m.pin.y + 30), 'primer codo lejano');
  assert.ok(points.some((p) => p.x === m.pin.x + 40 && p.y === m.pin.y + 60), 'segundo codo lejano');
  assert.deepEqual(points.at(-1), { x: m.pin.x + 80, y: m.pin.y + 60 });
});

test('el movimiento por pin es un solo undo y conserva el formato', () => {
  const m = motor();
  const { s } = cableFrom(m.pin, { x: 120, y: m.pin.y }, 93);
  const moved = moveSelection({ ...s, selection: [m.id] }, 12, 9);
  assert.equal(roundTrips(moved.text), true);
  assert.equal(undo(moved).text, s.text);
});
