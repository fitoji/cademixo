import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { roundTrips } from '../src/model/project.ts';
import { buildNetwork, netKey } from '../src/editor/network.ts';
import { validate } from '../src/editor/network.ts';
import {
  createEditor,
  projectOf,
  addWire,
  addRoutedWire,
  setCableNumber,
  deleteSelection,
  undo,
  removeJunction,
} from '../src/editor/state.ts';
import { JUNCTION_TEMPLATE, WIRE_TEMPLATES } from '../src/symbols/templates.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const ARRANQUE = readFileSync(join(FIXTURES, 'arranque-paro-motor-3f.cad'), 'latin1');
const WIRE = WIRE_TEMPLATES[4000]!;
const JUNCTION = JUNCTION_TEMPLATE!;

function hostWire() {
  let s = createEditor(ARRANQUE);
  s = addWire(s, { x: 100, y: 100 }, { x: 200, y: 100 }, WIRE);
  const host = s.selection[0]!;
  s = setCableNumber(s, [host], 90);
  return { s, host };
}

test('soltar un cable sobre el interior de otro crea el 4001', () => {
  const { s } = hostWire();
  const joined = addWire(s, { x: 150, y: 100 }, { x: 150, y: 160 }, WIRE, JUNCTION);
  const net = buildNetwork(projectOf(joined).records);
  const node = net.nodes.get(netKey(0, 150, 100))!;
  assert.ok(node, 'existe el nodo en el punto de derivación');
  assert.equal(node.junction, true, 'hay un registro 4001 ahí');
  assert.equal(
    validate(projectOf(joined).records).some((f) => f.code === 'tee-without-junction' && f.at?.x === 150),
    false,
    'ya no avisa de T sin unión',
  );
});

test('el cruce sin extremo sobre el cable no crea unión', () => {
  const { s } = hostWire();
  // Los dos extremos están fuera del tramo (100,100)-(200,100).
  const crossed = addWire(s, { x: 150, y: 90 }, { x: 150, y: 110 }, WIRE, JUNCTION);
  const net = buildNetwork(projectOf(crossed).records);
  const node = net.nodes.get(netKey(0, 150, 100));
  assert.equal(node?.junction ?? false, false, 'el cruce sigue sin conectar');
});

test('la unión automática entra en el mismo undo', () => {
  const { s } = hostWire();
  const joined = addWire(s, { x: 150, y: 100 }, { x: 150, y: 160 }, WIRE, JUNCTION);
  assert.equal(undo(joined).text, s.text, 'un solo undo restaura cable y unión');
  assert.equal(roundTrips(joined.text), true);
});

test('addRoutedWire también crea la unión al caer sobre un tramo', () => {
  const { s } = hostWire();
  const joined = addRoutedWire(s, { x: 150, y: 100 }, { x: 150, y: 160 }, [], WIRE, JUNCTION);
  const net = buildNetwork(projectOf(joined).records);
  assert.equal(net.nodes.get(netKey(0, 150, 100))?.junction, true);
});

test('borrar el cable que sostenía un empalme quita su 4001 huérfano', () => {
  const { s, host } = hostWire();
  let joined = addWire(s, { x: 150, y: 100 }, { x: 150, y: 160 }, WIRE, JUNCTION);
  const net = buildNetwork(projectOf(joined).records);
  const junctionIds = net.junctionPoints.filter((p) => p.x === 150 && p.y === 100).map((p) => p.recordId);
  assert.equal(junctionIds.length, 1);

  joined = deleteSelection({ ...joined, selection: [host] });
  const after = projectOf(joined).records;
  assert.equal(after.some((r) => junctionIds.includes(r.id)), false, 'el 4001 se fue con el cable');
});

test('removeJunction borra sólamente el registro apuntado', () => {
  const { s } = hostWire();
  const joined = addWire(s, { x: 150, y: 100 }, { x: 150, y: 160 }, WIRE, JUNCTION);
  const id = buildNetwork(projectOf(joined).records).junctionPoints.find(
    (p) => p.x === 150 && p.y === 100,
  )!.recordId;
  const removed = removeJunction(joined, id);
  assert.equal(projectOf(removed).records.some((r) => r.id === id), false);
  assert.equal(undo(removed).text, joined.text);
});
