import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../src/format/cade.ts';
import { buildProject, roundTrips, wirePoints } from '../src/model/project.ts';
import { buildNetwork } from '../src/editor/network.ts';
import {
  createEditor,
  projectOf,
  addWire,
  addRoutedWire,
  addJunction,
  removeJunction,
  moveVertex,
  moveSegment,
  deleteVertex,
  moveSelection,
  type EditorState,
} from '../src/editor/state.ts';
import { JUNCTION_TEMPLATE, WIRE_TEMPLATES } from '../src/symbols/templates.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const ARRANQUE = readFileSync(join(FIXTURES, 'arranque-paro-motor-3f.cad'), 'latin1');
const WIRE = WIRE_TEMPLATES[4000]!;
const JUNCTION = JUNCTION_TEMPLATE!;

/** LCG determinista: el fuzz debe ser reproducible. */
function rng(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function assertInvariants(text: string, step: number): void {
  assert.equal(roundTrips(text), true, `paso ${step}: round-trip byte a byte`);
  const records = buildProject(parse(text)).records;
  assert.ok(records.length > 0, `paso ${step}: quedan registros`);
  const ids = records.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, `paso ${step}: ids únicos`);
  for (let i = 1; i < ids.length; i++) {
    assert.ok(ids[i]! > ids[i - 1]!, `paso ${step}: ids estrictamente crecientes`);
  }
  // Un raw nunca contiene la cabecera de OTRO registro de cable. Si aparece, el
  // parser descartó un registro fuera de orden y lo fundió acá (corrupción).
  for (const rec of records) {
    assert.equal(
      rec.raw.slice(1).match(/\*\d+\*40(00|09|10|19)#/),
      null,
      `paso ${step}: el raw ${rec.id} absorbió un registro de cable ajeno`,
    );
  }
}

function applyRandomOperation(state: EditorState, random: () => number): EditorState {
  const net = buildNetwork(projectOf(state).records);
  const wires = [...net.segments.values()].filter((s) => s.code !== 4001 && s.code !== 0);
  const junctions = net.junctionPoints;
  const from = { x: 400 + Math.floor(random() * 8) * 3, y: 400 + Math.floor(random() * 8) * 3 };
  const to = { x: 430 + Math.floor(random() * 8) * 3, y: 430 + Math.floor(random() * 8) * 3 };
  const pick = <T,>(list: T[]): T | null => (list.length ? list[Math.floor(random() * list.length)]! : null);
  switch (Math.floor(random() * 8)) {
    case 0:
      return addWire(state, from, to, WIRE, JUNCTION);
    case 1:
      return addRoutedWire(state, from, to, [], WIRE, JUNCTION);
    case 2:
      return addJunction(state, from.x, from.y, JUNCTION);
    case 3: {
      const j = pick(junctions);
      return j ? removeJunction(state, j.recordId) : state;
    }
    case 4: {
      const w = pick(wires);
      return w ? moveSegment(state, w.id, { x: w.points.x1, y: w.points.y1 }, to) : state;
    }
    case 5: {
      const w = pick(wires);
      return w ? moveVertex(state, { x: w.points.x1, y: w.points.y1 }, to) : state;
    }
    case 6: {
      const rec = pick(wires.map((w) => projectOf(state).records.find((r) => r.id === w.id)!));
      const pts = rec ? wirePoints(rec) : null;
      return pts ? deleteVertex(state, { x: pts.x2, y: pts.y2 }) : state;
    }
    default:
      return moveSelection({ ...state, selection: [5] }, 3, 0);
  }
}

test('fuzz de 60 operaciones mantiene round-trip, ids y formato', () => {
  const random = rng(20261122);
  let state = createEditor(ARRANQUE);
  assertInvariants(state.text, 0);
  for (let i = 1; i <= 60; i++) {
    state = applyRandomOperation(state, random);
    assertInvariants(state.text, i);
  }
});

test('el mismo seed produce la misma secuencia de documentos', () => {
  const run = (): string => {
    const random = rng(777);
    let state = createEditor(ARRANQUE);
    for (let i = 0; i < 20; i++) state = applyRandomOperation(state, random);
    return state.text;
  };
  assert.equal(run(), run());
});
